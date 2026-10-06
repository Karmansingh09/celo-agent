import { BudgetReservation } from '../policy/budget-types';

/**
 * Phase 8.3: Controlled Payment Execution Types & Error Definitions
 * 
 * Defines the execution boundary domain model, asset requirements,
 * and error types governing the transition from RESERVED policy budget
 * to the on-chain Celo payment rail.
 * 
 * ASSET INTEGRITY & CONVERSION INVARIANTS:
 * 1. Strict Asset Separation:
 *    - The policy and accounting domain operates strictly in cUSD decimal strings (`amountCusd`).
 *    - The current Celo payment rail executes native CELO transfers (`amountCelo`).
 *    - cUSD and native CELO are NOT equivalent.
 *    - 1 cUSD != 1 CELO.
 *    - No implicit, silent, or 1:1 conversion between cUSD and CELO is permitted.
 * 2. Cross-Asset Execution Prohibition:
 *    - In Phase 8.3, a reservation denominated in cUSD cannot be executed via the native CELO rail.
 *    - No exchange rates, price oracles, or conversion logic are introduced in Phase 8.3.
 *    - Executing a cUSD reservation on the native CELO rail throws `AssetMismatchError`
 *      before any wallet/rail invocation, preserving the reservation in RESERVED status.
 *    - Execution amounts must strictly match the authorized reservation amount.
 * 3. Submission vs. Settlement Separation:
 *    - Successful broadcast to the Celo network results in status `SUBMITTED` with a `txHash`.
 *    - `SUBMITTED` is NOT `COMMITTED`.
 *    - Moving reserved funds into committed spent budget requires distinct settlement confirmation.
 */

// ============================================================================
// ASSET DEFINITIONS
// ============================================================================

export type ExecutionAssetKind = 'NATIVE_CELO' | 'CUSD_ERC20';

export interface ExecutionAsset {
  /** The kind of asset to execute on-chain */
  kind: ExecutionAssetKind;
  /** Optional network identifier ('sepolia' | 'alfajores' | 'mainnet') */
  network?: string;
}

// ============================================================================
// EXECUTOR INTERFACE & PAYLOADS
// ============================================================================

export interface PaymentExecutionRequest {
  /** Reservation ID linking this execution to an active policy budget reservation */
  reservationId: string;
  /** Target agent identifier */
  agentId: string;
  /** Recipient EVM address (0x...) */
  recipient: string;
  /** Target execution asset */
  asset: ExecutionAsset;
  /** Amount denominated in the execution asset (e.g., "0.01" CELO) */
  amount: string;
  /** Optional idempotency key matching the reservation */
  idempotencyKey?: string;
  /** Optional purpose annotation */
  purpose?: string;
}

export type ExecutionStatus = 'SUBMITTED' | 'FAILED' | 'UNCERTAIN';

export interface PaymentExecutionResult {
  /** High-level success flag (true if successfully submitted/broadcasted to network) */
  success: boolean;
  /** Explicit execution status */
  status: ExecutionStatus;
  /** Transaction hash if broadcast was submitted */
  txHash?: string;
  /** Error message or reason if execution failed or became uncertain */
  error?: string;
  /** Block explorer URL for the transaction */
  explorerUrl?: string;
}

/**
 * Controlled Payment Execution Boundary interface.
 * Implemented by concrete on-chain rails or test mocks.
 */
export interface IPaymentExecutor {
  /**
   * Submits a payment transaction to the underlying network rail.
   * Must return `status: 'SUBMITTED'` upon successful broadcast,
   * `status: 'FAILED'` upon known deterministic pre-submission failure,
   * or `status: 'UNCERTAIN'` upon network timeout or ambiguous state.
   */
  execute(request: PaymentExecutionRequest): Promise<PaymentExecutionResult>;
}

// ============================================================================
// SERVICE CALL PARAMS & RESULTS
// ============================================================================

export interface ExecuteReservedPaymentParams {
  /** Target agent ID */
  agentId: string;
  /** Existing reservation ID */
  reservationId: string;
  /** Target execution asset specification */
  asset: ExecutionAsset;
  /** Amount in the execution asset (e.g. "0.005" CELO) */
  executionAmount: string;
  /** Optional purpose description */
  purpose?: string;
}

export interface ExecuteReservedPaymentResult {
  /** High-level success flag */
  success: boolean;
  /** Execution status */
  status: ExecutionStatus;
  /** Transaction hash if submitted */
  txHash?: string;
  /** Updated reservation record reflecting the new state */
  reservation: BudgetReservation;
  /** Optional error message */
  error?: string;
  /** Optional block explorer URL */
  explorerUrl?: string;
}

// ============================================================================
// DOMAIN ERRORS
// ============================================================================

/**
 * Thrown when an execution asset does not match the supported rail
 * or attempts an invalid conversion between accounting and execution assets.
 */
export class AssetMismatchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AssetMismatchError';
  }
}

/**
 * Thrown when attempting to execute against an invalid, nonexistent,
 * already-executed, or non-RESERVED reservation.
 */
export class InvalidReservationError extends Error {
  constructor(public readonly reservationId: string, message: string) {
    super(message);
    this.name = 'InvalidReservationError';
  }
}

/**
 * Thrown when an execution attempt is made for a reservation that is
 * currently already in-flight (preventing race conditions / double broadcast).
 */
export class ExecutionInProgressError extends Error {
  constructor(public readonly reservationId: string) {
    super(`Execution is already in progress for reservation ${reservationId}`);
    this.name = 'ExecutionInProgressError';
  }
}
