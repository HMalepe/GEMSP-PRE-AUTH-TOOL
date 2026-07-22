import type { Pool } from 'pg';

/**
 * "Log every human decision on routed cases from day one — that becomes
 * your labelled set" (Technical Build Spec §5.2). Every resolved routed
 * case is a training example whether or not Layer B ever ran on it
 * (agreement is undefined when there's no suggestion to compare against
 * — a case a human resolved without any motivation text attached is
 * still worth keeping, just not usable for measuring Layer B accuracy
 * specifically).
 */
export interface TrainingExample {
  authId: string;
  memberId: string;
  motivationText: string | null;
  suggestionConfidence: number | null;
  suggestionRecommendedAction: string | null;
  humanReviewer: string;
  humanOutcome: string;
  humanReason: string;
  decidedAt: string;
  /** null when there was no suggestion (or it was below the confidence threshold) to compare against. */
  agreement: boolean | null;
}

export async function getTrainingExamples(pool: Pool): Promise<TrainingExample[]> {
  const { rows } = await pool.query(
    `SELECT
       ad.auth_id, ad.member_id, ad.motivation_text,
       lbs.confidence AS suggestion_confidence,
       lbs.recommended_action AS suggestion_recommended_action,
       ro.reviewer, ro.outcome, ro.reason, ro.decided_at
     FROM review_outcome ro
     JOIN auth_decision ad ON ad.auth_id = ro.auth_id
     LEFT JOIN LATERAL (
       SELECT confidence, recommended_action
       FROM layer_b_suggestion
       WHERE layer_b_suggestion.auth_id = ad.auth_id
       ORDER BY created_at DESC
       LIMIT 1
     ) lbs ON true
     ORDER BY ro.decided_at DESC`,
  );

  return rows.map((row) => ({
    authId: row.auth_id,
    memberId: row.member_id,
    motivationText: row.motivation_text,
    suggestionConfidence: row.suggestion_confidence === null ? null : Number(row.suggestion_confidence),
    suggestionRecommendedAction: row.suggestion_recommended_action,
    humanReviewer: row.reviewer,
    humanOutcome: row.outcome,
    humanReason: row.reason,
    decidedAt: row.decided_at,
    agreement: row.suggestion_recommended_action === null ? null : row.suggestion_recommended_action === row.outcome,
  }));
}
