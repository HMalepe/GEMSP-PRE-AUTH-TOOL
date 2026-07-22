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
import { ADMIN, AUDITOR, CLINICAL_MAINTAINER, CONSULTANT } from './helpers/auth-headers.js';
import { migrateDown, migrateUp } from './helpers/run-migrations.js';

/**
 * Technical Build Spec §7 POPIA hardening, end to end against a real
 * Postgres and a real HTTP server: RBAC per role, HIV-confidentiality
 * redaction, and audit-log immutability enforced at the database level
 * (not just by application convention).
 */

const DATABASE_URL = process.env.TEST_DATABASE_URL ?? 'postgres://postgres:postgres@127.0.0.1:5432/gems_preauth_test';

const here = path.dirname(fileURLToPath(import.meta.url));
const SEED_SQL_PATH = path.resolve(here, '../../../db/seed/001-fixture-members.sql');

describe('POPIA hardening (real DB, real fixtures)', () => {
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

  let hivAuthId: string;

  test('submitting an HIV-flagged (B20) case records created_by and is_hiv_related', async () => {
    const res = await fetch(`${baseUrl}/authorisations`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...CONSULTANT },
      body: JSON.stringify({
        memberId: 'M-0001',
        icd10Code: 'B20',
        tariffCode: 'PLACEHOLDER-GASTRO-01',
        serviceDate: '2025-06-01',
        setting: 'OUT_HOSPITAL',
      }),
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    hivAuthId = body.auth_id;

    const { rows } = await pool.query('SELECT created_by, is_hiv_related FROM auth_decision WHERE auth_id = $1', [hivAuthId]);
    assert.equal(rows[0]?.created_by, 'dr.consultant');
    assert.equal(rows[0]?.is_hiv_related, true);
  });

  test('the original submitter sees the unredacted diagnosis on their own HIV case', async () => {
    const res = await fetch(`${baseUrl}/auth-decisions/${hivAuthId}`, { headers: { ...CONSULTANT } });
    assert.equal(res.status, 200);
    const detail = await res.json();
    assert.equal(detail.is_hiv_related, true);
    assert.equal(detail.codes.icd10Code, 'B20');
    assert.ok(detail.reasons.some((r: string) => /B20/.test(r)));
  });

  test('an auditor viewing the same HIV case gets a redacted diagnosis and reasons', async () => {
    const res = await fetch(`${baseUrl}/auth-decisions/${hivAuthId}`, { headers: { ...AUDITOR } });
    assert.equal(res.status, 200);
    const detail = await res.json();
    assert.equal(detail.is_hiv_related, true, 'the restriction itself stays visible, so it reads as a restriction, not missing data');
    assert.equal(detail.codes.icd10Code, '[REDACTED]');
    assert.equal(detail.reasons.length, 1);
    assert.match(detail.reasons[0], /REDACTED/);
    assert.ok(detail.gate_results.every((g: { reason: string }) => /REDACTED/.test(g.reason)));
    // Non-clinical-text fields are unaffected — an auditor still sees the shape of the decision.
    assert.equal(detail.decision, 'APPROVE');
    assert.equal(detail.gate_results.length, 10);
  });

  test('clinical_maintainer and admin (HIV-authorised roles) see the same HIV case unredacted, even though neither submitted it', async () => {
    const asMaintainer = await (await fetch(`${baseUrl}/auth-decisions/${hivAuthId}`, { headers: { ...CLINICAL_MAINTAINER } })).json();
    assert.equal(asMaintainer.codes.icd10Code, 'B20');

    const asAdmin = await (await fetch(`${baseUrl}/auth-decisions/${hivAuthId}`, { headers: { ...ADMIN } })).json();
    assert.equal(asAdmin.codes.icd10Code, 'B20');
  });

  test('history search also redacts the diagnosis code for an unauthorised viewer', async () => {
    const results = await (await fetch(`${baseUrl}/auth-decisions?authId=${hivAuthId}`, { headers: { ...AUDITOR } })).json();
    assert.equal(results.length, 1);
    assert.equal(results[0].codes.icd10Code, '[REDACTED]');
    assert.equal(results[0].is_hiv_related, true);
  });

  test('a non-HIV decision is never redacted for anyone', async () => {
    const submit = await fetch(`${baseUrl}/authorisations`, {
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
    const { auth_id: authId } = await submit.json();

    const asAuditor = await (await fetch(`${baseUrl}/auth-decisions/${authId}`, { headers: { ...AUDITOR } })).json();
    assert.equal(asAuditor.is_hiv_related, false);
    assert.equal(asAuditor.codes.icd10Code, 'M17.1');
  });

  test('GET /audit-log requires admin or auditor', async () => {
    const asConsultant = await fetch(`${baseUrl}/audit-log`, { headers: { ...CONSULTANT } });
    assert.equal(asConsultant.status, 403);

    const asAdmin = await fetch(`${baseUrl}/audit-log`, { headers: { ...ADMIN } });
    assert.equal(asAdmin.status, 200);
  });

  test('every VIEW/SUBMIT/SEARCH on the HIV case is captured in the audit log with the correct actor', async () => {
    const entries: { actor: string; action: string; entity: string; entityId: string }[] = await (
      await fetch(`${baseUrl}/audit-log?entityId=${hivAuthId}`, { headers: { ...ADMIN } })
    ).json();

    assert.ok(entries.some((e) => e.actor === 'dr.consultant' && e.action === 'SUBMIT'));
    assert.ok(entries.some((e) => e.actor === 'dr.consultant' && e.action === 'VIEW'));
    assert.ok(entries.some((e) => e.actor === 'compliance.auditor' && e.action === 'VIEW'));
    assert.ok(entries.some((e) => e.actor === 'clin.maintainer' && e.action === 'VIEW'));
    assert.ok(entries.some((e) => e.actor === 'sys.admin' && e.action === 'VIEW'));
  });

  test('access_audit_log rejects UPDATE and DELETE at the database level, not just by application convention', async () => {
    const { rows } = await pool.query<{ id: string }>(
      `INSERT INTO access_audit_log (actor, action, entity, entity_id) VALUES ('sys.admin', 'TEST', 'test_entity', 'x') RETURNING id`,
    );
    const id = rows[0]!.id;

    await assert.rejects(
      () => pool.query(`UPDATE access_audit_log SET action = 'HACKED' WHERE id = $1`, [id]),
      /append-only/,
    );
    await assert.rejects(() => pool.query(`DELETE FROM access_audit_log WHERE id = $1`, [id]), /append-only/);
  });
});
