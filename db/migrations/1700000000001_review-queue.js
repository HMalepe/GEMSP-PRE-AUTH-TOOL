/**
 * Layer B v1's actual deliverable per Technical Build Spec §5 "Build
 * order" callout: ship Layer A and route 100% of edge cases to a human
 * queue first. review_outcome is that queue's resolution log — a routed
 * auth_decision with no matching row here is still pending.
 *
 * A separate migration rather than amending migration 1: this is a real
 * phase boundary (Layer A schema vs. the Layer B queue), not a fix to
 * something migration 1 got wrong.
 */

exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.sql(`
    -- Implementation Companion §C.4/§C.5: a reviewer MUST enter a reason;
    -- reviewer + reason + timestamp form the immutable audit record, and
    -- become labelled training data for a future Layer-B model
    -- (Technical Build Spec §5.2).
    CREATE TABLE review_outcome (
      id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      auth_id     UUID NOT NULL REFERENCES auth_decision (auth_id),
      reviewer    TEXT NOT NULL,
      outcome     TEXT NOT NULL CHECK (outcome IN ('APPROVED', 'DECLINED', 'MORE_INFO_REQUESTED')),
      reason      TEXT NOT NULL,
      decided_at  TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX review_outcome_auth_id_idx ON review_outcome (auth_id);
  `);
};

exports.down = (pgm) => {
  pgm.sql(`DROP TABLE IF EXISTS review_outcome CASCADE;`);
};
