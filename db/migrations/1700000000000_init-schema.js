/**
 * Initial schema — core entities from Technical Build Spec §2.1.
 * Rules-as-data: this migration creates table SHAPE only. The actual
 * thresholds/limits/co-payments/formulary prices are loaded as versioned
 * rows through the ingestion pipeline (src/ingestion), not through
 * migrations — see docs/technical-build-spec.md §3.
 */

exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.sql(`
    CREATE EXTENSION IF NOT EXISTS pgcrypto;

    -- Every dataset load creates a rule_version row; nothing enters the
    -- engine unversioned (§3.2).
    CREATE TABLE rule_version (
      version_id      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      benefit_year    INTEGER NOT NULL,
      effective_from  DATE NOT NULL,
      source_doc      TEXT NOT NULL,
      checksum        TEXT NOT NULL,
      created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (benefit_year, source_doc, checksum)
    );

    CREATE TABLE option (
      option_code   TEXT PRIMARY KEY,
      name          TEXT NOT NULL,
      network_type  TEXT NOT NULL CHECK (network_type IN ('REO', 'NETWORK', 'OPEN')),
      benefit_year  INTEGER NOT NULL
    );

    CREATE TABLE member (
      member_id            TEXT PRIMARY KEY,
      option_code          TEXT NOT NULL REFERENCES option (option_code),
      status                TEXT NOT NULL,
      join_date             DATE NOT NULL,
      prior_cover_months    INTEGER NOT NULL DEFAULT 0,
      dob                   DATE NOT NULL
    );

    CREATE TABLE dependant (
      dependant_code  TEXT NOT NULL,
      member_id       TEXT NOT NULL REFERENCES member (member_id),
      dob             DATE NOT NULL,
      join_date       DATE NOT NULL,
      PRIMARY KEY (member_id, dependant_code)
    );

    CREATE TABLE dtp (
      dtp_id             TEXT PRIMARY KEY,
      description        TEXT NOT NULL,
      pmb_level_of_care  TEXT
    );

    CREATE TABLE icd10 (
      code             TEXT PRIMARY KEY,
      description      TEXT NOT NULL,
      is_pmb           BOOLEAN NOT NULL DEFAULT false,
      dtp_id           TEXT REFERENCES dtp (dtp_id),
      cdl_flag         BOOLEAN NOT NULL DEFAULT false,
      rule_version_id  UUID NOT NULL REFERENCES rule_version (version_id)
    );

    CREATE TABLE tariff (
      code               TEXT PRIMARY KEY,
      description        TEXT NOT NULL,
      requires_preauth   BOOLEAN NOT NULL DEFAULT false,
      category           TEXT
    );

    CREATE TABLE nappi (
      nappi_code       TEXT PRIMARY KEY,
      product          TEXT NOT NULL,
      mpl_price        NUMERIC(12, 2),
      drp_price        NUMERIC(12, 2),
      formulary_flag   BOOLEAN NOT NULL DEFAULT false,
      rule_version_id  UUID NOT NULL REFERENCES rule_version (version_id)
    );

    -- 0009 / 0011 / 0013 / 0018 / 0074 / 0075 (Provider FAQ).
    CREATE TABLE modifier (
      code         TEXT PRIMARY KEY,
      effect_rule  TEXT NOT NULL
    );

    CREATE TABLE network_provider (
      practice_no          TEXT PRIMARY KEY,
      provider_type        TEXT NOT NULL,
      network_membership   TEXT NOT NULL,
      option_scope         TEXT[] NOT NULL DEFAULT '{}'
    );

    CREATE TABLE benefit_limit (
      id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      option_code      TEXT NOT NULL REFERENCES option (option_code),
      benefit_type     TEXT NOT NULL,
      sub_limit        NUMERIC(12, 2) NOT NULL,
      basis            TEXT NOT NULL CHECK (basis IN ('PBPA', 'PFPA')),
      benefit_year     INTEGER NOT NULL,
      rule_version_id  UUID NOT NULL REFERENCES rule_version (version_id),
      UNIQUE (option_code, benefit_type, benefit_year)
    );

    CREATE TABLE benefit_balance (
      id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      member_id     TEXT NOT NULL REFERENCES member (member_id),
      benefit_type  TEXT NOT NULL,
      used          NUMERIC(12, 2) NOT NULL DEFAULT 0,
      available     NUMERIC(12, 2) NOT NULL,
      benefit_year  INTEGER NOT NULL,
      UNIQUE (member_id, benefit_type, benefit_year)
    );

    -- R1,000 / R15,000 / 30% flat triggers (docs/gems-annexures-compilation.md §3)
    -- — GEMS has no per-procedure co-payment schedule.
    CREATE TABLE co_payment_rule (
      id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      trigger_code   TEXT NOT NULL,
      option_code    TEXT NOT NULL REFERENCES option (option_code),
      amount_or_pct  NUMERIC(12, 2) NOT NULL,
      benefit_year   INTEGER NOT NULL,
      UNIQUE (trigger_code, option_code, benefit_year)
    );

    -- s29A / Rule 8.3 scenarios.
    CREATE TABLE waiting_period_rule (
      id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      scenario      TEXT NOT NULL UNIQUE,
      gwp_months    INTEGER NOT NULL DEFAULT 0,
      cswp_months   INTEGER NOT NULL DEFAULT 0,
      pmb_covered   BOOLEAN NOT NULL DEFAULT true
    );

    -- The engine output contract (§4.3) + audit record. Immutable by
    -- convention: application code must never UPDATE or DELETE a row here.
    CREATE TABLE auth_decision (
      auth_id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      member_id       TEXT NOT NULL REFERENCES member (member_id),
      codes           JSONB NOT NULL,
      decision        TEXT NOT NULL CHECK (decision IN ('APPROVE', 'DECLINE', 'ROUTE', 'NOT_REQUIRED')),
      funding_source  TEXT,
      copay           JSONB,
      los             JSONB,
      reasons         JSONB NOT NULL,
      created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
      rules_version   TEXT NOT NULL
    );
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    DROP TABLE IF EXISTS
      auth_decision,
      waiting_period_rule,
      co_payment_rule,
      benefit_balance,
      benefit_limit,
      network_provider,
      modifier,
      nappi,
      tariff,
      icd10,
      dtp,
      dependant,
      member,
      option,
      rule_version
    CASCADE;
  `);
};
