import 'server-only';

export interface AuditEvent {
  id?: string;
  eventType: string;
  actorAddress?: string;
  agentId?: string;
  requestId?: string;
  reservationId?: string;
  txHash?: string;
  details: Record<string, unknown>;
  createdAt: number;
}

export interface AuditEventFilter {
  agentId?: string;
  limit?: number;
  offset?: number;
}

export interface IAuditEventStore {
  append(event: AuditEvent): Promise<AuditEvent>;
  list(filter?: AuditEventFilter): Promise<AuditEvent[]>;
  clear(): void;
}
