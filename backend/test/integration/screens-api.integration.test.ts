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

/** Covers the new endpoints the consultant front-end needs (Implementation Companion Part C): autocomplete, member lookup, history search, override. */

const DATABASE_URL = process.env.TEST_DATABASE_URL ?? 'postgres://postgres:postgres@127.0.0.1:5432/gems_preauth_test';

const here = path.dirname(fileURLToPath(import.meta.url));
const SEED_SQL_PATH = path.resolve(here, '../../../db/seed/001-fixture-members.sql');

describe('Front-end support API (real DB, real fixtures)', () => {
  let pool: pg.Pool;
  let server: ReturnType<ReturnType<typeof createServer>['listen']>;
  let baseUrl: string;

  before(async () => {
    await migrateDown(DATABASE_URL).catch(() => undefined);
    await migrateUp(DATABASE_URL);

    pool = new pg.Pool({ connectionString: DATABASE_URL });
    await pool.query(await readFile(SEED_SQL_PATH, 'utf8'));

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

  test('GET /reference-data/icd10 finds by code prefix and by description', async () => {
    const byCode = await (await fetch(`${baseUrl}/reference-data/icd10?q=M17&year=2025`)).json();
    assert.ok(byCode.some((r: { code: string }) => r.code === 'M17.1'));

    const byDescription = await (await fetch(`${baseUrl}/reference-data/icd10?q=diabetes&year=2025`)).json();
    assert.ok(byDescription.some((r: { code: string }) => r.code === 'E11.9'));
    assert.equal(byDescription.find((r: { code: string }) => r.code === 'E11.9')?.isPmb, true);
  });

  test('GET /reference-data/tariff and /reference-data/nappi search', async () => {
    const tariffs = await (await fetch(`${baseUrl}/reference-data/tariff?q=HIP&year=2025`)).json();
    assert.ok(tariffs.some((r: { code: string }) => r.code === 'PLACEHOLDER-HIP-01'));

    const nappis = await (await fetch(`${baseUrl}/reference-data/nappi?q=formulary&year=2025`)).json();
    assert.ok(Array.isArray(nappis));
  });

  test('GET /reference-data/network-providers search', async () => {
    const providers = await (await fetch(`${baseUrl}/reference-data/network-providers?q=HOSP&year=2025`)).json();
    assert.ok(providers.length >= 2);
  });

  test('GET /members/:memberId auto-fills option/status for the request form', async () => {
    const res = await fetch(`${baseUrl}/members/M-0001?year=2025`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.optionCode, 'TANZANITE_ONE');
    assert.equal(body.status, 'ACTIVE');
    assert.equal(body.optionName, 'Tanzanite One');
  });

  test('GET /members/:memberId 404s for an unknown member', async () => {
    const res = await fetch(`${baseUrl}/members/NOBODY`);
    assert.equal(res.status, 404);
  });

  let approvedAuthId: string;

  test('history + evidence: submit an authorisation, then find it by member, code, and auth id', async () => {
    const submit = await fetch(`${baseUrl}/authorisations`, {
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
    const decision = await submit.json();
    approvedAuthId = decision.auth_id;

    const byMember = await (await fetch(`${baseUrl}/auth-decisions?memberId=M-0001`)).json();
    assert.ok(byMember.some((r: { auth_id: string }) => r.auth_id === approvedAuthId));

    const byCode = await (await fetch(`${baseUrl}/auth-decisions?code=M17.1`)).json();
    assert.ok(byCode.some((r: { auth_id: string }) => r.auth_id === approvedAuthId));

    const byAuthId = await (await fetch(`${baseUrl}/auth-decisions?authId=${approvedAuthId}`)).json();
    assert.equal(byAuthId.length, 1);
  });

  test('GET /auth-decisions/:authId returns the full decision object with gate_results pass/fail markers', async () => {
    const res = await fetch(`${baseUrl}/auth-decisions/${approvedAuthId}`);
    assert.equal(res.status, 200);
    const detail = await res.json();

    assert.equal(detail.decision, 'APPROVE');
    assert.equal(typeof detail.rules_version, 'string');
    assert.ok(Array.isArray(detail.gate_results) && detail.gate_results.length === 10, 'all 10 gates ran');
    assert.ok(detail.gate_results.every((g: { passed: boolean }) => g.passed === true), 'a clean approve passes every gate');
    assert.equal(detail.gate_results[0].gate_number, 0);
    assert.equal(detail.overrides.length, 0);
    assert.equal(detail.review_outcome, null);
  });

  test('POST /auth-decisions/:authId/override requires overriddenBy and reason', async () => {
    const res = await fetch(`${baseUrl}/auth-decisions/${approvedAuthId}/override`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    });
    assert.equal(res.status, 400);
  });

  test('POST /auth-decisions/:authId/override records the override, visible on the detail view', async () => {
    const res = await fetch(`${baseUrl}/auth-decisions/${approvedAuthId}/override`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ overriddenBy: 'dr.consultant', reason: 'member disputes the funding source, escalating' }),
    });
    assert.equal(res.status, 200);

    const detail = await (await fetch(`${baseUrl}/auth-decisions/${approvedAuthId}`)).json();
    assert.equal(detail.overrides.length, 1);
    assert.equal(detail.overrides[0].overridden_by, 'dr.consultant');
  });

  test('POST /auth-decisions/:authId/override 404s for an unknown auth id', async () => {
    const res = await fetch(`${baseUrl}/auth-decisions/00000000-0000-0000-0000-000000000000/override`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ overriddenBy: 'x', reason: 'y' }),
    });
    assert.equal(res.status, 404);
  });
});
