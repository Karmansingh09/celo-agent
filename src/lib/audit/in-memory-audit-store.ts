import { AuditEvent, AuditEventFilter, IAuditEventStore } from './types';

export class InMemoryAuditEventStore implements IAuditEventStore {
  private readonly events: AuditEvent[] = [];

  public async append(event: AuditEvent): Promise<AuditEvent> {
    const stored = {
      ...event,
      id: event.id || `audit_${this.events.length + 1}`,
      details: { ...event.details },
    };
    this.events.push(stored);
    return { ...stored, details: { ...stored.details } };
  }

  public async list(filter?: AuditEventFilter): Promise<AuditEvent[]> {
    const filtered = filter?.agentId ? this.events.filter((event) => event.agentId === filter.agentId) : this.events;
    const offset = filter?.offset || 0;
    const limit = filter?.limit ?? 1000;
    return filtered.slice(offset, offset + limit).map((event) => ({ ...event, details: { ...event.details } }));
  }

  public clear(): void {
    this.events.length = 0;
  }
}
