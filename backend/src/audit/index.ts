export interface AuditEvent {
  actor: string;
  action: string;
  entity: string;
  entityId: string;
  timestamp: string;
  detail?: Record<string, unknown>;
}

export interface AuditLog {
  record(event: AuditEvent): Promise<void>;
}

/**
 * In-memory audit log for local dev/tests only. The real implementation
 * must write immutably to Postgres — every decision persisted with inputs,
 * rules_version and reasons, reconstructable years later (Technical Build
 * Spec §6 Auditability, §7 Security & POPIA).
 */
export class InMemoryAuditLog implements AuditLog {
  private readonly events: AuditEvent[] = [];

  async record(event: AuditEvent): Promise<void> {
    this.events.push(event);
  }

  list(): readonly AuditEvent[] {
    return this.events;
  }
}
