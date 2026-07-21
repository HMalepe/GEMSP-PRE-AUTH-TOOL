import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import type { AddressInfo } from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { after, before, describe, test } from 'node:test';
import pg from 'pg';
import { createServer } from '../../src/api/server.js';
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
 * End-to-end: real Postgres, real migrations, real fixture loaders, a
 * real HTTP server — POST /authorisations exercised the same way a
 * consultant's browser would, through resolve-reference-data.ts and the
 * actual gate sequence, not a mock. Also covers the Layer B review queue
 * lifecycle (route -> list -> resolve -> no longer listed).
 */

const DATABASE_URL = process.env.TEST_DATABASE_URL ?? 'postgres://postgres:postgres@127.0.0.1:5432/gems_preauth_test';

const here = path.dirname(fileURLToPath(import.meta.url));
const SEED_SQL_PATH = path.resolve(here, '../../../db/seed/001-fixture-members.sql');

describe('API integration (real DB, real fixtures)', () => {
  let pool: pg.Pool;
  let server: ReturnType<ReturnType<typeof createServer>['listen']>;
  let baseUrl: string;

  before(async () => {
    await migrateDown(DATABASE_URL).catch(() => undefined);
    await migrateUp(DATABASE_URL);

    pool = new pg.Pool({ connectionString: DATABASE_URL });

    const seedSql = await readFile(SEED_SQL_PATH, 'utf8');
    await pool.query(seedSql);

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

    const app = createServer({ port: 0, databaseUrl: DATABASE_URL }, pool);
    server = app.listen(0);
    await new Promise<void>((resolve) => server.once('listening', resolve));
    const { port } = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${port}`;
  });

  after(async () => {
    await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
    await pool.end();
    await migrateDown(DATABASE_URL);
  });

  test('POST /authorisations approves a clean in-network request and persists it', async () => {
    const res = await fetch(`${baseUrl}/authorisations`, {
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

    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.decision, 'APPROVE');
    assert.equal(body.funding_source, 'DAY_TO_DAY');
    assert.equal(body.co_payment, null);
    assert.match(body.rules_version, /^2025\.[0-9a-f]{8}$/);

    const { rows } = await pool.query('SELECT decision, member_id FROM auth_decision WHERE auth_id = $1', [body.auth_id]);
    assert.equal(rows[0]?.decision, 'APPROVE');
    assert.equal(rows[0]?.member_id, 'M-0001');
  });

  test('POST /authorisations for an unknown member returns 404', async () => {
    const res = await fetch(`${baseUrl}/authorisations`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        memberId: 'NOT-A-MEMBER',
        icd10Code: 'M17.1',
        tariffCode: 'PLACEHOLDER-HIP-01',
        serviceDate: '2025-06-01',
        setting: 'IN_HOSPITAL',
      }),
    });
    assert.equal(res.status, 404);
    const body = await res.json();
    assert.equal(body.code, 'MEMBER_NOT_FOUND');
  });

  test('POST /authorisations rejects an invalid body with 400', async () => {
    const res = await fetch(`${baseUrl}/authorisations`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ memberId: 'M-0001' }),
    });
    assert.equal(res.status, 400);
  });

  let routedAuthId: string;

  test('POST /authorisations routes an unresolvable ICD-10 code, and it lands on the review queue', async () => {
    const res = await fetch(`${baseUrl}/authorisations`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        memberId: 'M-0002',
        icd10Code: 'NOT-A-REAL-CODE',
        tariffCode: 'PLACEHOLDER-GASTRO-01',
        serviceDate: '2025-06-01',
        setting: 'OUT_HOSPITAL',
      }),
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.decision, 'ROUTE');
    routedAuthId = body.auth_id;

    const queueRes = await fetch(`${baseUrl}/review-queue`);
    const queue = await queueRes.json();
    assert.ok(queue.some((item: { authId: string }) => item.authId === routedAuthId));
  });

  test('GET /review-queue/:authId returns the routed item with evidence', async () => {
    const res = await fetch(`${baseUrl}/review-queue/${routedAuthId}`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.authId, routedAuthId);
    assert.ok(Array.isArray(body.reasons) && body.reasons.length > 0);
  });

  test('POST /review-queue/:authId/resolve requires a reason', async () => {
    const res = await fetch(`${baseUrl}/review-queue/${routedAuthId}/resolve`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ reviewer: 'a.reviewer', outcome: 'APPROVED' }),
    });
    assert.equal(res.status, 400);
  });

  test('POST /review-queue/:authId/resolve records the outcome and removes it from the queue', async () => {
    const res = await fetch(`${baseUrl}/review-queue/${routedAuthId}/resolve`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ reviewer: 'a.reviewer', outcome: 'APPROVED', reason: 'diagnosis confirmed via motivation letter' }),
    });
    assert.equal(res.status, 200);

    const queueRes = await fetch(`${baseUrl}/review-queue`);
    const queue = await queueRes.json();
    assert.ok(!queue.some((item: { authId: string }) => item.authId === routedAuthId));

    const itemRes = await fetch(`${baseUrl}/review-queue/${routedAuthId}`);
    assert.equal(itemRes.status, 404, 'resolved items are no longer "pending"');
  });

  test('POST /review-queue/:authId/resolve on an already-resolved item fails', async () => {
    const res = await fetch(`${baseUrl}/review-queue/${routedAuthId}/resolve`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ reviewer: 'a.reviewer', outcome: 'APPROVED', reason: 'duplicate resolve attempt' }),
    });
    assert.equal(res.status, 404);
  });
});
