import { PolicyEvaluationResult } from '../policy/types';
import { EnforcementOutcome } from '../policy/enforcement-service';
import {
  AgentBudgetState,
  BudgetReservation,
} from '../policy/budget-types';
import { randomBytes } from 'crypto';

/**
 * Phase 8.2: Agent Payment Orchestration & Pending Approval Types
 * 
 * Defines the domain model, state machines, and error types for orchestrating
 * agent payments, policy enforcement, and asynchronous approval workflows.
 * 
 * TRUST MODEL & ARCHITECTURAL BOUNDARIES:
 * 1. Server-Enforced Policy Execution:
 *    - All spending checks and approval verifications are enforced by the server-side runtime.
 *    - This architecture is NOT trustless and does NOT claim resistance to full backend compromise.
 * 2. Strict Asset Boundary:
 *    - All payment amounts are denominated strictly in cUSD decimal strings (`amountCusd`).
 *    - cUSD and native CELO are NOT equivalent; no conversion between cUSD and CELO is performed here.
 * 3. Separation of Request ID and Idempotency Key:
 *    - `requestId`: Globally unique identifier for the payment request and pending approval resource.
 *    - `idempotencyKey`: Client-provided key for deduplication and replay protection.
 * 4. Approval Is NOT a Budget Reservation:
 *    - Requests requiring approval do NOT hold or encumber daily budget.
 *    - When approved, policy and budget are strictly re-evaluated against the current policy and window state.
 */

// ============================================================================
// APPROVAL LIFECYCLE STATES
// ============================================================================

/**
 * Deterministic lifecycle states for a pending payment approval.
 * - PENDING: Awaiting explicit owner review; no budget reserved.
 * - APPROVED: Owner authorized the payment; policy & budget re-evaluated and reserved.
 * - REJECTED: Owner explicitly declined the payment request; no funds encumbered.
 * - EXPIRED: Approval window lapsed before owner action; cannot be approved.
 * - CANCELLED: Voided due to agent termination or explicit cancellation.
 */
export type ApprovalStatus =
  | 'PENDING'
  | 'APPROVED'
  | 'REJECTED'
  | 'EXPIRED'
  | 'CANCELLED';

/**
 * Represents a payment request awaiting human approval.
 */
export interface PendingApproval {
  /** Unique identifier for the payment/approval request resource */
  readonly requestId: string;
  /** Target agent ID */
  readonly agentId: string;
  /** Requested payment amount in cUSD (e.g. "0.15") */
  readonly amountCusd: string;
  /** Intended recipient EVM address */
  readonly recipient: string;
  /** Client-provided idempotency key */
  readonly idempotencyKey: string;
  /** Active policy ID under which the request was evaluated */
  readonly policyId?: string;
  /** Timestamp when pending approval was recorded (Unix ms) */
  readonly createdAt: number;
  /** Timestamp until which this approval remains actionable (Unix ms) */
  validUntil: number;
  /** Current approval lifecycle status */
  status: ApprovalStatus;
  /** Optional human-readable explanation for state transitions */
  statusReason?: string;
  /** Timestamp when approval reached a terminal state (Unix ms) */
  resolvedAt?: number;
}

// ============================================================================
// PAYMENT REQUEST & ORCHESTRATION TYPES
// ============================================================================

/**
 * Input parameters for submitting a payment request for an autonomous agent.
 */
export interface AgentPaymentRequest {
  /** Optional custom request ID; automatically generated if omitted */
  requestId?: string;
  /** Target agent identifier */
  agentId: string;
  /** Payment amount in cUSD (decimal string e.g. "0.08") */
  amountCusd: string;
  /** Recipient EVM address (0x...) */
  recipient: string;
  /** Unique client idempotency key (scoped per agentId) */
  idempotencyKey: string;
  /** Optional policy identifier associated with the request */
  policyId?: string;
  /** Optional human-readable purpose description */
  purpose?: string;
}

/**
 * Reuses established policy enforcement outcome classifications.
 */
export type PaymentOrchestrationOutcome = EnforcementOutcome;

/**
 * Structured outcome returned by the AgentPaymentService orchestration.
 */
export interface PaymentOrchestrationResult {
  /** Whether the request was processed successfully (either reserved or pending approval) */
  success: boolean;
  /** Whether the payment has been authorized and budget reserved, ready for on-chain execution */
  allowedToExecute: boolean;
  /** Explicit typed outcome classification */
  outcome: PaymentOrchestrationOutcome;
  /** Human-readable explanation of the outcome */
  reason: string;
  /** Unique request ID identifying this payment operation */
  requestId: string;
  /** Target agent identifier */
  agentId: string;
  /** Requested amount in cUSD */
  amountCusd: string;
  /** Recipient address */
  recipient: string;
  /** Client idempotency key */
  idempotencyKey: string;
  /** Acquired or existing budget reservation (present when RESERVED or DUPLICATE) */
  reservation?: BudgetReservation;
  /** Snapshot of the agent's budget state */
  budgetState?: AgentBudgetState;
  /** Created or existing pending approval record (present when REQUIRE_USER_APPROVAL) */
  pendingApproval?: PendingApproval;
  /** Result from the pure policy evaluator */
  policyEvaluation?: PolicyEvaluationResult;
}

// ============================================================================
// DOMAIN ERRORS
// ============================================================================

export class PendingApprovalNotFoundError extends Error {
  constructor(public readonly requestId: string) {
    super(`Pending approval not found: ${requestId}`);
    this.name = 'PendingApprovalNotFoundError';
  }
}

export class PendingApprovalStateError extends Error {
  constructor(
    public readonly requestId: string,
    public readonly currentStatus: ApprovalStatus,
    message?: string
  ) {
    super(
      message ||
        `Pending approval ${requestId} is currently ${currentStatus} and cannot undergo this transition`
    );
    this.name = 'PendingApprovalStateError';
  }
}

export class PendingApprovalExpiredError extends Error {
  constructor(public readonly requestId: string, public readonly validUntil: number) {
    super(
      `Pending approval ${requestId} has expired at ${new Date(validUntil).toISOString()}`
    );
    this.name = 'PendingApprovalExpiredError';
  }
}

export class PaymentIdempotencyConflictError extends Error {
  constructor(public readonly idempotencyKey: string, message?: string) {
    super(
      message ||
        `Idempotency conflict for key "${idempotencyKey}": request parameters do not match previous request`
    );
    this.name = 'PaymentIdempotencyConflictError';
  }
}

export class InvalidPaymentInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidPaymentInputError';
  }
}

// ============================================================================
// IDENTIFIER HELPERS
// ============================================================================

const PAYMENT_REQUEST_ID_REGEX = /^req_[a-zA-Z0-9_-]{8,64}$/;

/**
 * Generates a unique, URL-safe payment request ID.
 * Format: "req_<base36_time>_<random_hex>"
 */
export function generatePaymentRequestId(nowMs: number = Date.now()): string {
  if (typeof nowMs !== 'number' || !Number.isFinite(nowMs)) {
    throw new RangeError(`Invalid timestamp provided to generatePaymentRequestId: ${nowMs}`);
  }
  const floored = Math.floor(nowMs);
  const timePart = floored.toString(36);
  const randomHex = randomBytes(4).toString('hex');
  return `req_${timePart}_${randomHex}`;
}

/**
 * Validates whether a string matches the required payment request ID format.
 */
export function isValidPaymentRequestId(id: unknown): id is string {
  return typeof id === 'string' && PAYMENT_REQUEST_ID_REGEX.test(id.trim());
}
