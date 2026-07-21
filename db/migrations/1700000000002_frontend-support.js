/**
 * Two additions the consultant front-end needs (Implementation Companion
 * Part C) that Layer A's own contract (Technical Build Spec §4.3) didn't
 * require on its own:
 *
 * - auth_decision.gate_results: the §4.3 contract only promises an
 *   ordered reasons[] array. Screen 2's evidence trail wants a pass/fail
 *   marker per gate (§C.3) — reasons[] alone can't carry that, so this
 *   column stores the richer per-gate structure the reasons are derived
 *   from. reasons[] on auth_decision is unchanged and stays canonical.
 * - decision_override: Screen 4 (§C.4/§C.5) — a consultant overriding a
 *   Layer-A decision MUST enter a reason; override + reason + user +
 *   timestamp go to an immutable log. Distinct from review_outcome
 *   (migration 2), which resolves a ROUTEd case, not an override of a
 *   DECLINE/APPROVE.
 */

exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.sql(`
    ALTER TABLE auth_decision ADD COLUMN gate_results JSONB;

    CREATE TABLE decision_override (
      id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      auth_id        UUID NOT NULL REFERENCES auth_decision (auth_id),
      overridden_by  TEXT NOT NULL,
      reason         TEXT NOT NULL,
      created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX decision_override_auth_id_idx ON decision_override (auth_id);
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    DROP TABLE IF EXISTS decision_override CASCADE;
    ALTER TABLE auth_decision DROP COLUMN IF EXISTS gate_results;
  `);
};
