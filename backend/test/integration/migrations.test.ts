import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import pg from 'pg';
import { migrateDown, migrateUp } from './helpers/run-migrations.js';

const DATABASE_URL = process.env.TEST_DATABASE_URL ?? 'postgres://postgres:postgres@127.0.0.1:5432/gems_preauth_test';

const EXPECTED_TABLES = [
  'rule_version',
  'dataset_staging',
  'option',
  'member',
  'dependant',
  'dtp',
  'icd10',
  'tariff',
  'nappi',
  'modifier',
  'network_provider',
  'benefit_limit',
  'benefit_balance',
  'co_payment_rule',
  'waiting_period_rule',
  'auth_decision',
];

// Every §2.1 reference table except member/dependant (transactional, not
// rules data — see the migration's header comment).
const REFERENCE_TABLES = [
  'option',
  'dtp',
  'icd10',
  'tariff',
  'nappi',
  'modifier',
  'network_provider',
  'benefit_limit',
  'benefit_balance',
  'co_payment_rule',
  'waiting_period_rule',
];

describe('database migrations', () => {
  let client: pg.Client;

  before(async () => {
    // Start from a clean slate regardless of what a previous run left behind.
    await migrateDown(DATABASE_URL).catch(() => undefined);
    await migrateUp(DATABASE_URL);
    client = new pg.Client({ connectionString: DATABASE_URL });
    await client.connect();
  });

  after(async () => {
    await client.end();
    await migrateDown(DATABASE_URL);
  });

  test('creates every table from Technical Build Spec §2.1 plus the staging tables', async () => {
    const { rows } = await client.query<{ table_name: string }>(
      `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'`,
    );
    const tableNames = new Set(rows.map((r) => r.table_name));
    for (const table of EXPECTED_TABLES) {
      assert.ok(tableNames.has(table), `expected table ${table} to exist`);
    }
  });

  test('every reference table carries benefit_year and rule_version_id (Companion Part B.2)', async () => {
    for (const table of REFERENCE_TABLES) {
      const { rows } = await client.query<{ column_name: string }>(
        `SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1`,
        [table],
      );
      const columns = new Set(rows.map((r) => r.column_name));
      assert.ok(columns.has('benefit_year'), `${table} should have benefit_year`);
      assert.ok(columns.has('rule_version_id'), `${table} should have rule_version_id`);
    }
  });

  test('member and dependant do NOT carry benefit_year/rule_version_id (transactional, not reference data)', async () => {
    for (const table of ['member', 'dependant']) {
      const { rows } = await client.query<{ column_name: string }>(
        `SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1`,
        [table],
      );
      const columns = new Set(rows.map((r) => r.column_name));
      assert.ok(!columns.has('rule_version_id'), `${table} should NOT have rule_version_id`);
    }
  });

  test('rejects a reference row with an unknown rule_version_id (FK enforcement)', async () => {
    await assert.rejects(
      client.query(
        `INSERT INTO modifier (code, effect_rule, benefit_year, rule_version_id)
         VALUES ('0009', 'test', 2025, '00000000-0000-0000-0000-000000000000')`,
      ),
      /violates foreign key constraint/,
    );
  });

  test('rejects an invalid rule_version.status (CHECK constraint enforcement)', async () => {
    await assert.rejects(
      client.query(
        `INSERT INTO rule_version (dataset, benefit_year, effective_from, source_doc, checksum, status)
         VALUES ('test', 2025, '2025-01-01', 'test', 'test-checksum', 'NOT_A_REAL_STATUS')`,
      ),
      /violates check constraint/,
    );
  });

  test('rejects a benefit_limit row whose (option_code, benefit_year) has no matching option (composite FK)', async () => {
    const { rows } = await client.query<{ version_id: string }>(
      `INSERT INTO rule_version (dataset, benefit_year, effective_from, source_doc, checksum)
       VALUES ('option', 2025, '2025-01-01', 'test', 'test-composite-fk')
       RETURNING version_id`,
    );
    const ruleVersionId = rows[0]?.version_id;
    assert.ok(ruleVersionId);

    await client.query(
      `INSERT INTO option (option_code, name, network_type, benefit_year, rule_version_id)
       VALUES ('TEST_OPTION', 'Test Option', 'OPEN', 2025, $1)`,
      [ruleVersionId],
    );

    // benefit_year 2026 has no TEST_OPTION row in option -> composite FK must reject.
    await assert.rejects(
      client.query(
        `INSERT INTO benefit_limit (option_code, benefit_type, sub_limit, basis, benefit_year, rule_version_id)
         VALUES ('TEST_OPTION', 'SURGICAL', 1000, 'PFPA', 2026, $1)`,
        [ruleVersionId],
      ),
      /violates foreign key constraint/,
    );
  });

  test('rejects an auth_decision with a decision value outside APPROVE/DECLINE/ROUTE/NOT_REQUIRED', async () => {
    await client.query(
      `INSERT INTO member (member_id, option_code, status, join_date, prior_cover_months, dob)
       VALUES ('TEST-MEMBER-1', 'TEST_OPTION', 'ACTIVE', '2020-01-01', 12, '1990-01-01')
       ON CONFLICT (member_id) DO NOTHING`,
    );
    await assert.rejects(
      client.query(
        `INSERT INTO auth_decision (member_id, codes, decision, reasons, rules_version, caveat)
         VALUES ('TEST-MEMBER-1', '{}'::jsonb, 'MAYBE', '[]'::jsonb, '2025.1', 'test')`,
      ),
      /violates check constraint/,
    );
  });

  test('migrate down drops every table cleanly', async () => {
    await client.end();
    await migrateDown(DATABASE_URL);

    const verifyClient = new pg.Client({ connectionString: DATABASE_URL });
    await verifyClient.connect();
    const { rows } = await verifyClient.query<{ table_name: string }>(
      `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name != 'pgmigrations'`,
    );
    await verifyClient.end();

    assert.deepEqual(rows, []);

    // Restore schema so `after` hook's teardown (migrateDown + client.end) doesn't error.
    await migrateUp(DATABASE_URL);
    client = new pg.Client({ connectionString: DATABASE_URL });
    await client.connect();
  });
});
