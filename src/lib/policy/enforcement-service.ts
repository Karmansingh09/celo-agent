import {
  AgentSpendingPolicy,
  PolicyEvaluationResult,
  validatePolicyStructure,
} from './types';
import { evaluatePolicy } from './evaluator';
import {
  AgentBudgetState,
  BudgetReservation,
  IBudgetStore,
  ReservationRequest,
  parseCusdToBaseUnits,
} from './budget-types';

/**
 * Phase 6.3: Policy and Budget Enforcement Integration
 * 
 * Provides the unified pre-execution enforcement coordinator for CeloAgent payments.
 * Connects the pure policy evaluator (evaluatePolicy) with the atomic budget store (IBudgetStore).
 * 
 * DESIGN PRINCIPLES & TRUST BOUNDARIES:
 * 1. Pre-Execution Gate: Ensures every payment request satisfies spending policies,
 *    recipient allowlists, approval thresholds, idempotency requirements, and daily budget limits
 *    before any blockchain transaction can be dispatched.
 * 2. Strict Separation of Concerns: This service NEVER executes blockchain transactions, signs
 *    payloads, or talks to Celo RPC nodes. Payment execution remains strictly outside this service.
 * 3. Approval Representation & Policy Identity Binding:
 *    - A raw boolean (`userApproved: true`) is NEVER accepted as authorization.
 *    - Requests requiring approval must provide a `UserApproval` record bound to the exact
 *      agent ID, amount, recipient address, idempotency key, and active policy identity.
 *    - When the active policy has an identity (e.g. `policyId`), the approval MUST include
 *      that exact `policyId`. Unbound or mismatched approvals are strictly rejected.
 *    - Stale approvals (`now > validUntil`), future timestamps, or parameter mismatches are rejected.
 *    - DOMAIN SECURITY LIMITATION: In this standalone domain phase, UserApproval validates structural
 *      metadata, exact parameter bindings, and time validity. Cryptographic signature verification of
 *      the human signer (e.g., EIP-712 or authenticated user session tokens) must be performed by
 *      the API/auth gateway prior to constructing the UserApproval record.
 * 4. Trusted Time:
 *    - Callers submitting payment requests cannot supply their own timestamps.
 *    - The service uses an internal trusted clock (with optional constructor injection for testing)
 *      to ensure callers cannot backdate requests to bypass policy expiry or shift daily windows.
 * 5. Distinct Transaction Lifecycle & Settlement Evidence:
 *    - Broadcasting a transaction to the network transitions reservation to SUBMITTED via `markSubmitted`.
 *      The amount remains encumbered in `reservedWei` and is NOT settled.
 *    - A reservation becomes COMMITTED via `confirmSettlement` ONLY when verified on-chain inclusion
 *      evidence (`SettlementEvidence` with a valid 32-byte txHash) is supplied by a trusted internal caller
 *      (e.g., payment execution pipeline). The domain layer does NOT pretend to query RPC directly.
 *    - Unconfirmed/timed-out transactions transition to HELD_FOR_RECONCILIATION via `holdForReconciliation`,
 *      preserving encumbrance to prevent double-spending until an explicit reconciliation process resolves it.
 */

/**
 * Explicit, parameter-bound approval record for payments exceeding auto-approval thresholds.
 */
export interface UserApproval {
  /** Unique identifier for the user approval action / audit record */
  approvalId: string;
  /** The agent ID this approval is bound to */
  agentId: string;
  /** The exact cUSD amount authorized (must match request amount) */
  amountCusd: string;
  /** The exact recipient address authorized (must match request recipient) */
  recipient: string;
  /** The exact idempotency key or request ID bound to this approval */
  idempotencyKey: string;
  /**
   * Policy identifier or version under which approval was granted.
   * Required whenever the active spending policy defines an identity.
   */
  policyId?: string;
  /** Timestamp (Unix ms) when the user granted approval */
  approvedAt: number;
  /** Timestamp (Unix ms) until which this approval remains valid (prevents stale approval execution) */
  validUntil: number;
}

/**
 * Settlement confirmation attestation supplied by a trusted internal caller
 * (e.g. payment execution pipeline) after receipt confirmation has been observed.
 * 
 * CRITICAL TRUST BOUNDARY & ARCHITECTURAL LIMITATION:
 * 1. This domain service does NOT independently connect to Celo RPC, inspect mempools,
 *    or verify cryptographic Merkle inclusion proofs.
 * 2. Supplying this object asserts that the trusted calling layer has already independently
 *    verified the on-chain transaction receipt.
 * 3. Checking the 32-byte 0x-prefixed hex format of `confirmation.txHash` is solely a defensive
 *    syntax sanity check; it does NOT prove or verify that the transaction succeeded or confirmed on-chain.
 */
export interface TrustedSettlementConfirmation {
  /** 32-byte 0x-prefixed transaction hash verified on-chain by the trusted caller */
  txHash: string;
  /** Optional block number where transaction inclusion was observed */
  blockNumber?: bigint | number;
  /** Optional timestamp when confirmation was observed */
  confirmedAt?: number;
  /** Optional identifier or name of the trusted subsystem providing this attestation */
  attestedBy?: string;
}

/**
 * Payment request submitted to the enforcement service.
 * Note: Untrusted caller timestamps are NOT accepted. The service's trusted clock governs time.
 */
export interface EnforcePaymentRequest {
  /** Unique identifier of the agent requesting payment */
  agentId: string;
  /** Requested payment amount in cUSD (decimal string e.g., "0.08") */
  amountCusd: string;
  /** Recipient EVM address (0x...) */
  recipient: string;
  /** Unique client idempotency key (scoped per agentId) */
  idempotencyKey: string;
  /** Optional policy identifier associated with the request */
  policyId?: string;
  /**
   * Explicit parameter-bound approval record required for payments exceeding auto-approval thresholds.
   * If omitted or undefined, request is treated as unapproved.
   */
  approval?: UserApproval;
}

/**
 * Typed outcomes classification for policy and budget enforcement.
 */
export type EnforcementOutcome =
  | 'RESERVED'
  | 'POLICY_DENIED'
  | 'REQUIRE_USER_APPROVAL'
  | 'BUDGET_DENIED'
  | 'DUPLICATE_IN_PROGRESS'
  | 'DUPLICATE_COMMITTED'
  | 'IDEMPOTENCY_CONFLICT';

/**
 * Structured result returned by the enforcement service.
 */
export interface EnforcementResult {
  /**
   * Whether the payment is fully authorized and daily budget has been reserved,
   * permitting on-chain execution.
   */
  allowedToExecute: boolean;
  /** Explicit typed outcome classification */
  outcome: EnforcementOutcome;
  /** Human-readable explanation of the outcome */
  reason: string;
  /** Result from the pure policy evaluator */
  policyEvaluation?: PolicyEvaluationResult;
  /** The acquired or matched budget reservation record (if reserved or duplicate) */
  reservation?: BudgetReservation;
  /** Snapshot of the agent's budget state (if budget store was consulted) */
  budgetState?: AgentBudgetState;
}

/** Function signature for a trusted clock provider */
export type ClockFn = () => number;

/**
 * Coordinates spending policy evaluation and budget reservation for autonomous agent payments.
 */
export class PolicyEnforcementService {
  constructor(
    private readonly budgetStore: IBudgetStore,
    private readonly clock: ClockFn = () => Date.now()
  ) {}

  /**
   * Evaluates a payment request against policy rules and daily budget constraints.
   * 
   * Order of evaluation:
   * 1. Acquire trusted timestamp from service clock (callers cannot dictate time).
   * 2. Validate policy structure and policy ID consistency.
   * 3. Evaluate pure policy rules (expiration, agent match, amount syntax, recipient allowlist, per-tx limit).
   * 4. Deny immediately on policy violation without touching budget store.
   * 5. Handle approval-required requests:
   *    - If no approval provided, return REQUIRE_USER_APPROVAL without reserving funds.
   *    - If approval provided, strictly validate parameter bindings, policy identity binding, and expiration.
   * 6. Validate idempotency key prior to budget reservation.
   * 7. Acquire daily budget reservation against IBudgetStore using trusted time.
   * 8. Return typed outcome and execution permission.
   */
  public async enforcePayment(
    policy: AgentSpendingPolicy,
    request: EnforcePaymentRequest
  ): Promise<EnforcementResult> {
    // 1. Trusted Time: Always use service-side clock (prevents backdating attacks)
    const trustedNow = this.clock();

    // 2. Validate Policy Structure
    const policyStructCheck = validatePolicyStructure(policy);
    if (!policyStructCheck.valid) {
      return {
        allowedToExecute: false,
        outcome: 'POLICY_DENIED',
        reason: policyStructCheck.error || 'Invalid spending policy structure',
        policyEvaluation: {
          decision: 'DENY',
          reason: policyStructCheck.error || 'Invalid spending policy structure',
          agentId: request.agentId,
          evaluatedAt: trustedNow,
        },
      };
    }

    // 3. Policy Identifier Consistency Check (if defined on policy object)
    const policyRecord = policy as unknown as Record<string, unknown>;
    const policyIdOnPolicy =
      typeof policyRecord.id === 'string'
        ? policyRecord.id
        : typeof policyRecord.policyId === 'string'
        ? policyRecord.policyId
        : undefined;

    if (policyIdOnPolicy && request.policyId && policyIdOnPolicy !== request.policyId) {
      return {
        allowedToExecute: false,
        outcome: 'POLICY_DENIED',
        reason: `Policy ID mismatch: requested with policy ID ${request.policyId}, but policy is ${policyIdOnPolicy}`,
        policyEvaluation: {
          decision: 'DENY',
          reason: `Policy ID mismatch: requested with policy ID ${request.policyId}, but policy is ${policyIdOnPolicy}`,
          agentId: request.agentId,
          evaluatedAt: trustedNow,
        },
      };
    }

    // 4. Evaluate Pure Policy Rules using trusted time
    const policyEvaluation = evaluatePolicy(
      policy,
      {
        agentId: request.agentId,
        amount: request.amountCusd,
        recipient: request.recipient,
      },
      trustedNow
    );

    // 5. Handle Policy Denial
    if (policyEvaluation.decision === 'DENY') {
      return {
        allowedToExecute: false,
        outcome: 'POLICY_DENIED',
        reason: policyEvaluation.reason,
        policyEvaluation,
      };
    }

    // 6. Handle Approval-Required Requests
    if (policyEvaluation.decision === 'REQUIRE_USER_APPROVAL') {
      if (!request.approval) {
        return {
          allowedToExecute: false,
          outcome: 'REQUIRE_USER_APPROVAL',
          reason: policyEvaluation.reason,
          policyEvaluation,
        };
      }

      // Validate bound approval integrity:
      // a. Agent match
      if (request.approval.agentId !== request.agentId) {
        return {
          allowedToExecute: false,
          outcome: 'POLICY_DENIED',
          reason: `User approval mismatch: approval is bound to agent ${request.approval.agentId}, but request is for ${request.agentId}`,
          policyEvaluation,
        };
      }

      // b. Recipient address match (case-insensitive)
      if (request.approval.recipient.trim().toLowerCase() !== request.recipient.trim().toLowerCase()) {
        return {
          allowedToExecute: false,
          outcome: 'POLICY_DENIED',
          reason: `User approval mismatch: approval is bound to recipient ${request.approval.recipient}, but request is for ${request.recipient}`,
          policyEvaluation,
        };
      }

      // c. Amount match (exact BigInt comparison)
      const approvedAmountWei = parseCusdToBaseUnits(request.approval.amountCusd);
      const requestedAmountWei = parseCusdToBaseUnits(request.amountCusd);
      if (approvedAmountWei === null || requestedAmountWei === null || approvedAmountWei !== requestedAmountWei) {
        return {
          allowedToExecute: false,
          outcome: 'POLICY_DENIED',
          reason: `User approval mismatch: approved amount (${request.approval.amountCusd}) does not match requested amount (${request.amountCusd})`,
          policyEvaluation,
        };
      }

      // d. Idempotency key match
      if (request.approval.idempotencyKey !== request.idempotencyKey) {
        return {
          allowedToExecute: false,
          outcome: 'POLICY_DENIED',
          reason: `User approval mismatch: approval is bound to idempotency key ${request.approval.idempotencyKey}, but request is for ${request.idempotencyKey}`,
          policyEvaluation,
        };
      }

      // e. Strict Policy ID Binding Check
      const effectivePolicyId = policyIdOnPolicy || request.policyId;
      if (effectivePolicyId) {
        if (!request.approval.policyId || request.approval.policyId.trim() === '') {
          return {
            allowedToExecute: false,
            outcome: 'POLICY_DENIED',
            reason: `User approval missing required policy binding: active policy has ID "${effectivePolicyId}", but approval omitted policyId`,
            policyEvaluation,
          };
        }
        if (request.approval.policyId !== effectivePolicyId) {
          return {
            allowedToExecute: false,
            outcome: 'POLICY_DENIED',
            reason: `User approval mismatch: approval is bound to policy "${request.approval.policyId}", but active policy is "${effectivePolicyId}"`,
            policyEvaluation,
          };
        }
      } else if (request.approval.policyId) {
        return {
          allowedToExecute: false,
          outcome: 'POLICY_DENIED',
          reason: `User approval mismatch: approval is bound to policy "${request.approval.policyId}", but active policy has no ID`,
          policyEvaluation,
        };
      }

      // f. Expiry / freshness check
      if (trustedNow > request.approval.validUntil) {
        return {
          allowedToExecute: false,
          outcome: 'POLICY_DENIED',
          reason: `User approval has expired at ${new Date(request.approval.validUntil).toISOString()}`,
          policyEvaluation,
        };
      }

      // g. Timestamp sanity check (no future approvals)
      if (request.approval.approvedAt > trustedNow) {
        return {
          allowedToExecute: false,
          outcome: 'POLICY_DENIED',
          reason: 'User approval timestamp is in the future',
          policyEvaluation,
        };
      }
    }

    // 7. Validate Idempotency Key prior to budget reservation
    if (!request.idempotencyKey || request.idempotencyKey.trim() === '') {
      return {
        allowedToExecute: false,
        outcome: 'POLICY_DENIED',
        reason: 'Missing or empty idempotencyKey',
        policyEvaluation,
      };
    }

    // 8. Acquire Daily Budget Reservation
    const effectivePolicyId = policyIdOnPolicy || request.policyId;
    const reservationRequest: ReservationRequest = {
      agentId: request.agentId,
      policyId: effectivePolicyId,
      amountCusd: request.amountCusd,
      recipient: request.recipient,
      idempotencyKey: request.idempotencyKey,
      timestamp: trustedNow,
    };

    const reservationResult = await this.budgetStore.acquireReservation(
      reservationRequest,
      policy.maxPerDay
    );

    policyEvaluation.remainingDailyBudget = reservationResult.budgetState.availableCusd;

    // 9. Map Reservation Result to Typed Enforcement Outcomes
    switch (reservationResult.outcome) {
      case 'RESERVED':
        return {
          allowedToExecute: true,
          outcome: 'RESERVED',
          reason: reservationResult.reason || 'Payment policy passed and daily budget reserved',
          policyEvaluation,
          reservation: reservationResult.reservation,
          budgetState: reservationResult.budgetState,
        };

      case 'DENIED':
        return {
          allowedToExecute: false,
          outcome: 'BUDGET_DENIED',
          reason: reservationResult.reason || 'Daily budget exceeded',
          policyEvaluation,
          reservation: reservationResult.reservation,
          budgetState: reservationResult.budgetState,
        };

      case 'DUPLICATE_IN_PROGRESS':
        return {
          allowedToExecute: false,
          outcome: 'DUPLICATE_IN_PROGRESS',
          reason:
            reservationResult.reason ||
            'Payment reservation currently in progress for this idempotency key',
          policyEvaluation,
          reservation: reservationResult.reservation,
          budgetState: reservationResult.budgetState,
        };

      case 'DUPLICATE_COMMITTED':
        return {
          allowedToExecute: false,
          outcome: 'DUPLICATE_COMMITTED',
          reason:
            reservationResult.reason ||
            'Payment already completed on-chain for this idempotency key',
          policyEvaluation,
          reservation: reservationResult.reservation,
          budgetState: reservationResult.budgetState,
        };

      case 'IDEMPOTENCY_CONFLICT':
        return {
          allowedToExecute: false,
          outcome: 'IDEMPOTENCY_CONFLICT',
          reason:
            reservationResult.reason ||
            'Idempotency key was previously used with different payment parameters',
          policyEvaluation,
          reservation: reservationResult.reservation,
          budgetState: reservationResult.budgetState,
        };
    }
  }

  /**
   * Phase 1 of execution lifecycle: marks a reservation as SUBMITTED after broadcasting to Celo.
   * Stores the transaction hash and transitions status to SUBMITTED.
   * 
   * CRITICAL GUARANTEE:
   * The requested amount remains encumbered in `reservedWei`! This does NOT mark the transaction
   * as settled or committed, preventing double-spending while the transaction is in flight.
   */
  public async markSubmitted(reservationId: string, txHash: string): Promise<BudgetReservation> {
    return this.budgetStore.markSubmitted(reservationId, txHash);
  }

  /**
   * Phase 2 of execution lifecycle: transitions reservation to COMMITTED upon notification
   * of on-chain confirmation from a trusted internal caller.
   * 
   * CRITICAL TRUST BOUNDARY & CALLER RESPONSIBILITY:
   * 1. This domain method does NOT query Celo RPC or verify blockchain receipts.
   * 2. Checking the syntax of `confirmation.txHash` is purely a defensive format filter
   *    (requiring a 32-byte 0x-prefixed hex string). It DOES NOT verify receipt confirmation
   *    or prove successful on-chain settlement.
   * 3. Calling this method permanently moves funds from `reservedWei` into `spentWei`.
   *    Therefore, ONLY trusted internal callers (e.g. the payment service following receipt
   *    verification) may invoke this method. Untrusted callers must never invoke it.
   * 
   * @param reservationId The unique reservation ID
   * @param confirmation Attestation record supplied by the trusted execution layer asserting receipt confirmation
   */
  public async confirmSettlement(
    reservationId: string,
    confirmation: TrustedSettlementConfirmation
  ): Promise<BudgetReservation> {
    if (
      !confirmation ||
      typeof confirmation !== 'object' ||
      typeof confirmation.txHash !== 'string' ||
      !/^0x[a-fA-F0-9]{64}$/.test(confirmation.txHash.trim())
    ) {
      throw new Error(
        'confirmSettlement requires a valid TrustedSettlementConfirmation containing a 32-byte 0x transaction hash'
      );
    }
    // Safely attempt to record submitted state with verified txHash if currently RESERVED
    try {
      await this.budgetStore.markSubmitted(reservationId, confirmation.txHash.trim());
    } catch {
      // If already SUBMITTED, COMMITTED (idempotent call), or HELD_FOR_RECONCILIATION,
      // markSubmitted throws an invalid transition. We proceed to commitReservation,
      // which definitively verifies the permitted lifecycle states and prevents illegal transitions.
    }
    return this.budgetStore.commitReservation(reservationId);
  }

  /**
   * Post-execution failure: releases reservation after an on-chain revert or pre-execution error.
   * Transitions status to RELEASED, returning amountWei from reservedWei back into available daily budget.
   */
  public async failAndRelease(reservationId: string, reason: string): Promise<BudgetReservation> {
    return this.budgetStore.releaseReservation(reservationId, reason);
  }

  /**
   * Post-execution timeout / uncertain status: holds reservation for reconciliation.
   * Transitions status to HELD_FOR_RECONCILIATION.
   * 
   * CRITICAL GUARANTEE:
   * Amount remains encumbered in reservedWei to prevent overspending until reconciliation confirms status.
   * Does NOT automatically release uncertain reservations.
   */
  public async holdForReconciliation(
    reservationId: string,
    reason: string
  ): Promise<BudgetReservation> {
    return this.budgetStore.holdForReconciliation(reservationId, reason);
  }

  /**
   * Retrieves the current budget state snapshot for an agent in a specific UTC window.
   */
  public async getBudgetState(
    agentId: string,
    windowId: string,
    dailyLimitCusd: string
  ): Promise<AgentBudgetState> {
    return this.budgetStore.getBudgetState(agentId, windowId, dailyLimitCusd);
  }
}
