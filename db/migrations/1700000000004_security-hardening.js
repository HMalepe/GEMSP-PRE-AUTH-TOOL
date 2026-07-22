/**
 * Security & POPIA hardening (Technical Build Spec §7): role-based access
 * control, an immutable access audit trail, and the HIV-confidentiality
 * flag that Screen 2/5 redaction (backend/src/security/redact.ts) checks.
 *
 * app_user is operational identity data, not reference/rules data — like
 * member/dependant it carries no benefit_year or rule_version_id and never
 * goes through the staging pipeline.
 *
 * access_audit_log is genuinely immutable: the trigger below rejects any
 * UPDATE or DELETE at the database level, not just by application
 * convention (contrast with auth_decision, which is "immutable by
 * convention" only — this table can't be, given what it exists to prove).
 */

exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.sql(`
    -- Named accounts only, no shared logins (§7 Access control). Seeded
    -- with illustrative demo accounts, one per role — same PLACEHOLDER
    -- convention as the fixture loaders; a real deployment replaces these
    -- via whatever provisions accounts from the SSO directory.
    CREATE TABLE app_user (
      user_id      TEXT PRIMARY KEY,
      name         TEXT NOT NULL,
      role         TEXT NOT NULL CHECK (role IN ('consultant', 'clinical_maintainer', 'admin', 'auditor')),
      active       BOOLEAN NOT NULL DEFAULT true,
      created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    INSERT INTO app_user (user_id, name, role) VALUES
      ('dr.consultant', 'Dr. Consultant (demo account)', 'consultant'),
      ('clin.maintainer', 'Clinical Maintainer (demo account)', 'clinical_maintainer'),
      ('sys.admin', 'System Admin (demo account)', 'admin'),
      ('compliance.auditor', 'Compliance Auditor (demo account)', 'auditor');

    -- "Who viewed/decided what, when — immutable and retained per policy"
    -- (§7 Audit trail). actor is FK'd to a named account on purpose: an
    -- audit entry that can't be traced to a real account is worthless.
    CREATE TABLE access_audit_log (
      id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      actor        TEXT NOT NULL REFERENCES app_user (user_id),
      action       TEXT NOT NULL,
      entity       TEXT NOT NULL,
      entity_id    TEXT NOT NULL,
      detail       JSONB NOT NULL DEFAULT '{}',
      created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX access_audit_log_entity_idx ON access_audit_log (entity, entity_id);
    CREATE INDEX access_audit_log_actor_idx ON access_audit_log (actor);

    CREATE OR REPLACE FUNCTION prevent_audit_log_mutation() RETURNS TRIGGER AS $$
    BEGIN
      RAISE EXCEPTION 'access_audit_log is append-only: % is not permitted', TG_OP;
    END;
    $$ LANGUAGE plpgsql;

    CREATE TRIGGER access_audit_log_no_update
      BEFORE UPDATE ON access_audit_log
      FOR EACH ROW EXECUTE FUNCTION prevent_audit_log_mutation();

    CREATE TRIGGER access_audit_log_no_delete
      BEFORE DELETE ON access_audit_log
      FOR EACH ROW EXECUTE FUNCTION prevent_audit_log_mutation();

    -- Who submitted this decision, and whether it needs HIV-confidentiality
    -- redaction on later reads by anyone other than an authorised role or
    -- the original submitter (§7 "mirror GEMS's confidential-DMP posture").
    -- is_hiv_related is snapshotted from icd10.hiv_flag at decision time so
    -- redaction never needs to re-resolve reference data.
    ALTER TABLE auth_decision
      ADD COLUMN created_by TEXT REFERENCES app_user (user_id),
      ADD COLUMN is_hiv_related BOOLEAN NOT NULL DEFAULT false;

    ALTER TABLE icd10
      ADD COLUMN hiv_flag BOOLEAN NOT NULL DEFAULT false;

    -- Column-level encryption at rest for the one genuinely free-text PHI
    -- field in the schema (§7 Encryption). Every other clinical fact is a
    -- coded reference (ICD-10/tariff/NAPPI), which is why only this column
    -- needs it — see backend/src/security/encryption.ts for the
    -- pgcrypto pgp_sym_encrypt/decrypt wrapper. Existing plaintext rows
    -- from before this migration cannot be losslessly re-encrypted without
    -- the app-level key, so this drops and re-adds rather than ALTERing
    -- the type in place; acceptable for dev/fixture data, called out in
    -- the runbook for anyone running this against a real deployment.
    ALTER TABLE auth_decision DROP COLUMN IF EXISTS motivation_text;
    ALTER TABLE auth_decision ADD COLUMN motivation_text BYTEA;
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    ALTER TABLE auth_decision DROP COLUMN IF EXISTS motivation_text;
    ALTER TABLE auth_decision ADD COLUMN motivation_text TEXT;

    ALTER TABLE icd10 DROP COLUMN IF EXISTS hiv_flag;

    ALTER TABLE auth_decision
      DROP COLUMN IF EXISTS is_hiv_related,
      DROP COLUMN IF EXISTS created_by;

    DROP TRIGGER IF EXISTS access_audit_log_no_delete ON access_audit_log;
    DROP TRIGGER IF EXISTS access_audit_log_no_update ON access_audit_log;
    DROP FUNCTION IF EXISTS prevent_audit_log_mutation();
    DROP TABLE IF EXISTS access_audit_log CASCADE;
    DROP TABLE IF EXISTS app_user CASCADE;
  `);
};
