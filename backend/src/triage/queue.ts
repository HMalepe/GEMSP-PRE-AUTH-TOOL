import type { Pool } from 'pg';
import { getLatestSuggestion, type LayerBSuggestionRecord } from './extraction.js';

/**
 * The human review queue (Implementation Companion §C.4). A routed
 * auth_decision is "pending" until a review_outcome row exists for it —
 * there's no separate queue table, the queue is just that join.
 */
export interface QueueItemSummary {
  authId: string;
  memberId: string;
  reasonForRouting: string;
  createdAt: string;
}

export interface QueueItemDetail extends QueueItemSummary {
  codes: Record<string, unknown>;
  reasons: string[];
  rulesVersion: string;
  /** Layer B's extraction/recommendation for this case, if triage has run — advisory only, Screen 3 must never auto-apply it. */
  layerBSuggestion?: LayerBSuggestionRecord;
}

function lastReason(reasons: unknown): string {
  return Array.isArray(reasons) && reasons.length > 0 ? String(reasons[reasons.length - 1]) : '';
}

/** Oldest first — Companion §C.4 "show queue age / SLA... sort by oldest or by clinical priority." Clinical priority sorting needs a triage signal this v1 doesn't have. */
export async function listReviewQueue(pool: Pool): Promise<QueueItemSummary[]> {
  const { rows } = await pool.query<{ auth_id: string; member_id: string; reasons: unknown; created_at: string }>(
    `SELECT ad.auth_id, ad.member_id, ad.reasons, ad.created_at
     FROM auth_decision ad
     LEFT JOIN review_outcome ro ON ro.auth_id = ad.auth_id
     WHERE ad.decision = 'ROUTE' AND ro.id IS NULL
     ORDER BY ad.created_at ASC`,
  );
  return rows.map((r) => ({
    authId: r.auth_id,
    memberId: r.member_id,
    reasonForRouting: lastReason(r.reasons),
    createdAt: r.created_at,
  }));
}

/** Full evidence for one item (Companion §C.4: "the request, the gate that routed it... attached documents"). Attached-document handling is out of scope for v1 — no document store exists yet. */
export async function getReviewQueueItem(pool: Pool, authId: string): Promise<QueueItemDetail | undefined> {
  const { rows } = await pool.query<{
    auth_id: string;
    member_id: string;
    codes: Record<string, unknown>;
    reasons: unknown;
    rules_version: string;
    created_at: string;
  }>(
    `SELECT ad.auth_id, ad.member_id, ad.codes, ad.reasons, ad.rules_version, ad.created_at
     FROM auth_decision ad
     LEFT JOIN review_outcome ro ON ro.auth_id = ad.auth_id
     WHERE ad.auth_id = $1 AND ad.decision = 'ROUTE' AND ro.id IS NULL`,
    [authId],
  );
  const row = rows[0];
  if (!row) {
    return undefined;
  }
  const layerBSuggestion = await getLatestSuggestion(pool, row.auth_id);
  return {
    authId: row.auth_id,
    memberId: row.member_id,
    codes: row.codes,
    reasons: Array.isArray(row.reasons) ? (row.reasons as string[]) : [],
    reasonForRouting: lastReason(row.reasons),
    rulesVersion: row.rules_version,
    createdAt: row.created_at,
    layerBSuggestion,
  };
}

export interface ResolveQueueItemParams {
  reviewer: string;
  outcome: 'APPROVED' | 'DECLINED' | 'MORE_INFO_REQUESTED';
  reason: string;
}

/**
 * Records the reviewer's decision. Requires the item still be pending —
 * resolving twice would silently overwrite the audit trail, so this
 * throws instead (Companion §C.4/§C.5: reviewer + reason + timestamp is
 * the immutable record, and doubles as labelled training data for a
 * future Layer-B model, Technical Build Spec §5.2).
 */
export async function resolveReviewQueueItem(pool: Pool, authId: string, params: ResolveQueueItemParams): Promise<void> {
  const existing = await getReviewQueueItem(pool, authId);
  if (!existing) {
    throw new Error(`review queue item ${authId} not found or already resolved`);
  }
  await pool.query(`INSERT INTO review_outcome (auth_id, reviewer, outcome, reason) VALUES ($1, $2, $3, $4)`, [
    authId,
    params.reviewer,
    params.outcome,
    params.reason,
  ]);
}
