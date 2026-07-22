/**
 * Layer B (Technical Build Spec §5 / Rules-Engine Spec §1.2): the
 * confidence-scoring half deferred until now. Two additions:
 *
 * - auth_decision.motivation_text: the unstructured input Layer B reads
 *   (motivation letters, clinical notes, quotations — §5.1). Optional —
 *   most requests are purely coded and never touch Layer B at all; only
 *   a ROUTEd case with motivation text attached has anything for
 *   extraction to work with.
 * - layer_b_suggestion: one row per triage run. Deliberately NOT a
 *   decision — nothing here ever writes to auth_decision.decision or
 *   review_outcome. recommended_action reuses review_outcome's outcome
 *   vocabulary (APPROVED/DECLINED/MORE_INFO_REQUESTED) on purpose: it
 *   makes "suggestion vs. what the human actually did" a plain equality
 *   check when building the labelled training set (§5.2).
 */

exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.sql(`
    ALTER TABLE auth_decision ADD COLUMN motivation_text TEXT;

    CREATE TABLE layer_b_suggestion (
      id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      auth_id             UUID NOT NULL REFERENCES auth_decision (auth_id),
      model_identifier    TEXT NOT NULL,
      endpoint_type       TEXT NOT NULL CHECK (endpoint_type IN ('PRIVATE', 'PUBLIC')),
      confidence          NUMERIC(4, 3) NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
      recommended_action  TEXT CHECK (recommended_action IN ('APPROVED', 'DECLINED', 'MORE_INFO_REQUESTED')),
      extracted_evidence  JSONB NOT NULL,
      created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX layer_b_suggestion_auth_id_idx ON layer_b_suggestion (auth_id);
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    DROP TABLE IF EXISTS layer_b_suggestion CASCADE;
    ALTER TABLE auth_decision DROP COLUMN IF EXISTS motivation_text;
  `);
};
