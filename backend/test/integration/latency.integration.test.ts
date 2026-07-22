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
import { CONSULTANT } from './helpers/auth-headers.js';
import { migrateDown, migrateUp } from './helpers/run-migrations.js';

/**
 * Technical Build Spec §6 NFR: "Layer-A decision < 500ms p95 (in-memory
 * reference data)". Exercised through the real HTTP server, real
 * Postgres, and the real gate sequence — not a microbenchmark of the
 * pure engine functions alone, which would trivially be sub-millisecond
 * and wouldn't prove anything about the reference-data cache actually
 * carrying its weight (engine/reference-cache.ts).
 *
 * A handful of warmup requests populate the cache first (the very first
 * request for a benefit year always pays the nine-query cache-miss cost —
 * that one-time cost is not what the NFR is about). The measured sample
 * is all cache hits from then on, same as sustained real traffic.
 */

const DATABASE_URL = process.env.TEST_DATABASE_URL ?? 'postgres://postgres:postgres@127.0.0.1:5432/gems_preauth_test';

const here = path.dirname(fileURLToPath(import.meta.url));
const SEED_SQL_PATH = path.resolve(here, '../../../db/seed/001-fixture-members.sql');

function percentile(sortedMs: number[], p: number): number {
  const index = Math.min(sortedMs.length - 1, Math.ceil((p / 100) * sortedMs.length) - 1);
  return sortedMs[Math.max(0, index)]!;
}

describe('Layer A latency (real DB, real HTTP server, cached reference data)', () => {
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

    const app = createServer({ port: 0, databaseUrl: DATABASE_URL, dbEncryptionKey: 'test-encryption-key' }, pool);
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

  test('p95 decision latency is under 500ms once the reference cache is warm', async () => {
    const submit = () =>
      fetch(`${baseUrl}/authorisations`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...CONSULTANT },
        body: JSON.stringify({
          memberId: 'M-0001',
          icd10Code: 'M17.1',
          tariffCode: 'PLACEHOLDER-HIP-01',
          practiceNo: 'PLACEHOLDER-HOSP-001',
          serviceDate: '2025-06-01',
          setting: 'IN_HOSPITAL',
        }),
      });

    const WARMUP = 5;
    const SAMPLE = 50;

    for (let i = 0; i < WARMUP; i += 1) {
      const res = await submit();
      assert.equal(res.status, 200);
    }

    const durationsMs: number[] = [];
    for (let i = 0; i < SAMPLE; i += 1) {
      const start = process.hrtime.bigint();
      const res = await submit();
      const durationMs = Number(process.hrtime.bigint() - start) / 1_000_000;
      assert.equal(res.status, 200);
      durationsMs.push(durationMs);
    }

    durationsMs.sort((a, b) => a - b);
    const p50 = percentile(durationsMs, 50);
    const p95 = percentile(durationsMs, 95);
    console.log(`Layer A decision latency (n=${SAMPLE}, warm cache): p50=${p50.toFixed(1)}ms p95=${p95.toFixed(1)}ms max=${durationsMs[durationsMs.length - 1]!.toFixed(1)}ms`);

    assert.ok(p95 < 500, `p95 latency ${p95.toFixed(1)}ms exceeds the 500ms NFR (Technical Build Spec §6)`);
  });

  test('a cold benefit-year cache miss still completes well within a consultant-facing timeout', async () => {
    // A different benefit year forces exactly one cache miss (nine
    // reference-table queries) before this request can proceed — the
    // worst case the NFR's "in-memory reference data" caveat exists for.
    const start = process.hrtime.bigint();
    const res = await fetch(`${baseUrl}/authorisations`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...CONSULTANT },
      body: JSON.stringify({
        memberId: 'M-0001',
        icd10Code: 'M17.1',
        tariffCode: 'PLACEHOLDER-HIP-01',
        practiceNo: 'PLACEHOLDER-HOSP-001',
        serviceDate: '2026-06-01',
        setting: 'IN_HOSPITAL',
      }),
    });
    const durationMs = Number(process.hrtime.bigint() - start) / 1_000_000;
    // 2026 has no promoted data, so this 404s (MEMBER_NOT_FOUND is not the
    // issue — OPTION_NOT_FOUND for benefit year 2026) — the point here is
    // purely that a cold cache miss doesn't blow past a sane timeout, not
    // the decision outcome itself.
    assert.ok(res.status === 404 || res.status === 200);
    assert.ok(durationMs < 2000, `a cold cache miss took ${durationMs.toFixed(1)}ms — unreasonably slow even for a one-time cost`);
  });
});
