/**
 * Initial schema — every entity in Technical Build Spec §2.1, plus the
 * generic staging/versioning tables the ingestion pipeline needs
 * (Implementation Companion A.3, Technical Build Spec §3.2).
 *
 * Rules-as-data (Companion Part B.2): every reference table below carries
 * benefit_year and a rule_version_id FK. Nothing in this migration is a
 * rand value, limit, or co-payment — those only ever exist as promoted
 * rows loaded through backend/src/ingestion, never in application code.
 *
 * Composite natural keys: several tables use (natural_code, benefit_year)
 * as their primary key rather than natural_code alone, because the same
 * code's attributes (is_pmb, sub_limit, ...) can be redefined at the next
 * annual CMS/GEMS re-registration — the code is the same, the registered
 * row for it is not. member/dependant are the exception: a member's
 * option_code is a stable identity, not itself year-versioned, so
 * member.option_code is NOT foreign-keyed to option — the engine resolves
 * the correct year's option row using the request's service date at
 * decision time, not a stored FK.
 */

exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.sql(`
    CREATE EXTENSION IF NOT EXISTS pgcrypto;

    -- Every dataset load creates a rule_version row; nothing enters the
    -- engine unversioned (§3.2). status tracks the staging pipeline:
    -- STAGED -> VALIDATED -> HUMAN_VERIFIED -> PROMOTED (-> ROLLED_BACK).
    CREATE TABLE rule_version (
      version_id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      dataset              TEXT NOT NULL,
      benefit_year         INTEGER NOT NULL,
      effective_from       DATE NOT NULL,
      source_doc           TEXT NOT NULL,
      checksum             TEXT NOT NULL,
      status               TEXT NOT NULL DEFAULT 'STAGED'
                              CHECK (status IN ('STAGED', 'VALIDATED', 'HUMAN_VERIFIED', 'PROMOTED', 'ROLLED_BACK')),
      human_verified_by    TEXT,
      human_verified_at    TIMESTAMPTZ,
      promoted_at          TIMESTAMPTZ,
      created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (dataset, benefit_year, checksum)
    );

    -- Generic staging area for every dataset load. A row here is a
    -- candidate for one live table, keyed by that table's natural key
    -- (row_key) plus a JSONB payload shaped like the live table's columns.
    -- Rows are never deleted, even after promotion — they are the
    -- immutable snapshot rollback replays (Technical Build Spec §3.2).
    CREATE TABLE dataset_staging (
      id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      rule_version_id      UUID NOT NULL REFERENCES rule_version (version_id),
      target_table         TEXT NOT NULL,
      row_key              TEXT NOT NULL,
      payload              JSONB NOT NULL,
      validation_status    TEXT NOT NULL DEFAULT 'PENDING'
                              CHECK (validation_status IN ('PENDING', 'VALID', 'INVALID')),
      validation_errors    JSONB NOT NULL DEFAULT '[]',
      created_at           TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX dataset_staging_rule_version_id_idx ON dataset_staging (rule_version_id);

    -- Six GEMS options; network_type/benefit_year can change at the next
    -- annual re-registration (Annexures compilation notes the 2026
    -- restructuring), hence the composite key.
    CREATE TABLE option (
      option_code    TEXT NOT NULL,
      name           TEXT NOT NULL,
      network_type   TEXT NOT NULL CHECK (network_type IN ('REO', 'NETWORK', 'OPEN')),
      benefit_year   INTEGER NOT NULL,
      rule_version_id UUID NOT NULL REFERENCES rule_version (version_id),
      PRIMARY KEY (option_code, benefit_year)
    );

    -- Transactional member data, not reference/rules data — no
    -- benefit_year or rule_version_id. option_code is intentionally not
    -- FK'd to option (see header comment).
    CREATE TABLE member (
      member_id             TEXT PRIMARY KEY,
      option_code           TEXT NOT NULL,
      status                 TEXT NOT NULL,
      join_date              DATE NOT NULL,
      prior_cover_months     INTEGER NOT NULL DEFAULT 0,
      dob                    DATE NOT NULL
    );

    CREATE TABLE dependant (
      dependant_code   TEXT NOT NULL,
      member_id        TEXT NOT NULL REFERENCES member (member_id),
      dob              DATE NOT NULL,
      join_date        DATE NOT NULL,
      PRIMARY KEY (member_id, dependant_code)
    );

    -- 271 diagnosis-treatment pairs (Implementation Companion A.2.1).
    CREATE TABLE dtp (
      dtp_id              TEXT NOT NULL,
      description         TEXT NOT NULL,
      pmb_level_of_care   TEXT,
      benefit_year        INTEGER NOT NULL,
      rule_version_id     UUID NOT NULL REFERENCES rule_version (version_id),
      PRIMARY KEY (dtp_id, benefit_year)
    );

    -- CMS PMB ICD-10 coded list (A.2.1). cdl_flag is set by the Annexure D
    -- + Chronic Guide dataset (A.2.4) — there is no standalone CDL table
    -- in §2.1, it is a flag on the ICD-10 row it applies to.
    CREATE TABLE icd10 (
      code              TEXT NOT NULL,
      description       TEXT NOT NULL,
      is_pmb            BOOLEAN NOT NULL DEFAULT false,
      dtp_id            TEXT,
      cdl_flag          BOOLEAN NOT NULL DEFAULT false,
      benefit_year      INTEGER NOT NULL,
      rule_version_id   UUID NOT NULL REFERENCES rule_version (version_id),
      PRIMARY KEY (code, benefit_year),
      FOREIGN KEY (dtp_id, benefit_year) REFERENCES dtp (dtp_id, benefit_year)
    );

    CREATE TABLE tariff (
      code               TEXT NOT NULL,
      description        TEXT NOT NULL,
      requires_preauth   BOOLEAN NOT NULL DEFAULT false,
      category           TEXT,
      benefit_year       INTEGER NOT NULL,
      rule_version_id    UUID NOT NULL REFERENCES rule_version (version_id),
      PRIMARY KEY (code, benefit_year)
    );

    -- MPL/DRP/formulary (A.2.5).
    CREATE TABLE nappi (
      nappi_code        TEXT NOT NULL,
      product           TEXT NOT NULL,
      mpl_price         NUMERIC(12, 2),
      drp_price         NUMERIC(12, 2),
      formulary_flag    BOOLEAN NOT NULL DEFAULT false,
      benefit_year      INTEGER NOT NULL,
      rule_version_id   UUID NOT NULL REFERENCES rule_version (version_id),
      PRIMARY KEY (nappi_code, benefit_year)
    );

    -- 0009 / 0011 / 0013 / 0018 / 0074 / 0075 (Provider FAQ, A.2.6).
    CREATE TABLE modifier (
      code              TEXT NOT NULL,
      effect_rule       TEXT NOT NULL,
      benefit_year      INTEGER NOT NULL,
      rule_version_id   UUID NOT NULL REFERENCES rule_version (version_id),
      PRIMARY KEY (code, benefit_year)
    );

    CREATE TABLE network_provider (
      practice_no          TEXT NOT NULL,
      provider_type        TEXT NOT NULL,
      network_membership   TEXT NOT NULL,
      option_scope         TEXT[] NOT NULL DEFAULT '{}',
      benefit_year         INTEGER NOT NULL,
      rule_version_id      UUID NOT NULL REFERENCES rule_version (version_id),
      PRIMARY KEY (practice_no, benefit_year)
    );

    -- Per-option benefit limits (A.2.2). Composite FK ties each limit to
    -- an option that actually exists for that same benefit year.
    CREATE TABLE benefit_limit (
      id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      option_code       TEXT NOT NULL,
      benefit_type      TEXT NOT NULL,
      sub_limit         NUMERIC(12, 2) NOT NULL,
      basis             TEXT NOT NULL CHECK (basis IN ('PBPA', 'PFPA')),
      benefit_year      INTEGER NOT NULL,
      rule_version_id   UUID NOT NULL REFERENCES rule_version (version_id),
      UNIQUE (option_code, benefit_type, benefit_year),
      FOREIGN KEY (option_code, benefit_year) REFERENCES option (option_code, benefit_year)
    );

    CREATE TABLE benefit_balance (
      id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      member_id         TEXT NOT NULL REFERENCES member (member_id),
      benefit_type      TEXT NOT NULL,
      used              NUMERIC(12, 2) NOT NULL DEFAULT 0,
      available         NUMERIC(12, 2) NOT NULL,
      benefit_year      INTEGER NOT NULL,
      rule_version_id   UUID NOT NULL REFERENCES rule_version (version_id),
      UNIQUE (member_id, benefit_type, benefit_year)
    );
    CREATE INDEX benefit_balance_member_id_idx ON benefit_balance (member_id);

    -- Flat co-payment model (R1,000 / R15,000 / 30%) — GEMS has no
    -- per-procedure schedule (docs/gems-annexures-compilation.md §3).
    CREATE TABLE co_payment_rule (
      id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      trigger_code      TEXT NOT NULL,
      option_code       TEXT NOT NULL,
      amount_or_pct     NUMERIC(12, 2) NOT NULL,
      basis             TEXT NOT NULL DEFAULT 'AMOUNT' CHECK (basis IN ('AMOUNT', 'PCT')),
      benefit_year      INTEGER NOT NULL,
      rule_version_id   UUID NOT NULL REFERENCES rule_version (version_id),
      UNIQUE (trigger_code, option_code, benefit_year),
      FOREIGN KEY (option_code, benefit_year) REFERENCES option (option_code, benefit_year)
    );

    -- s29A / Rule 8.3 GWP/CSWP scenarios (A.2.6). Distinct from Annexure
    -- B's late-joiner-penalty bands, which have no §2.1 entity (LJP is a
    -- contribution/premium loading, out of scope for a funding-decision
    -- engine) — see backend/src/ingestion/loaders/README.md.
    CREATE TABLE waiting_period_rule (
      scenario          TEXT NOT NULL,
      gwp_months        INTEGER NOT NULL DEFAULT 0,
      cswp_months       INTEGER NOT NULL DEFAULT 0,
      pmb_covered       BOOLEAN NOT NULL DEFAULT true,
      benefit_year      INTEGER NOT NULL,
      rule_version_id   UUID NOT NULL REFERENCES rule_version (version_id),
      PRIMARY KEY (scenario, benefit_year)
    );

    -- The engine output contract (§4.3) + audit record. Immutable by
    -- convention: application code must never UPDATE or DELETE a row here.
    CREATE TABLE auth_decision (
      auth_id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      member_id             TEXT NOT NULL REFERENCES member (member_id),
      codes                 JSONB NOT NULL,
      decision              TEXT NOT NULL CHECK (decision IN ('APPROVE', 'DECLINE', 'ROUTE', 'NOT_REQUIRED')),
      funding_source        TEXT,
      co_payment            JSONB,
      reimbursement_basis   TEXT,
      length_of_stay        JSONB,
      reasons               JSONB NOT NULL,
      rules_version         TEXT NOT NULL,
      caveat                TEXT NOT NULL,
      created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX auth_decision_member_id_idx ON auth_decision (member_id);
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
      dataset_staging,
      rule_version
    CASCADE;
  `);
};
