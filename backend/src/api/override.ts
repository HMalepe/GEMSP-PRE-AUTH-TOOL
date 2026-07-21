import type { Pool } from 'pg';

/**
 * Screen 4 (Implementation Companion §C.5): a consultant overriding a
 * Layer-A decision MUST enter a reason; override + reason + user +
 * timestamp go to an immutable log. Distinct from the review queue
 * (../triage/queue.ts) — that resolves a ROUTEd case, this overrides an
 * already-terminal APPROVE/DECLINE/ROUTE/NOT_REQUIRED decision. Multiple
 * overrides on the same auth_id are allowed to accumulate (e.g. a
 * supervisor overriding again) — nothing here is ever updated or
 * deleted, only appended.
 */
export interface OverrideRecord {
  id: string;
  authId: string;
  overriddenBy: string;
  reason: string;
  createdAt: string;
}

export class AuthDecisionNotFoundError extends Error {
  constructor(authId: string) {
    super(`auth_decision ${authId} not found`);
    this.name = 'AuthDecisionNotFoundError';
  }
}

export async function recordOverride(
  pool: Pool,
  authId: string,
  params: { overriddenBy: string; reason: string },
): Promise<OverrideRecord> {
  const { rows: authRows } = await pool.query('SELECT auth_id FROM auth_decision WHERE auth_id = $1', [authId]);
  if (!authRows[0]) {
    throw new AuthDecisionNotFoundError(authId);
  }

  const { rows } = await pool.query(
    `INSERT INTO decision_override (auth_id, overridden_by, reason)
     VALUES ($1, $2, $3)
     RETURNING id, auth_id, overridden_by, reason, created_at`,
    [authId, params.overriddenBy, params.reason],
  );
  const row = rows[0];
  return { id: row.id, authId: row.auth_id, overriddenBy: row.overridden_by, reason: row.reason, createdAt: row.created_at };
}

/** Oldest first — the override history reads as a timeline. */
export async function listOverrides(pool: Pool, authId: string): Promise<OverrideRecord[]> {
  const { rows } = await pool.query(
    `SELECT id, auth_id, overridden_by, reason, created_at FROM decision_override
     WHERE auth_id = $1 ORDER BY created_at ASC`,
    [authId],
  );
  return rows.map((row) => ({
    id: row.id,
    authId: row.auth_id,
    overriddenBy: row.overridden_by,
    reason: row.reason,
    createdAt: row.created_at,
  }));
}
