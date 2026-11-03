import 'server-only';

import { Pool, PoolClient } from 'pg';
import {
  ApprovalStatus,
  InvalidPaymentInputError,
  PaymentIdempotencyConflictError,
  PendingApproval,
  PendingApprovalNotFoundError,
  PendingApprovalStateError,
  isValidPaymentRequestId,
} from './types';
import { IPendingApprovalStore } from './pending-approval-store';
import { parseCusdToBaseUnits } from '../policy/budget-types';
import { getDatabasePool, isUniqueViolation, withDatabaseTransaction } from '../db/postgres';

interface ApprovalRow {
  request_id: string;
  agent_id: string;
  amount_cusd: string;
  recipient: string;
  idempotency_key: string;
  policy_id: string;
  created_at: string;
  valid_until: string;
  status: ApprovalStatus;
  status_reason: string | null;
  resolved_at: string | null;
}

function mapApproval(row: ApprovalRow): PendingApproval {
  return {
    requestId: row.request_id,
    agentId: row.agent_id,
    amountCusd: row.amount_cusd,
    recipient: row.recipient,
    idempotencyKey: row.idempotency_key,
    policyId: row.policy_id,
    createdAt: Number(row.created_at),
    validUntil: Number(row.valid_until),
    status: row.status,
    statusReason: row.status_reason || undefined,
    resolvedAt: row.resolved_at === null ? undefined : Number(row.resolved_at),
  };
}

/** PostgreSQL pending approval repository with database compare-and-set transitions. */
export class PostgresPendingApprovalStore implements IPendingApprovalStore {
  constructor(private readonly db: Pool = getDatabasePool()) {}

  private async selectByRequestId(client: Pool | PoolClient, requestId: string, forUpdate = false) {
    const result = await client.query<ApprovalRow>(
      `SELECT request_id, agent_id, amount_cusd, recipient, idempotency_key, policy_id,
              created_at::text, valid_until::text, status, status_reason, resolved_at::text
       FROM pending_approvals WHERE request_id = $1${forUpdate ? ' FOR UPDATE' : ''}`,
      [requestId]
    );
    return result.rows[0] || null;
  }

  public async create(approval: PendingApproval): Promise<PendingApproval> {
    if (!approval || typeof approval !== 'object' || Array.isArray(approval)) throw new InvalidPaymentInputError('Pending approval must be a valid non-null object');
    if (!isValidPaymentRequestId(approval.requestId)) throw new InvalidPaymentInputError(`Invalid requestId format: ${approval.requestId}`);
    if (parseCusdToBaseUnits(approval.amountCusd) === null) throw new InvalidPaymentInputError('Pending approval amount is invalid');

    try {
      return await withDatabaseTransaction(async (client) => {
        const pointer = await client.query<{ request_id: string }>(`SELECT request_id FROM approval_idempotency WHERE agent_id = $1 AND idempotency_key = $2 FOR UPDATE`, [approval.agentId, approval.idempotencyKey]);
        if (pointer.rows[0]) {
          const existingRow = await this.selectByRequestId(client, pointer.rows[0].request_id, true);
          if (existingRow) {
            const existing = mapApproval(existingRow);
            const matches = parseCusdToBaseUnits(existing.amountCusd) === parseCusdToBaseUnits(approval.amountCusd) && existing.recipient.toLowerCase() === approval.recipient.toLowerCase() && existing.policyId === approval.policyId;
            if (!matches) throw new PaymentIdempotencyConflictError(approval.idempotencyKey, `Idempotency key "${approval.idempotencyKey}" already has an approval with conflicting parameters`);
            if (existing.status === 'PENDING' || existing.status === 'APPROVED') return existing;
            await client.query(`DELETE FROM approval_idempotency WHERE agent_id = $1 AND idempotency_key = $2`, [approval.agentId, approval.idempotencyKey]);
          }
        }
        await client.query(
          `INSERT INTO pending_approvals
             (request_id, agent_id, amount_cusd, recipient, idempotency_key, policy_id, created_at, valid_until, status, status_reason, resolved_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
          [approval.requestId, approval.agentId, approval.amountCusd, approval.recipient, approval.idempotencyKey, approval.policyId, String(approval.createdAt), String(approval.validUntil), approval.status, approval.statusReason || null, approval.resolvedAt === undefined ? null : String(approval.resolvedAt)]
        );
        await client.query(`INSERT INTO approval_idempotency (agent_id, idempotency_key, request_id) VALUES ($1, $2, $3)`, [approval.agentId, approval.idempotencyKey, approval.requestId]);
        const stored = await this.selectByRequestId(client, approval.requestId);
        if (!stored) throw new Error(`Approval creation did not return ${approval.requestId}`);
        return mapApproval(stored);
      });
    } catch (error: unknown) {
      if (isUniqueViolation(error)) throw new InvalidPaymentInputError(`Pending approval already exists with ID: ${approval.requestId}`);
      throw error;
    }
  }

  public async getByRequestId(requestId: string): Promise<PendingApproval | null> {
    if (!requestId?.trim()) return null;
    const row = await this.selectByRequestId(this.db, requestId.trim());
    return row ? mapApproval(row) : null;
  }

  public async getByIdempotencyKey(agentId: string, idempotencyKey: string): Promise<PendingApproval | null> {
    const pointer = await this.db.query<{ request_id: string }>(`SELECT request_id FROM approval_idempotency WHERE agent_id = $1 AND idempotency_key = $2`, [agentId, idempotencyKey]);
    if (!pointer.rows[0]) return null;
    const row = await this.selectByRequestId(this.db, pointer.rows[0].request_id);
    return row ? mapApproval(row) : null;
  }

  public async listByAgentId(agentId: string, status?: ApprovalStatus): Promise<PendingApproval[]> {
    const values: unknown[] = [agentId];
    const statusClause = status ? ` AND status = $2` : '';
    if (status) values.push(status);
    const result = await this.db.query<ApprovalRow>(
      `SELECT request_id, agent_id, amount_cusd, recipient, idempotency_key, policy_id,
              created_at::text, valid_until::text, status, status_reason, resolved_at::text
       FROM pending_approvals WHERE agent_id = $1${statusClause} ORDER BY created_at DESC, request_id DESC`,
      values
    );
    return result.rows.map(mapApproval);
  }

  public async transitionStatus(requestId: string, fromStatus: ApprovalStatus, toStatus: ApprovalStatus, patch?: { statusReason?: string; resolvedAt?: number }): Promise<PendingApproval> {
    return withDatabaseTransaction(async (client) => {
      const updated = await client.query<ApprovalRow>(
        `UPDATE pending_approvals
         SET status = $3, status_reason = COALESCE($4, status_reason), resolved_at = COALESCE($5, resolved_at)
         WHERE request_id = $1 AND status = $2
         RETURNING request_id, agent_id, amount_cusd, recipient, idempotency_key, policy_id,
                   created_at::text, valid_until::text, status, status_reason, resolved_at::text`,
        [requestId, fromStatus, toStatus, patch?.statusReason ?? null, patch?.resolvedAt === undefined ? null : String(patch.resolvedAt)]
      );
      if (updated.rows[0]) return mapApproval(updated.rows[0]);
      const existing = await this.selectByRequestId(client, requestId);
      if (!existing) throw new PendingApprovalNotFoundError(requestId);
      throw new PendingApprovalStateError(requestId, existing.status, `Cannot transition approval ${requestId} to ${toStatus}: current status is ${existing.status}, expected ${fromStatus}`);
    });
  }

  public clear(): void {
    // Durable state is intentionally not cleared through the repository API.
  }
}
