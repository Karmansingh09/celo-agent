import 'server-only';

import { Pool, PoolClient } from 'pg';
import { randomBytes } from 'node:crypto';
import {
  AgentBudgetState,
  BudgetReservation,
  IBudgetStore,
  ReservationExpectation,
  ReservationRequest,
  ReservationResult,
  calculateAvailableBudget,
  formatBaseUnitsToCusd,
  getUtcCalendarWindowId,
  parseCusdToBaseUnits,
  validateBudgetAccountingInvariant,
} from './budget-types';
import { getDatabasePool, withDatabaseTransaction } from '../db/postgres';

interface BudgetStateRow {
  agent_id: string;
  window_id: string;
  policy_id: string | null;
  daily_limit_wei: string;
  spent_wei: string;
  reserved_wei: string;
  updated_at: string;
}

interface ReservationRow {
  id: string;
  request_id: string | null;
  idempotency_key: string;
  agent_id: string;
  policy_id: string | null;
  window_id: string;
  amount_wei: string;
  amount_cusd: string;
  recipient: string;
  status: BudgetReservation['status'];
  created_at: string;
  updated_at: string;
  tx_hash: string | null;
  failure_reason: string | null;
  retryable_for_approval: boolean;
}

function stateFromRow(row: BudgetStateRow): AgentBudgetState {
  const dailyLimitWei = BigInt(row.daily_limit_wei);
  const spentWei = BigInt(row.spent_wei);
  const reservedWei = BigInt(row.reserved_wei);
  const invariant = validateBudgetAccountingInvariant(dailyLimitWei, spentWei, reservedWei);
  if (!invariant.valid) throw new Error(`Stored budget state is invalid: ${invariant.error}`);
  const availableWei = calculateAvailableBudget(dailyLimitWei, spentWei, reservedWei);
  return {
    agentId: row.agent_id,
    policyId: row.policy_id || undefined,
    windowId: row.window_id,
    dailyLimitWei,
    dailyLimitCusd: formatBaseUnitsToCusd(dailyLimitWei),
    spentWei,
    spentCusd: formatBaseUnitsToCusd(spentWei),
    reservedWei,
    reservedCusd: formatBaseUnitsToCusd(reservedWei),
    availableWei,
    availableCusd: formatBaseUnitsToCusd(availableWei),
    updatedAt: Number(row.updated_at),
  };
}

function reservationFromRow(row: ReservationRow): BudgetReservation {
  return {
    id: row.id,
    requestId: row.request_id || undefined,
    idempotencyKey: row.idempotency_key,
    agentId: row.agent_id,
    policyId: row.policy_id || undefined,
    windowId: row.window_id,
    amountWei: BigInt(row.amount_wei),
    amountCusd: row.amount_cusd,
    recipient: row.recipient,
    status: row.status,
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
    txHash: row.tx_hash || undefined,
    failureReason: row.failure_reason || undefined,
    retryableForApproval: row.retryable_for_approval,
  };
}

/** PostgreSQL budget ledger with row-level locking around every mutation. */
export class PostgresBudgetStore implements IBudgetStore {
  constructor(private readonly db: Pool = getDatabasePool()) {}

  private async selectState(client: Pool | PoolClient, agentId: string, windowId: string, forUpdate = false) {
    const result = await client.query<BudgetStateRow>(
      `SELECT agent_id, window_id::text, policy_id, daily_limit_wei::text, spent_wei::text,
              reserved_wei::text, updated_at::text
       FROM budget_states
       WHERE agent_id = $1 AND window_id = $2${forUpdate ? ' FOR UPDATE' : ''}`,
      [agentId, windowId]
    );
    return result.rows[0] || null;
  }

  private async selectReservation(client: Pool | PoolClient, id: string, forUpdate = false) {
    const result = await client.query<ReservationRow>(
      `SELECT id, request_id, idempotency_key, agent_id, policy_id, window_id::text,
              amount_wei::text, amount_cusd, recipient, status, created_at::text,
              updated_at::text, tx_hash, failure_reason, retryable_for_approval
       FROM reservations WHERE id = $1${forUpdate ? ' FOR UPDATE' : ''}`,
      [id]
    );
    return result.rows[0] || null;
  }

  private async stateOrCreate(
    client: PoolClient,
    agentId: string,
    windowId: string,
    dailyLimitWei: bigint,
    policyId: string | undefined,
    now: number
  ): Promise<BudgetStateRow> {
    await client.query(
      `INSERT INTO budget_states
         (agent_id, window_id, policy_id, daily_limit_wei, spent_wei, reserved_wei, updated_at)
       VALUES ($1, $2, $3, $4, 0, 0, $5)
       ON CONFLICT (agent_id, window_id) DO NOTHING`,
      [agentId, windowId, policyId || null, dailyLimitWei.toString(), String(now)]
    );
    const state = await this.selectState(client, agentId, windowId, true);
    if (!state) throw new Error(`Budget state not found for ${agentId}/${windowId}`);
    if (BigInt(state.daily_limit_wei) !== dailyLimitWei) {
      throw new Error(
        `Contradictory daily limit for existing window ${windowId}: requested ${formatBaseUnitsToCusd(dailyLimitWei)} cUSD but window is locked at ${formatBaseUnitsToCusd(BigInt(state.daily_limit_wei))} cUSD`
      );
    }
    return state;
  }

  private budgetResult(stateRow: BudgetStateRow, reservation?: BudgetReservation, reason?: string): ReservationResult {
    return {
      success: Boolean(reservation),
      outcome: reservation ? 'RESERVED' : 'DENIED',
      reservation,
      reason,
      budgetState: stateFromRow(stateRow),
    };
  }

  public async getBudgetState(agentId: string, windowId: string, dailyLimitCusd: string): Promise<AgentBudgetState> {
    const dailyLimitWei = parseCusdToBaseUnits(dailyLimitCusd);
    if (dailyLimitWei === null) throw new Error(`Invalid daily limit cUSD string: ${dailyLimitCusd}`);
    return withDatabaseTransaction(async (client) => {
      const row = await this.stateOrCreate(client, agentId, windowId, dailyLimitWei, undefined, Date.now());
      return stateFromRow(row);
    });
  }

  public async acquireReservation(request: ReservationRequest, dailyLimitCusd: string): Promise<ReservationResult> {
    const amountWei = parseCusdToBaseUnits(request.amountCusd);
    const dailyLimitWei = parseCusdToBaseUnits(dailyLimitCusd);
    const now = request.timestamp ?? Date.now();
    if (!request.agentId?.trim() || !request.idempotencyKey?.trim()) {
      throw new Error('agentId and idempotencyKey are required');
    }
    if (!/^0x[a-fA-F0-9]{40}$/.test(request.recipient?.trim() || '')) {
      throw new Error('Invalid recipient EVM address format');
    }
    if (amountWei === null || amountWei <= 0n) throw new Error(`Invalid requested amount format: ${request.amountCusd}`);
    if (dailyLimitWei === null) throw new Error(`Invalid daily limit format: ${dailyLimitCusd}`);

    let windowId: string;
    try {
      windowId = getUtcCalendarWindowId(now);
    } catch {
      throw new Error('Invalid request timestamp provided');
    }

    return withDatabaseTransaction(async (client) => {
      let stateRow = await this.stateOrCreate(client, request.agentId, windowId, dailyLimitWei, request.policyId, now);
      const pointer = await client.query<{ reservation_id: string }>(
        `SELECT reservation_id FROM reservation_idempotency
         WHERE agent_id = $1 AND idempotency_key = $2 FOR UPDATE`,
        [request.agentId, request.idempotencyKey]
      );

      if (pointer.rows[0]) {
        const existingRow = await this.selectReservation(client, pointer.rows[0].reservation_id, true);
        if (existingRow) {
          const existing = reservationFromRow(existingRow);
          const matches =
            existing.amountWei === amountWei &&
            existing.recipient.toLowerCase() === request.recipient.toLowerCase() &&
            existing.windowId === windowId &&
            existing.policyId === request.policyId;
          if (!matches) {
            return {
              success: false,
              outcome: 'IDEMPOTENCY_CONFLICT',
              reservation: existing,
              reason: 'Idempotency key was previously used with different payment parameters',
              budgetState: stateFromRow(stateRow),
            };
          }
          if (existing.status === 'COMMITTED') {
            return {
              success: true,
              outcome: 'DUPLICATE_COMMITTED',
              reservation: existing,
              reason: 'Payment already completed on-chain for this idempotency key',
              budgetState: stateFromRow(stateRow),
            };
          }
          if (existing.status === 'RESERVED' || existing.status === 'SUBMITTED' || existing.status === 'HELD_FOR_RECONCILIATION') {
            return {
              success: true,
              outcome: 'DUPLICATE_IN_PROGRESS',
              reservation: existing,
              reason: 'Payment reservation currently in progress for this idempotency key',
              budgetState: stateFromRow(stateRow),
            };
          }
          if (!(existing.status === 'RELEASED' && existing.retryableForApproval && request.requestId === existing.requestId)) {
            return {
              success: false,
              outcome: 'DENIED',
              reservation: existing,
              reason: 'Previous reservation with this idempotency key was released after failure',
              budgetState: stateFromRow(stateRow),
            };
          }
          await client.query(
            `DELETE FROM reservation_idempotency WHERE agent_id = $1 AND idempotency_key = $2`,
            [request.agentId, request.idempotencyKey]
          );
        }
      }

      const state = stateFromRow(stateRow);
      if (state.availableWei < amountWei) {
        return {
          success: false,
          outcome: 'DENIED',
          reason: `Daily budget exceeded. Available: ${state.availableCusd} cUSD, Requested: ${request.amountCusd} cUSD`,
          budgetState: state,
        };
      }

      const nextReserved = state.reservedWei + amountWei;
      const invariant = validateBudgetAccountingInvariant(state.dailyLimitWei, state.spentWei, nextReserved);
      if (!invariant.valid) throw new Error(`Accounting invariant violation during reservation: ${invariant.error}`);
      const reservationId = `res_${now}_${randomBytes(8).toString('hex')}`;
      const updatedAt = Math.max(now, state.updatedAt);
      await client.query(
        `UPDATE budget_states SET reserved_wei = $3, updated_at = $4
         WHERE agent_id = $1 AND window_id = $2`,
        [request.agentId, windowId, nextReserved.toString(), String(updatedAt)]
      );
      await client.query(
        `INSERT INTO reservations
           (id, request_id, idempotency_key, agent_id, policy_id, window_id, amount_wei, amount_cusd, recipient, status, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'RESERVED', $10, $11)`,
        [reservationId, request.requestId || null, request.idempotencyKey, request.agentId, request.policyId || null, windowId, amountWei.toString(), request.amountCusd, request.recipient, String(now), String(updatedAt)]
      );
      await client.query(
        `INSERT INTO reservation_idempotency (agent_id, idempotency_key, reservation_id) VALUES ($1, $2, $3)`,
        [request.agentId, request.idempotencyKey, reservationId]
      );
      stateRow = await this.selectState(client, request.agentId, windowId, false) as BudgetStateRow;
      const reservation = await this.selectReservation(client, reservationId, false);
      if (!reservation) throw new Error(`Reservation creation did not return ${reservationId}`);
      return this.budgetResult(stateRow, reservationFromRow(reservation), 'Budget reservation acquired successfully');
    });
  }

  public async markSubmitted(reservationId: string, txHash: string): Promise<BudgetReservation> {
    const hash = txHash?.trim() || '';
    if (!/^0x[a-fA-F0-9]{64}$/.test(hash)) throw new Error('Transaction hash must be a valid 32-byte 0x-prefixed hex string');
    return withDatabaseTransaction(async (client) => {
      const row = await this.selectReservation(client, reservationId, true);
      if (!row) throw new Error(`Reservation not found: ${reservationId}`);
      const reservation = reservationFromRow(row);
      if (reservation.status === 'SUBMITTED') {
        if (reservation.txHash?.toLowerCase() !== hash.toLowerCase()) throw new Error('Reservation is already submitted with a different transaction hash');
        return reservation;
      }
      if (reservation.status !== 'RESERVED') throw new Error(`Invalid state transition: Cannot mark reservation as SUBMITTED from status ${reservation.status}`);
      await client.query(`UPDATE reservations SET status = 'SUBMITTED', tx_hash = $2, updated_at = $3 WHERE id = $1`, [reservationId, hash, String(Math.max(Date.now(), reservation.updatedAt))]);
      return { ...reservation, status: 'SUBMITTED' as const, txHash: hash, updatedAt: Math.max(Date.now(), reservation.updatedAt) };
    });
  }

  public async commitReservation(reservationId: string): Promise<BudgetReservation> {
    return withDatabaseTransaction(async (client) => {
      const row = await this.selectReservation(client, reservationId, true);
      if (!row) throw new Error(`Reservation not found: ${reservationId}`);
      const reservation = reservationFromRow(row);
      if (reservation.status === 'COMMITTED') return reservation;
      if (reservation.status !== 'SUBMITTED' && reservation.status !== 'HELD_FOR_RECONCILIATION') throw new Error(`Invalid state transition: Cannot commit reservation from status ${reservation.status}`);
      const stateRow = await this.selectState(client, reservation.agentId, reservation.windowId, true);
      if (!stateRow) throw new Error(`Budget state not found for agent ${reservation.agentId} and window ${reservation.windowId}`);
      const state = stateFromRow(stateRow);
      const nextReserved = state.reservedWei - reservation.amountWei;
      if (nextReserved < 0n) throw new Error('Stored budget reservation exceeds reserved balance');
      const nextSpent = state.spentWei + reservation.amountWei;
      const invariant = validateBudgetAccountingInvariant(state.dailyLimitWei, nextSpent, nextReserved);
      if (!invariant.valid) throw new Error(`Accounting invariant violation during commit: ${invariant.error}`);
      const updatedAt = Math.max(Date.now(), reservation.updatedAt, state.updatedAt);
      await client.query(`UPDATE budget_states SET reserved_wei = $3, spent_wei = $4, updated_at = $5 WHERE agent_id = $1 AND window_id = $2`, [reservation.agentId, reservation.windowId, nextReserved.toString(), nextSpent.toString(), String(updatedAt)]);
      await client.query(`UPDATE reservations SET status = 'COMMITTED', updated_at = $2 WHERE id = $1`, [reservationId, String(updatedAt)]);
      return { ...reservation, status: 'COMMITTED' as const, updatedAt };
    });
  }

  public async releaseReservation(reservationId: string, reason: string): Promise<BudgetReservation> {
    return this.releaseInternal(reservationId, reason, undefined, false);
  }

  public async releaseReservationIfReserved(reservationId: string, reason: string, expected?: ReservationExpectation): Promise<BudgetReservation> {
    return this.releaseInternal(reservationId, reason, expected, true);
  }

  public async releaseReservationForApprovalRetry(reservationId: string, reason: string, expected: ReservationExpectation): Promise<BudgetReservation> {
    return this.releaseInternal(reservationId, reason, expected, true, true);
  }

  private async releaseInternal(reservationId: string, reason: string, expected: ReservationExpectation | undefined, onlyIfReserved: boolean, retryable = false): Promise<BudgetReservation> {
    return withDatabaseTransaction(async (client) => {
      const row = await this.selectReservation(client, reservationId, true);
      if (!row) throw new Error(`Reservation not found: ${reservationId}`);
      const reservation = reservationFromRow(row);
      this.assertReservationExpectation(reservation, expected);
      if (reservation.status === 'RELEASED') {
        if (retryable) await client.query(`UPDATE reservations SET retryable_for_approval = TRUE WHERE id = $1`, [reservationId]);
        return { ...reservation, retryableForApproval: reservation.retryableForApproval || retryable };
      }
      if (reservation.status !== 'RESERVED') {
        if (onlyIfReserved) return reservation;
        throw new Error(`Invalid state transition: Cannot release reservation from status ${reservation.status}`);
      }
      const stateRow = await this.selectState(client, reservation.agentId, reservation.windowId, true);
      if (!stateRow) throw new Error(`Budget state not found for agent ${reservation.agentId} and window ${reservation.windowId}`);
      const state = stateFromRow(stateRow);
      const nextReserved = state.reservedWei - reservation.amountWei;
      if (nextReserved < 0n) throw new Error('Stored budget reservation exceeds reserved balance');
      const updatedAt = Math.max(Date.now(), reservation.updatedAt, state.updatedAt);
      await client.query(`UPDATE budget_states SET reserved_wei = $3, updated_at = $4 WHERE agent_id = $1 AND window_id = $2`, [reservation.agentId, reservation.windowId, nextReserved.toString(), String(updatedAt)]);
      await client.query(`UPDATE reservations SET status = 'RELEASED', failure_reason = $2, retryable_for_approval = $3, updated_at = $4 WHERE id = $1`, [reservationId, reason, retryable, String(updatedAt)]);
      return { ...reservation, status: 'RELEASED' as const, failureReason: reason, retryableForApproval: retryable, updatedAt };
    });
  }

  public async holdForReconciliation(reservationId: string, reason: string, txHash?: string): Promise<BudgetReservation> {
    if (txHash !== undefined && !/^0x[a-fA-F0-9]{64}$/.test(txHash.trim())) throw new Error('Transaction hash must be a valid 32-byte 0x-prefixed hex string');
    return withDatabaseTransaction(async (client) => {
      const row = await this.selectReservation(client, reservationId, true);
      if (!row) throw new Error(`Reservation not found: ${reservationId}`);
      const reservation = reservationFromRow(row);
      if (reservation.status === 'HELD_FOR_RECONCILIATION') {
        if (txHash && reservation.txHash && reservation.txHash.toLowerCase() !== txHash.trim().toLowerCase()) throw new Error('Reservation is already held with a different transaction hash');
        if (txHash && !reservation.txHash) await client.query(`UPDATE reservations SET tx_hash = $2, updated_at = $3 WHERE id = $1`, [reservationId, txHash.trim(), String(Date.now())]);
        return { ...reservation, txHash: reservation.txHash || txHash?.trim() };
      }
      if (reservation.status !== 'SUBMITTED' && reservation.status !== 'RESERVED') throw new Error(`Invalid state transition: Cannot hold reservation for reconciliation from status ${reservation.status}`);
      const updatedAt = Math.max(Date.now(), reservation.updatedAt);
      await client.query(`UPDATE reservations SET status = 'HELD_FOR_RECONCILIATION', failure_reason = $2, tx_hash = COALESCE($3, tx_hash), updated_at = $4 WHERE id = $1`, [reservationId, reason, txHash?.trim() || null, String(updatedAt)]);
      return { ...reservation, status: 'HELD_FOR_RECONCILIATION' as const, failureReason: reason, txHash: txHash?.trim() || reservation.txHash, updatedAt };
    });
  }

  public async getReservationById(reservationId: string): Promise<BudgetReservation | null> {
    const row = await this.selectReservation(this.db, reservationId);
    return row ? reservationFromRow(row) : null;
  }

  public async getReservationByIdempotencyKey(agentId: string, idempotencyKey: string): Promise<BudgetReservation | null> {
    const result = await this.db.query<{ reservation_id: string }>(`SELECT reservation_id FROM reservation_idempotency WHERE agent_id = $1 AND idempotency_key = $2`, [agentId, idempotencyKey]);
    if (!result.rows[0]) return null;
    const row = await this.selectReservation(this.db, result.rows[0].reservation_id);
    return row ? reservationFromRow(row) : null;
  }

  public async listReservationsByAgentId(agentId: string): Promise<BudgetReservation[]> {
    const result = await this.db.query<ReservationRow>(`SELECT id, request_id, idempotency_key, agent_id, policy_id, window_id::text, amount_wei::text, amount_cusd, recipient, status, created_at::text, updated_at::text, tx_hash, failure_reason, retryable_for_approval FROM reservations WHERE agent_id = $1 ORDER BY created_at ASC, id ASC`, [agentId]);
    return result.rows.map(reservationFromRow);
  }

  private assertReservationExpectation(reservation: BudgetReservation, expected?: ReservationExpectation): void {
    if (!expected) return;
    const amountWei = parseCusdToBaseUnits(expected.amountCusd);
    if (reservation.agentId !== expected.agentId || reservation.idempotencyKey !== expected.idempotencyKey || reservation.amountWei !== amountWei || reservation.recipient.toLowerCase() !== expected.recipient.toLowerCase() || reservation.policyId !== expected.policyId) {
      throw new Error(`Reservation ${reservation.id} does not match the expected payment identity`);
    }
  }

  public clear(): void {
    // Durable state is intentionally not cleared through the repository API.
  }
}
