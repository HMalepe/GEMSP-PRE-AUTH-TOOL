import type { Pool } from 'pg';
import type { GateResultPayload } from './serializers.js';
import { listOverrides } from './override.js';

/** Screen 5 (Implementation Companion §C.6): read-only search by member/date/auth id/code. */
export interface HistorySearchFilters {
  memberId?: string;
  authId?: string;
  code?: string;
  dateFrom?: string;
  dateTo?: string;
}

export interface AuthDecisionSummaryPayload {
  auth_id: string;
  member_id: string;
  decision: string;
  created_at: string;
  rules_version: string;
  codes: Record<string, unknown>;
}

const SEARCH_LIMIT = 100;

export async function searchAuthDecisions(pool: Pool, filters: HistorySearchFilters): Promise<AuthDecisionSummaryPayload[]> {
  const clauses: string[] = [];
  const params: unknown[] = [];

  if (filters.memberId) {
    params.push(filters.memberId);
    clauses.push(`member_id = $${params.length}`);
  }
  if (filters.authId) {
    params.push(filters.authId);
    clauses.push(`auth_id = $${params.length}`);
  }
  if (filters.code) {
    params.push(`%${filters.code}%`);
    clauses.push(`codes::text ILIKE $${params.length}`);
  }
  if (filters.dateFrom) {
    params.push(filters.dateFrom);
    clauses.push(`created_at >= $${params.length}`);
  }
  if (filters.dateTo) {
    params.push(filters.dateTo);
    clauses.push(`created_at <= $${params.length}`);
  }

  const where = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
  const { rows } = await pool.query(
    `SELECT auth_id, member_id, decision, created_at, rules_version, codes
     FROM auth_decision
     ${where}
     ORDER BY created_at DESC
     LIMIT ${SEARCH_LIMIT}`,
    params,
  );

  return rows.map((row) => ({
    auth_id: row.auth_id,
    member_id: row.member_id,
    decision: row.decision,
    created_at: row.created_at,
    rules_version: row.rules_version,
    codes: row.codes,
  }));
}

export interface OverridePayload {
  overridden_by: string;
  reason: string;
  created_at: string;
}

export interface ReviewOutcomePayload {
  reviewer: string;
  outcome: string;
  reason: string;
  decided_at: string;
}

export interface AuthDecisionDetailPayload extends AuthDecisionSummaryPayload {
  funding_source: string | null;
  co_payment: { amount: number; reason: string } | null;
  reimbursement_basis: string | null;
  length_of_stay: { days: number; level: string } | null;
  reasons: string[];
  gate_results: GateResultPayload[];
  caveat: string;
  review_outcome: ReviewOutcomePayload | null;
  overrides: OverridePayload[];
}

/**
 * Full detail for Screens 2 and 5: "the full decision object AND the
 * rules_version it ran under" (Companion §C.6), plus whatever downstream
 * happened to it (review resolution, overrides). Same snake_case
 * convention as POST /authorisations's response — this is the read path
 * for the exact same resource.
 */
export async function getAuthDecisionDetail(pool: Pool, authId: string): Promise<AuthDecisionDetailPayload | undefined> {
  const { rows } = await pool.query(
    `SELECT ad.auth_id, ad.member_id, ad.decision, ad.funding_source, ad.co_payment, ad.reimbursement_basis,
            ad.length_of_stay, ad.reasons, ad.gate_results, ad.rules_version, ad.caveat, ad.created_at, ad.codes,
            ro.reviewer, ro.outcome AS review_outcome, ro.reason AS review_reason, ro.decided_at
     FROM auth_decision ad
     LEFT JOIN review_outcome ro ON ro.auth_id = ad.auth_id
     WHERE ad.auth_id = $1`,
    [authId],
  );
  const row = rows[0];
  if (!row) {
    return undefined;
  }

  const overrides = await listOverrides(pool, authId);

  return {
    auth_id: row.auth_id,
    member_id: row.member_id,
    decision: row.decision,
    created_at: row.created_at,
    rules_version: row.rules_version,
    codes: row.codes,
    funding_source: row.funding_source,
    co_payment: row.co_payment,
    reimbursement_basis: row.reimbursement_basis,
    length_of_stay: row.length_of_stay,
    reasons: row.reasons ?? [],
    gate_results: (row.gate_results ?? []).map(
      (g: { gateNumber: number; gateName: string; outcome: string; passed: boolean; reason: string }) => ({
        gate_number: g.gateNumber,
        gate_name: g.gateName,
        outcome: g.outcome,
        passed: g.passed,
        reason: g.reason,
      }),
    ),
    caveat: row.caveat,
    review_outcome: row.reviewer
      ? { reviewer: row.reviewer, outcome: row.review_outcome, reason: row.review_reason, decided_at: row.decided_at }
      : null,
    overrides: overrides.map((o) => ({ overridden_by: o.overriddenBy, reason: o.reason, created_at: o.createdAt })),
  };
}
