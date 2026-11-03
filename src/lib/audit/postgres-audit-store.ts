import 'server-only';

import { Pool } from 'pg';
import { getDatabasePool } from '../db/postgres';
import { AuditEvent, AuditEventFilter, IAuditEventStore } from './types';

interface AuditRow {
  id: string;
  event_type: string;
  actor_address: string | null;
  agent_id: string | null;
  request_id: string | null;
  reservation_id: string | null;
  tx_hash: string | null;
  details: Record<string, unknown>;
  created_at: string;
}

function mapEvent(row: AuditRow): AuditEvent {
  return {
    id: row.id,
    eventType: row.event_type,
    actorAddress: row.actor_address || undefined,
    agentId: row.agent_id || undefined,
    requestId: row.request_id || undefined,
    reservationId: row.reservation_id || undefined,
    txHash: row.tx_hash || undefined,
    details: row.details || {},
    createdAt: Number(row.created_at),
  };
}

export class PostgresAuditEventStore implements IAuditEventStore {
  constructor(private readonly db: Pool = getDatabasePool()) {}

  public async append(event: AuditEvent): Promise<AuditEvent> {
    const result = await this.db.query<AuditRow>(
      `INSERT INTO audit_events
         (event_type, actor_address, agent_id, request_id, reservation_id, tx_hash, details, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8)
       RETURNING id::text, event_type, actor_address, agent_id, request_id, reservation_id, tx_hash, details, created_at::text`,
      [event.eventType, event.actorAddress || null, event.agentId || null, event.requestId || null, event.reservationId || null, event.txHash || null, JSON.stringify(event.details), String(event.createdAt)]
    );
    return mapEvent(result.rows[0]);
  }

  public async list(filter?: AuditEventFilter): Promise<AuditEvent[]> {
    const values: unknown[] = [];
    const clauses: string[] = [];
    if (filter?.agentId) {
      values.push(filter.agentId);
      clauses.push(`agent_id = $${values.length}`);
    }
    values.push(filter?.limit ?? 1000);
    const limit = `$${values.length}`;
    values.push(filter?.offset ?? 0);
    const offset = `$${values.length}`;
    const result = await this.db.query<AuditRow>(
      `SELECT id::text, event_type, actor_address, agent_id, request_id, reservation_id, tx_hash, details, created_at::text
       FROM audit_events ${clauses.length ? `WHERE ${clauses.join(' AND ')}` : ''}
       ORDER BY created_at DESC, id DESC LIMIT ${limit} OFFSET ${offset}`,
      values
    );
    return result.rows.map(mapEvent);
  }

  public clear(): void {
    // Durable audit history is append-only and is not cleared by application code.
  }
}
