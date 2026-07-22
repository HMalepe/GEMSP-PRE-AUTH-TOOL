import type { Pool } from 'pg';
import type { LlmClient, RecommendedAction } from './llm-client.js';

/** Build Spec §5.2: "Set high initially (e.g. auto-suggest only >0.9); tune down as accuracy is proven." */
export const DEFAULT_CONFIDENCE_THRESHOLD = 0.9;

export class LayerBNotApplicableError extends Error {
  constructor(
    message: string,
    public readonly code: 'AUTH_DECISION_NOT_FOUND' | 'NOT_ROUTED' | 'NO_MOTIVATION_TEXT',
  ) {
    super(message);
    this.name = 'LayerBNotApplicableError';
  }
}

export interface LayerBSuggestionRecord {
  id: string;
  authId: string;
  modelIdentifier: string;
  endpointType: 'PRIVATE' | 'PUBLIC';
  confidence: number;
  recommendedAction: RecommendedAction | null;
  extractedEvidence: { summary: string; keyFindings: string[]; concerns: string[] };
  createdAt: string;
}

/**
 * Runs Layer B extraction against one routed case and persists the
 * result. Only ever operates on decision='ROUTE' rows — a Layer-A
 * DECLINE (including a PMB decline) is never passed through this
 * function by any caller in this codebase, so it structurally cannot be
 * overridden by Layer B (Rules-Engine Spec §1.2, requirement 1). Purely
 * advisory: nothing here writes to auth_decision.decision or
 * review_outcome — a human still has to call
 * POST /review-queue/:authId/resolve for anything to actually happen.
 */
export async function triageRoutedCase(
  pool: Pool,
  client: LlmClient,
  authId: string,
  options: { confidenceThreshold?: number } = {},
): Promise<LayerBSuggestionRecord> {
  const threshold = options.confidenceThreshold ?? DEFAULT_CONFIDENCE_THRESHOLD;

  const { rows } = await pool.query<{ decision: string; codes: Record<string, unknown>; reasons: unknown; motivation_text: string | null }>(
    `SELECT decision, codes, reasons, motivation_text FROM auth_decision WHERE auth_id = $1`,
    [authId],
  );
  const row = rows[0];
  if (!row) {
    throw new LayerBNotApplicableError(`auth_decision ${authId} not found`, 'AUTH_DECISION_NOT_FOUND');
  }
  if (row.decision !== 'ROUTE') {
    throw new LayerBNotApplicableError(
      `auth_decision ${authId} is not ROUTEd (decision=${row.decision}) — Layer B only processes cases Layer A has already routed`,
      'NOT_ROUTED',
    );
  }
  if (!row.motivation_text) {
    throw new LayerBNotApplicableError(`auth_decision ${authId} has no motivation_text attached — nothing for Layer B to extract`, 'NO_MOTIVATION_TEXT');
  }

  const codes = row.codes as { icd10Code?: string; tariffCode?: string; nappiCode?: string | null };
  const result = await client.extract({
    motivationText: row.motivation_text,
    icd10Code: codes.icd10Code ?? '',
    tariffCode: codes.tariffCode ?? '',
    nappiCode: codes.nappiCode ?? undefined,
    routingReasons: Array.isArray(row.reasons) ? row.reasons.map(String) : [],
  });

  // "auto-suggest only >0.9" — below threshold, the extracted evidence is
  // still stored (useful context for the human either way) but the
  // recommendation itself is withheld, since surfacing a low-confidence
  // suggestion is exactly the guessing Layer A already refuses to do.
  const recommendedAction = result.confidence >= threshold ? result.recommendedAction : null;

  const { rows: inserted } = await pool.query(
    `INSERT INTO layer_b_suggestion (auth_id, model_identifier, endpoint_type, confidence, recommended_action, extracted_evidence)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb)
     RETURNING id, auth_id, model_identifier, endpoint_type, confidence, recommended_action, extracted_evidence, created_at`,
    [authId, result.modelIdentifier, result.endpointType, result.confidence, recommendedAction, JSON.stringify(result.extractedEvidence)],
  );
  const record = inserted[0];

  return {
    id: record.id,
    authId: record.auth_id,
    modelIdentifier: record.model_identifier,
    endpointType: record.endpoint_type,
    confidence: Number(record.confidence),
    recommendedAction: record.recommended_action,
    extractedEvidence: record.extracted_evidence,
    createdAt: record.created_at,
  };
}

/** Latest suggestion for a case, if any triage run has happened. */
export async function getLatestSuggestion(pool: Pool, authId: string): Promise<LayerBSuggestionRecord | undefined> {
  const { rows } = await pool.query(
    `SELECT id, auth_id, model_identifier, endpoint_type, confidence, recommended_action, extracted_evidence, created_at
     FROM layer_b_suggestion WHERE auth_id = $1 ORDER BY created_at DESC LIMIT 1`,
    [authId],
  );
  const record = rows[0];
  if (!record) {
    return undefined;
  }
  return {
    id: record.id,
    authId: record.auth_id,
    modelIdentifier: record.model_identifier,
    endpointType: record.endpoint_type,
    confidence: Number(record.confidence),
    recommendedAction: record.recommended_action,
    extractedEvidence: record.extracted_evidence,
    createdAt: record.created_at,
  };
}
