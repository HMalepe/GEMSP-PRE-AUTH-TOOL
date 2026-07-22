import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import type { AddressInfo } from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { after, before, describe, test } from 'node:test';
import pg from 'pg';
import { createServer } from '../../src/api/server.js';
import type { ExtractionResult, LlmClient } from '../../src/triage/llm-client.js';
import { loadBenefitBalanceFixtures } from '../../src/ingestion/loaders/benefit-balance.js';
import { loadBenefitLimitFixtures } from '../../src/ingestion/loaders/benefit-limit.js';
import { loadCoPaymentRuleFixtures } from '../../src/ingestion/loaders/co-payment-rule.js';
import { loadDtpFixtures } from '../../src/ingestion/loaders/dtp.js';
import { loadIcd10Fixtures } from '../../src/ingestion/loaders/icd10.js';
import { loadModifierFixtures } from '../../src/ingestion/loaders/modifier.js';
import { loadNappiFixtures } from '../../src/ingestion/loaders/nappi.js';
import { loadNetworkProviderFixtures } from '../../src/ingestion/loaders/network-provider.js';
import { loadOptionFixtures } from '../../src/ingestion/loaders/option.js';
import { loadTariffFixtures } from '../../src/ingestion/loaders/tariff.js';
import { loadWaitingPeriodRuleFixtures } from '../../src/ingestion/loaders/waiting-period-rule.js';
import { migrateDown, migrateUp } from './helpers/run-migrations.js';

/**
 * End-to-end Layer B: a routed case gets motivation text, a fake
 * private-inference LlmClient stands in for a real on-prem endpoint,
 * triage runs (auto-trigger and manual retry), the suggestion surfaces on
 * the review queue item, and — once a human resolves it — the pairing
 * shows up in the training-data export with the correct agreement flag.
 * Never exercises anything that would let Layer B write a decision itself.
 */

const DATABASE_URL = process.env.TEST_DATABASE_URL ?? 'postgres://postgres:postgres@127.0.0.1:5432/gems_preauth_test';

const here = path.dirname(fileURLToPath(import.meta.url));
const SEED_SQL_PATH = path.resolve(here, '../../../db/seed/001-fixture-members.sql');

class FakeLlmClient implements LlmClient {
  constructor(private readonly result: ExtractionResult) {}
  async extract(): Promise<ExtractionResult> {
    return this.result;
  }
}

const HIGH_CONFIDENCE_RESULT: ExtractionResult = {
  confidence: 0.95,
  recommendedAction: 'APPROVED',
  extractedEvidence: {
    summary: 'Motivation supports off-protocol use after documented first-line failure.',
    keyFindings: ['prior line failed', 'contraindication to formulary option'],
    concerns: [],
  },
  modelIdentifier: 'fake-private-model-v1',
  endpointType: 'PRIVATE',
};

const LOW_CONFIDENCE_RESULT: ExtractionResult = {
  confidence: 0.4,
  recommendedAction: 'APPROVED',
  extractedEvidence: { summary: 'Ambiguous motivation text.', keyFindings: [], concerns: ['insufficient detail'] },
  modelIdentifier: 'fake-private-model-v1',
  endpointType: 'PRIVATE',
};

async function loadAllFixtures(pool: pg.Pool): Promise<void> {
  for (const load of [
    () => loadOptionFixtures(pool, 2025),
    () => loadDtpFixtures(pool, 2025),
    () => loadIcd10Fixtures(pool, 2025),
    () => loadTariffFixtures(pool, 2025),
    () => loadNappiFixtures(pool, 2025),
    () => loadModifierFixtures(pool, 2025),
    () => loadNetworkProviderFixtures(pool, 2025),
    () => loadBenefitLimitFixtures(pool, 2025),
    () => loadCoPaymentRuleFixtures(pool, 2025),
    () => loadWaitingPeriodRuleFixtures(pool, 2025),
    () => loadBenefitBalanceFixtures(pool, 2025),
  ]) {
    await load();
  }
}

async function startServer(pool: pg.Pool, llmClient?: LlmClient) {
  const app = createServer({ port: 0, databaseUrl: DATABASE_URL }, pool, llmClient);
  const server = app.listen(0);
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const { port } = server.address() as AddressInfo;
  return { server, baseUrl: `http://127.0.0.1:${port}` };
}

async function submitRoutedCase(baseUrl: string, memberId: string, motivationText?: string): Promise<string> {
  const res = await fetch(`${baseUrl}/authorisations`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      memberId,
      icd10Code: 'NOT-A-REAL-CODE',
      tariffCode: 'PLACEHOLDER-GASTRO-01',
      serviceDate: '2025-06-01',
      setting: 'OUT_HOSPITAL',
      ...(motivationText ? { motivationText } : {}),
    }),
  });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.decision, 'ROUTE');
  return body.auth_id;
}

async function pollForSuggestion(baseUrl: string, authId: string, attempts = 20): Promise<{ layerBSuggestion?: unknown }> {
  for (let i = 0; i < attempts; i += 1) {
    const item = await (await fetch(`${baseUrl}/review-queue/${authId}`)).json();
    if (item.layerBSuggestion) {
      return item;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`layerBSuggestion never appeared on ${authId} after ${attempts} polls`);
}

describe('Layer B triage (real DB, fake private-inference LlmClient)', () => {
  let pool: pg.Pool;

  before(async () => {
    await migrateDown(DATABASE_URL).catch(() => undefined);
    await migrateUp(DATABASE_URL);
    pool = new pg.Pool({ connectionString: DATABASE_URL });
    await pool.query(await readFile(SEED_SQL_PATH, 'utf8'));
    await loadAllFixtures(pool);
  });

  after(async () => {
    await pool.end();
    await migrateDown(DATABASE_URL);
  });

  test('auto-trigger: a ROUTEd case with motivation text gets a Layer B suggestion without any manual call', async () => {
    const { server, baseUrl } = await startServer(pool, new FakeLlmClient(HIGH_CONFIDENCE_RESULT));
    try {
      const authId = await submitRoutedCase(baseUrl, 'M-0002', 'Prior formulary option failed after 3 months; specialist recommends off-protocol agent.');
      const item = await pollForSuggestion(baseUrl, authId);
      const suggestion = item.layerBSuggestion as {
        confidence: number;
        recommendedAction: string | null;
        endpointType: string;
        modelIdentifier: string;
      };
      assert.equal(suggestion.confidence, 0.95);
      assert.equal(suggestion.recommendedAction, 'APPROVED');
      assert.equal(suggestion.endpointType, 'PRIVATE');
      assert.equal(suggestion.modelIdentifier, 'fake-private-model-v1');
    } finally {
      await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
    }
  });

  test('confidence gate: a low-confidence extraction stores evidence but withholds the recommendation', async () => {
    const { server, baseUrl } = await startServer(pool, new FakeLlmClient(LOW_CONFIDENCE_RESULT));
    try {
      const authId = await submitRoutedCase(baseUrl, 'M-0002', 'Vague motivation text with little clinical detail.');
      const item = await pollForSuggestion(baseUrl, authId);
      const suggestion = item.layerBSuggestion as { confidence: number; recommendedAction: string | null };
      assert.equal(suggestion.confidence, 0.4);
      assert.equal(suggestion.recommendedAction, null, 'below the 0.9 threshold, no recommendation should be surfaced');
    } finally {
      await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
    }
  });

  test('manual trigger endpoint runs triage on demand and rejects cases it cannot process', async () => {
    const { server, baseUrl } = await startServer(pool, new FakeLlmClient(HIGH_CONFIDENCE_RESULT));
    try {
      // Not routed at all (a clean approve).
      const approveRes = await fetch(`${baseUrl}/authorisations`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          memberId: 'M-0001',
          icd10Code: 'M17.1',
          tariffCode: 'PLACEHOLDER-HIP-01',
          practiceNo: 'PLACEHOLDER-HOSP-001',
          serviceDate: '2025-06-01',
          setting: 'IN_HOSPITAL',
        }),
      });
      const approveBody = await approveRes.json();
      assert.equal(approveBody.decision, 'APPROVE');
      const notRoutedRes = await fetch(`${baseUrl}/review-queue/${approveBody.auth_id}/triage`, { method: 'POST' });
      assert.equal(notRoutedRes.status, 400);
      const notRoutedBody = await notRoutedRes.json();
      assert.equal(notRoutedBody.code, 'NOT_ROUTED');

      // Routed but no motivation text attached.
      const routedNoTextAuthId = await submitRoutedCase(baseUrl, 'M-0002');
      const noTextRes = await fetch(`${baseUrl}/review-queue/${routedNoTextAuthId}/triage`, { method: 'POST' });
      assert.equal(noTextRes.status, 400);
      const noTextBody = await noTextRes.json();
      assert.equal(noTextBody.code, 'NO_MOTIVATION_TEXT');

      // Unknown auth id entirely.
      const unknownRes = await fetch(`${baseUrl}/review-queue/00000000-0000-0000-0000-000000000000/triage`, { method: 'POST' });
      assert.equal(unknownRes.status, 404);

      // A valid manual retrigger succeeds and matches the fake client's result.
      const routedWithTextAuthId = await submitRoutedCase(baseUrl, 'M-0002', 'Specialist motivation letter attached.');
      const manualRes = await fetch(`${baseUrl}/review-queue/${routedWithTextAuthId}/triage`, { method: 'POST' });
      assert.equal(manualRes.status, 200);
      const manualBody = await manualRes.json();
      assert.equal(manualBody.recommendedAction, 'APPROVED');
    } finally {
      await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
    }
  });

  test('manual trigger endpoint returns 503 when Layer B has no LLM endpoint configured', async () => {
    const { server, baseUrl } = await startServer(pool, undefined);
    try {
      const authId = await submitRoutedCase(baseUrl, 'M-0002', 'Some motivation text.');
      const res = await fetch(`${baseUrl}/review-queue/${authId}/triage`, { method: 'POST' });
      assert.equal(res.status, 503);
    } finally {
      await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
    }
  });

  test('never auto-approves: the suggestion is advisory only until a human resolves the case', async () => {
    const { server, baseUrl } = await startServer(pool, new FakeLlmClient(HIGH_CONFIDENCE_RESULT));
    try {
      const authId = await submitRoutedCase(baseUrl, 'M-0002', 'Motivation letter attached.');
      await pollForSuggestion(baseUrl, authId);

      // Still sitting on the pending queue — Layer B's suggestion did not resolve it.
      const queue = await (await fetch(`${baseUrl}/review-queue`)).json();
      assert.ok(queue.some((i: { authId: string }) => i.authId === authId));

      const { rows } = await pool.query('SELECT decision FROM auth_decision WHERE auth_id = $1', [authId]);
      assert.equal(rows[0]?.decision, 'ROUTE', 'Layer B must never rewrite the Layer-A decision');
    } finally {
      await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
    }
  });

  test('training-data export: a human decision on a routed case becomes a labelled example with correct agreement', async () => {
    const { server, baseUrl } = await startServer(pool, new FakeLlmClient(HIGH_CONFIDENCE_RESULT));
    try {
      const authId = await submitRoutedCase(baseUrl, 'M-0002', 'Motivation letter attached, agrees with Layer B.');
      await pollForSuggestion(baseUrl, authId);

      const resolveRes = await fetch(`${baseUrl}/review-queue/${authId}/resolve`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ reviewer: 'a.reviewer', outcome: 'APPROVED', reason: 'motivation letter checks out, agrees with AI-assisted summary' }),
      });
      assert.equal(resolveRes.status, 200);

      const training = await (await fetch(`${baseUrl}/training-data`)).json();
      const example = training.find((e: { authId: string }) => e.authId === authId);
      assert.ok(example, 'resolved routed case must appear in the training-data export');
      assert.equal(example.suggestionRecommendedAction, 'APPROVED');
      assert.equal(example.humanOutcome, 'APPROVED');
      assert.equal(example.agreement, true);

      // A second case where the human disagrees with Layer B.
      const disagreeAuthId = await submitRoutedCase(baseUrl, 'M-0002', 'Motivation letter attached, human will disagree.');
      await pollForSuggestion(baseUrl, disagreeAuthId);
      await fetch(`${baseUrl}/review-queue/${disagreeAuthId}/resolve`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ reviewer: 'a.reviewer', outcome: 'DECLINED', reason: 'motivation letter does not hold up on manual review' }),
      });
      const training2 = await (await fetch(`${baseUrl}/training-data`)).json();
      const disagreeExample = training2.find((e: { authId: string }) => e.authId === disagreeAuthId);
      assert.equal(disagreeExample.agreement, false);

      // A resolved routed case with no Layer B suggestion at all — still logged, agreement is null.
      const noSuggestionAuthId = await submitRoutedCase(baseUrl, 'M-0002');
      await fetch(`${baseUrl}/review-queue/${noSuggestionAuthId}/resolve`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ reviewer: 'a.reviewer', outcome: 'MORE_INFO_REQUESTED', reason: 'no motivation text was ever attached' }),
      });
      const training3 = await (await fetch(`${baseUrl}/training-data`)).json();
      const noSuggestionExample = training3.find((e: { authId: string }) => e.authId === noSuggestionAuthId);
      assert.ok(noSuggestionExample);
      assert.equal(noSuggestionExample.agreement, null);
      assert.equal(noSuggestionExample.suggestionRecommendedAction, null);
    } finally {
      await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
    }
  });
});
