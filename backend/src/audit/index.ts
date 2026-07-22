import type { Pool } from 'pg';

/**
 * "Who viewed/decided what, when — immutable and retained per policy"
 * (Technical Build Spec §7 Audit trail). PostgresAuditLog is the real
 * implementation: it writes to access_audit_log, whose immutability is
 * enforced at the database level, not by application discipline — see
 * the access_audit_log_no_update/no_delete triggers in
 * db/migrations/1700000000004_security-hardening.js.
 */
export interface AuditEvent {
  actor: string;
  action: string;
  entity: string;
  entityId: string;
  detail?: Record<string, unknown>;
}

export interface AuditLogEntry extends AuditEvent {
  id: string;
  createdAt: string;
}

export interface AuditLog {
  record(event: AuditEvent): Promise<void>;
}

export class PostgresAuditLog implements AuditLog {
  constructor(private readonly pool: Pool) {}

  async record(event: AuditEvent): Promise<void> {
    await this.pool.query(
      `INSERT INTO access_audit_log (actor, action, entity, entity_id, detail) VALUES ($1, $2, $3, $4, $5::jsonb)`,
      [event.actor, event.action, event.entity, event.entityId, JSON.stringify(event.detail ?? {})],
    );
  }
}

export interface AuditLogFilters {
  entity?: string;
  entityId?: string;
  actor?: string;
}

const LIST_LIMIT = 200;

export async function listAuditLog(pool: Pool, filters: AuditLogFilters = {}): Promise<AuditLogEntry[]> {
  const clauses: string[] = [];
  const params: unknown[] = [];
  if (filters.entity) {
    params.push(filters.entity);
    clauses.push(`entity = $${params.length}`);
  }
  if (filters.entityId) {
    params.push(filters.entityId);
    clauses.push(`entity_id = $${params.length}`);
  }
  if (filters.actor) {
    params.push(filters.actor);
    clauses.push(`actor = $${params.length}`);
  }
  const where = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';

  const { rows } = await pool.query(
    `SELECT id, actor, action, entity, entity_id, detail, created_at
     FROM access_audit_log
     ${where}
     ORDER BY created_at DESC
     LIMIT ${LIST_LIMIT}`,
    params,
  );

  return rows.map((row) => ({
    id: row.id,
    actor: row.actor,
    action: row.action,
    entity: row.entity,
    entityId: row.entity_id,
    detail: row.detail,
    createdAt: row.created_at,
  }));
}

/** For pure/unit tests that don't want a database — never used by createServer. */
export class InMemoryAuditLog implements AuditLog {
  private readonly events: AuditEvent[] = [];

  async record(event: AuditEvent): Promise<void> {
    this.events.push(event);
  }

  list(): readonly AuditEvent[] {
    return this.events;
  }
}
