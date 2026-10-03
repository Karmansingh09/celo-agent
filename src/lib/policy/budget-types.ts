import { formatUnits } from 'viem';
import { CUSD_DECIMALS, parseMonetaryAmountToBigInt } from './evaluator';

/**
 * Phase 6.1: Budget Accounting Domain & Types
 * 
 * Defines the core types, state machines, accounting invariants,
 * and interface contracts for CeloAgent daily budget accounting and concurrency safety.
 * 
 * ARCHITECTURE & PERSISTENCE NOTICE:
 * In-memory implementations conforming to IBudgetStore provide single-process
 * concurrency safety for development and testing. They are NOT persistent across
 * server restarts, crashes, or distributed multi-instance/serverless deployments.
 * Production multi-instance deployments require an ACID-compliant database implementation
 * behind the IBudgetStore contract.
 */

/**
 * Default duration (in milliseconds) before a stale unconfirmed reservation is eligible for reconciliation.
 * Set to 300,000 ms (5 minutes).
 * 
 * IMPORTANT: Exceeding this threshold triggers reconciliation / investigation only.
 * It must NEVER automatically release an uncertain reservation.
 */
export const RECONCILIATION_THRESHOLD_MS = 300_000;

/**
 * Lifecycle states for a budget reservation.
 * 
 * - RESERVED: Budget held against the daily window prior to or during payment execution.
 * - SUBMITTED: Transaction signed and broadcasted in-flight to the Celo network.
 * - COMMITTED: Transaction confirmed on-chain; amount is now permanently counted in spentWei.
 * - RELEASED: Transaction failed, reverted, or was rejected before on-chain execution; amount returned to available.
 * - HELD_FOR_RECONCILIATION: Transaction timed out or outcome is uncertain (e.g. dropped RPC connection).
 *   Amount remains encumbered in reservedWei to prevent overspending. A TTL triggers reconciliation, NOT automatic release.
 */
export type ReservationStatus =
  | 'RESERVED'
  | 'SUBMITTED'
  | 'COMMITTED'
  | 'RELEASED'
  | 'HELD_FOR_RECONCILIATION';

/**
 * Status outcomes when attempting to acquire a reservation.
 */
export type ReservationAcquireOutcome =
  | 'RESERVED'
  | 'DENIED'
  | 'DUPLICATE_IN_PROGRESS'
  | 'DUPLICATE_COMMITTED'
  | 'IDEMPOTENCY_CONFLICT';

/**
 * Represents an individual budget reservation record.
 */
export interface BudgetReservation {
  /** Unique stable reservation identifier (e.g., "res_1750000000000_abc123") */
  id: string;
  /** Client or agent-provided idempotency key preventing duplicate executions (scoped per agent) */
  idempotencyKey: string;
  /** Unique identifier of the agent */
  agentId: string;
  /** Optional policy identifier associated with the reservation */
  policyId?: string;
  /** UTC Calendar day window formatted as YYYY-MM-DD */
  windowId: string;
  /** Reserved amount in base units (18-decimal fixed-point BigInt) */
  amountWei: bigint;
  /** Reserved amount formatted as cUSD decimal string */
  amountCusd: string;
  /** Authorized recipient EVM address (0x...) */
  recipient: string;
  /** Current reservation lifecycle state */
  status: ReservationStatus;
  /** Timestamp when reservation was created (Unix ms) */
  createdAt: number;
  /** Timestamp when reservation was last updated (Unix ms) */
  updatedAt: number;
  /** On-chain transaction hash if submitted to Celo */
  txHash?: string;
  /** Reason for release or transition to reconciliation hold */
  failureReason?: string;
}

/**
 * Snapshot of the daily budget state for an agent within a specific UTC daily window.
 * 
 * ACCOUNTING INVARIANT:
 * availableWei = dailyLimitWei - spentWei - reservedWei
 * 
 * where:
 * - dailyLimitWei: Total maximum spending allowed in the 24h UTC window.
 * - spentWei: Total confirmed payments on-chain in the window (COMMITTED).
 * - reservedWei: Sum of all active encumbrances (RESERVED + SUBMITTED + HELD_FOR_RECONCILIATION).
 * - availableWei: Remaining spendable budget (guaranteed >= 0n for spendability calculations).
 */
export interface AgentBudgetState {
  /** Agent identifier */
  agentId: string;
  /** Optional policy identifier */
  policyId?: string;
  /** UTC Calendar window identifier (YYYY-MM-DD) */
  windowId: string;
  /** Daily limit in base units (18-decimal BigInt) */
  dailyLimitWei: bigint;
  /** Daily limit formatted as cUSD decimal string */
  dailyLimitCusd: string;
  /** Committed on-chain spending in base units */
  spentWei: bigint;
  /** Committed on-chain spending formatted as cUSD decimal string */
  spentCusd: string;
  /** Total active encumbrances in base units (RESERVED + SUBMITTED + HELD_FOR_RECONCILIATION) */
  reservedWei: bigint;
  /** Total active encumbrances formatted as cUSD decimal string */
  reservedCusd: string;
  /** Available remaining budget in base units (dailyLimitWei - spentWei - reservedWei) */
  availableWei: bigint;
  /** Available remaining budget formatted as cUSD decimal string */
  availableCusd: string;
  /** Timestamp of last state change (Unix ms) */
  updatedAt: number;
}

/**
 * Request parameters for acquiring a budget reservation.
 */
export interface ReservationRequest {
  /** Agent requesting the payment */
  agentId: string;
  /** Optional policy identifier */
  policyId?: string;
  /** Amount requested in cUSD (decimal string e.g. "0.08") */
  amountCusd: string;
  /** Target recipient EVM address */
  recipient: string;
  /** Unique client idempotency key (scoped per agentId) */
  idempotencyKey: string;
  /** Optional timestamp override (Unix ms) for testing */
  timestamp?: number;
}

/**
 * Result of a reservation acquisition attempt.
 */
export interface ReservationResult {
  /** Whether the reservation was granted or matched an already active/committed request */
  success: boolean;
  /** Outcome classification */
  outcome: ReservationAcquireOutcome;
  /** The acquired or existing reservation record */
  reservation?: BudgetReservation;
  /** Human-readable explanation if denied, warning, or idempotency conflict */
  reason?: string;
  /** Resulting budget state snapshot */
  budgetState: AgentBudgetState;
}

/**
 * Storage and concurrency contract for agent budget state and reservation lifecycle.
 */
export interface IBudgetStore {
  /**
   * Retrieves the current budget state for an agent and UTC window.
   * Initializes state using dailyLimitCusd if it does not yet exist.
   */
  getBudgetState(agentId: string, windowId: string, dailyLimitCusd: string): Promise<AgentBudgetState>;

  /**
   * Atomically acquires a budget reservation against the daily window.
   * Enforces the accounting invariant: availableWei >= amountWei.
   * 
   * Idempotency handling (scoped per agentId):
   * - If an idempotencyKey is reused with IDENTICAL payment details (amount, recipient),
   *   returns the existing reservation and its current state without creating a duplicate.
   * - If an idempotencyKey is reused with DIFFERENT payment details (mismatched amount or recipient),
   *   returns outcome IDEMPOTENCY_CONFLICT with success: false. It must never create a second payment
   *   or silently reuse the original reservation for a different request.
   */
  acquireReservation(request: ReservationRequest, dailyLimitCusd: string): Promise<ReservationResult>;

  /**
   * Transitions a reservation to SUBMITTED state (in-flight on blockchain).
   */
  markSubmitted(reservationId: string, txHash: string): Promise<BudgetReservation>;

  /**
   * Transitions a reservation to COMMITTED state (confirmed on-chain).
   * Moves amountWei from reservedWei into spentWei.
   */
  commitReservation(reservationId: string): Promise<BudgetReservation>;

  /**
   * Transitions a reservation to RELEASED state (failed/rejected pre-settlement).
   * Releases amountWei from reservedWei back into availableWei.
   */
  releaseReservation(reservationId: string, reason: string): Promise<BudgetReservation>;

  /**
   * Transitions an uncertain or timed-out reservation to HELD_FOR_RECONCILIATION.
   * Preserves amountWei in reservedWei to prevent overspending until reconciliation confirms status.
   * Threshold: RECONCILIATION_THRESHOLD_MS (5 minutes). Triggers investigation, never auto-release.
   */
  holdForReconciliation(reservationId: string, reason: string): Promise<BudgetReservation>;

  /**
   * Looks up an existing reservation by agentId and idempotencyKey.
   * Idempotency keys are explicitly scoped per agent.
   */
  getReservationByIdempotencyKey(agentId: string, idempotencyKey: string): Promise<BudgetReservation | null>;
}

// ============================================================================
// PURE DOMAIN HELPERS & INVARIANTS
// ============================================================================

// Maximum representable timestamp range in JavaScript Date: +-8.64e15 ms
const MAX_JS_DATE_MS = 8_640_000_000_000_000;
const MIN_JS_DATE_MS = -8_640_000_000_000_000;

/**
 * Returns the UTC calendar-day window ID formatted as YYYY-MM-DD for a given timestamp.
 * 
 * Validates timestamp input:
 * - Rejects NaN, Infinity, -Infinity, and values exceeding JavaScript Date limits with RangeError.
 * - Accepts timestamp 0 (Unix epoch 1970-01-01).
 * 
 * @param timestamp Unix timestamp in milliseconds (defaults to Date.now())
 * @returns Date string formatted as "YYYY-MM-DD" in UTC
 * @throws RangeError if timestamp is not a finite number within the valid Date range
 */
export function getUtcCalendarWindowId(timestamp: number = Date.now()): string {
  if (
    typeof timestamp !== 'number' ||
    Number.isNaN(timestamp) ||
    !Number.isFinite(timestamp) ||
    timestamp < MIN_JS_DATE_MS ||
    timestamp > MAX_JS_DATE_MS
  ) {
    throw new RangeError(`Invalid timestamp provided to getUtcCalendarWindowId: ${timestamp}`);
  }

  const d = new Date(timestamp);
  const year = d.getUTCFullYear();
  const month = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Validates the core accounting invariant of a budget state:
 * - dailyLimitWei, spentWei, and reservedWei must all be non-negative.
 * - spentWei + reservedWei must not exceed dailyLimitWei.
 * 
 * Unlike calculateAvailableBudget (which clamps to 0n for safe spendability calculations),
 * this function detects and reports over-encumbrance or corrupted accounting state.
 * 
 * @returns Object with valid flag and optional descriptive error
 */
export function validateBudgetAccountingInvariant(
  dailyLimitWei: bigint,
  spentWei: bigint,
  reservedWei: bigint
): { valid: boolean; error?: string } {
  if (dailyLimitWei < 0n) {
    return { valid: false, error: 'dailyLimitWei cannot be negative' };
  }
  if (spentWei < 0n) {
    return { valid: false, error: 'spentWei cannot be negative' };
  }
  if (reservedWei < 0n) {
    return { valid: false, error: 'reservedWei cannot be negative' };
  }

  const totalEncumbered = spentWei + reservedWei;
  if (totalEncumbered > dailyLimitWei) {
    return {
      valid: false,
      error: `Accounting invariant violated: total encumbered (${totalEncumbered.toString()}) exceeds daily limit (${dailyLimitWei.toString()})`,
    };
  }

  return { valid: true };
}

/**
 * Calculates remaining available budget enforcing the core accounting invariant:
 * available = dailyLimit - spent - reserved
 * 
 * If total encumbrances (spent + reserved) exceed dailyLimit, returns 0n (never negative).
 * Use validateBudgetAccountingInvariant to explicitly check whether total encumbrances exceed the limit.
 * 
 * @param dailyLimitWei Total daily budget allocation in base units
 * @param spentWei Committed spending in base units
 * @param reservedWei Active reservations in base units
 * @returns Available budget in base units (guaranteed >= 0n)
 */
export function calculateAvailableBudget(
  dailyLimitWei: bigint,
  spentWei: bigint,
  reservedWei: bigint
): bigint {
  const encumbered = spentWei + reservedWei;
  if (encumbered >= dailyLimitWei) {
    return 0n;
  }
  return dailyLimitWei - encumbered;
}

/**
 * Formats a BigInt base unit amount (Wei) to a cUSD decimal string (18 decimals).
 */
export function formatBaseUnitsToCusd(amountWei: bigint): string {
  return formatUnits(amountWei, CUSD_DECIMALS);
}

/**
 * Safely parses a cUSD decimal string to BigInt base units (Wei).
 * Returns null if format is invalid, negative, non-positive, or exceeds 18 decimal places.
 */
export function parseCusdToBaseUnits(amountCusd: string): bigint | null {
  return parseMonetaryAmountToBigInt(amountCusd, CUSD_DECIMALS);
}
