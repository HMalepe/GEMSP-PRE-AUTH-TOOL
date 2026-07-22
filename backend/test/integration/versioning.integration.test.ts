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
import { CO_PAYMENT_RULE_DEFINITION, loadCoPaymentRuleFixtures } from '../../src/ingestion/loaders/co-payment-rule.js';
import { loadDtpFixtures } from '../../src/ingestion/loaders/dtp.js';
import { loadIcd10Fixtures } from '../../src/ingestion/loaders/icd10.js';
import { loadModifierFixtures } from '../../src/ingestion/loaders/modifier.js';
import { loadNappiFixtures } from '../../src/ingestion/loaders/nappi.js';
import { loadNetworkProviderFixtures } from '../../src/ingestion/loaders/network-provider.js';
import { loadOptionFixtures } from '../../src/ingestion/loaders/option.js';
import { loadTariffFixtures } from '../../src/ingestion/loaders/tariff.js';
import { loadWaitingPeriodRuleFixtures } from '../../src/ingestion/loaders/waiting-period-rule.js';
import { createRuleVersion, markHumanVerified, promoteRuleVersion, rollbackRuleVersion, stageRows, validateRuleVersion } from '../../src/ingestion/pipeline.js';
import { CONSULTANT } from './helpers/auth-headers.js';
import { migrateDown, migrateUp } from './helpers/run-migrations.js';

/**
 * Technical Build Spec §3.2 / §6 "Rule updates": proves, end to end
 * against a real running server, that (a) a brand-new benefit year's
 * dataset loads and promotes through the existing pipeline with zero
 * source-file changes, and (b) a bad load can be rolled back to the
 * prior RuleVersion in one operation, with the running process picking
 * both changes up immediately (no restart) via engine/reference-cache.ts's
 * invalidateBenefitYear() hook.
 *
 * Step (a) uses the standard fixture loaders unmodified — the same
 * loadOptionFixtures/loadIcd10Fixtures/etc. already shipped for 2025,
 * just called for benefitYear=2026. Step (b) bypasses the fixture-only
 * loadFixtureDataset convenience wrapper and drives the pipeline's
 * generic primitives directly (createRuleVersion -> stageRows ->
 * validateRuleVersion -> markHumanVerified -> promoteRuleVersion /
 * rollbackRuleVersion) — dataset.ts's own docs (see loadFixtureDataset's
 * comment) prescribe exactly this sequence for a real, non-fixture load,
 * so this test doubles as the runbook procedure it documents.
 */

const DATABASE_URL = process.env.TEST_DATABASE_URL ?? 'postgres://postgres:postgres@127.0.0.1:5432/gems_preauth_test';

const here = path.dirname(fileURLToPath(import.meta.url));
const SEED_SQL_PATH = path.resolve(here, '../../../db/seed/001-fixture-members.sql');

async function submitNonNetworkTanzaniteRequest(baseUrl: string, serviceDate: string) {
  return fetch(`${baseUrl}/authorisations`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...CONSULTANT },
    body: JSON.stringify({
      memberId: 'M-0001',
      icd10Code: 'M17.1',
      tariffCode: 'PLACEHOLDER-HIP-01',
      // No practiceNo -> Gate 6 treats this as non-network, triggering the NON_NETWORK_HOSPITAL co-payment.
      serviceDate,
      setting: 'IN_HOSPITAL',
    }),
  });
}

describe('Rule/data versioning (real DB, real running server, no code redeploy)', () => {
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

  let rulesVersion2025: string;

  test('2025 traffic uses the 2025-promoted co-payment figure (R15,000 non-network)', async () => {
    const res = await submitNonNetworkTanzaniteRequest(baseUrl, '2025-06-01');
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.co_payment.amount, 15000);
    rulesVersion2025 = body.rules_version;
  });

  test('a brand-new 2026 benefit year loads and promotes through the unmodified standard loaders — no source file touched', async () => {
    for (const load of [
      () => loadOptionFixtures(pool, 2026),
      () => loadDtpFixtures(pool, 2026),
      () => loadIcd10Fixtures(pool, 2026),
      () => loadTariffFixtures(pool, 2026),
      () => loadNappiFixtures(pool, 2026),
      () => loadModifierFixtures(pool, 2026),
      () => loadNetworkProviderFixtures(pool, 2026),
      () => loadBenefitLimitFixtures(pool, 2026),
      () => loadCoPaymentRuleFixtures(pool, 2026),
      () => loadWaitingPeriodRuleFixtures(pool, 2026),
      () => loadBenefitBalanceFixtures(pool, 2026),
    ]) {
      await load();
    }

    // The already-running server (no restart) resolves the new year
    // correctly, and 2025 traffic is completely unaffected by it.
    const res2026 = await submitNonNetworkTanzaniteRequest(baseUrl, '2026-06-01');
    assert.equal(res2026.status, 200);
    const body2026 = await res2026.json();
    assert.equal(body2026.co_payment.amount, 15000, 'same fixture content, freshly promoted under benefit_year 2026');
    assert.match(body2026.rules_version, /^2026\./);

    const res2025 = await submitNonNetworkTanzaniteRequest(baseUrl, '2025-06-01');
    const body2025 = await res2025.json();
    assert.equal(body2025.rules_version, rulesVersion2025, '2025 data and rules_version are untouched by the 2026 load');
  });

  let goodVersionId: string;
  let badVersionId: string;

  test('the annual co-payment refresh promotes a corrected 2026 rate through the pipeline primitives directly', async () => {
    const correctedRow = { trigger_code: 'NON_NETWORK_HOSPITAL', option_code: 'TANZANITE_ONE', amount_or_pct: 16500, basis: 'AMOUNT' };

    goodVersionId = await createRuleVersion(pool, {
      dataset: 'co_payment_rule',
      benefitYear: 2026,
      effectiveFrom: '2026-01-01',
      sourceDoc: 'TEST — simulated corrected 2026 annexure reload',
      checksum: 'test-versioning-2026-corrected',
    });
    await stageRows(pool, goodVersionId, 'co_payment_rule', [
      { rowKey: CO_PAYMENT_RULE_DEFINITION.rowKey(correctedRow), payload: correctedRow },
    ]);
    const validation = await validateRuleVersion(pool, goodVersionId, CO_PAYMENT_RULE_DEFINITION.validateRow);
    assert.equal(validation.invalidRows, 0);
    await markHumanVerified(pool, goodVersionId, 'clin.maintainer');
    const promotedRows = await promoteRuleVersion(pool, {
      ruleVersionId: goodVersionId,
      targetTable: CO_PAYMENT_RULE_DEFINITION.targetTable,
      columns: CO_PAYMENT_RULE_DEFINITION.columns,
      benefitYear: 2026,
    });
    assert.equal(promotedRows, 1);

    // No redeploy, no restart — the already-running server sees the new figure on the very next request.
    const res = await submitNonNetworkTanzaniteRequest(baseUrl, '2026-06-01');
    const body = await res.json();
    assert.equal(body.co_payment.amount, 16500);
  });

  test('a bad load (data-entry error) is caught after promotion and rolled back to the prior RuleVersion in one operation', async () => {
    const badRow = { trigger_code: 'NON_NETWORK_HOSPITAL', option_code: 'TANZANITE_ONE', amount_or_pct: 999999, basis: 'AMOUNT' };

    badVersionId = await createRuleVersion(pool, {
      dataset: 'co_payment_rule',
      benefitYear: 2026,
      effectiveFrom: '2026-01-01',
      sourceDoc: 'TEST — simulated bad reload (data-entry error)',
      checksum: 'test-versioning-2026-bad',
    });
    await stageRows(pool, badVersionId, 'co_payment_rule', [
      { rowKey: CO_PAYMENT_RULE_DEFINITION.rowKey(badRow), payload: badRow },
    ]);
    await validateRuleVersion(pool, badVersionId, CO_PAYMENT_RULE_DEFINITION.validateRow);
    await markHumanVerified(pool, badVersionId, 'clin.maintainer');
    await promoteRuleVersion(pool, {
      ruleVersionId: badVersionId,
      targetTable: CO_PAYMENT_RULE_DEFINITION.targetTable,
      columns: CO_PAYMENT_RULE_DEFINITION.columns,
      benefitYear: 2026,
    });

    // The bad figure is live — this is the moment someone notices.
    const badRes = await submitNonNetworkTanzaniteRequest(baseUrl, '2026-06-01');
    const badBody = await badRes.json();
    assert.equal(badBody.co_payment.amount, 999999);

    // One operation restores the prior (corrected) version.
    const restoredRows = await rollbackRuleVersion(pool, {
      targetTable: CO_PAYMENT_RULE_DEFINITION.targetTable,
      columns: CO_PAYMENT_RULE_DEFINITION.columns,
      benefitYear: 2026,
      fromRuleVersionId: badVersionId,
      toRuleVersionId: goodVersionId,
    });
    assert.equal(restoredRows, 1);

    const { rows: statuses } = await pool.query<{ version_id: string; status: string }>(
      'SELECT version_id, status FROM rule_version WHERE version_id = ANY($1::uuid[])',
      [[badVersionId, goodVersionId]],
    );
    assert.equal(statuses.find((s) => s.version_id === badVersionId)?.status, 'ROLLED_BACK');
    assert.equal(statuses.find((s) => s.version_id === goodVersionId)?.status, 'PROMOTED');

    // The already-running server reflects the rollback immediately.
    const afterRollbackRes = await submitNonNetworkTanzaniteRequest(baseUrl, '2026-06-01');
    const afterRollbackBody = await afterRollbackRes.json();
    assert.equal(afterRollbackBody.co_payment.amount, 16500, 'reverted to the last known-good figure');
  });
});
