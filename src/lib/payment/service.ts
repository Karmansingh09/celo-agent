import { isAddress, getAddress } from 'viem';
import {
  AgentService,
  AgentPausedError,
  AgentTerminatedError,
} from '../agent';
import {
  PolicyEnforcementService,
  EnforcePaymentRequest,
  UserApproval,
  parseCusdToBaseUnits,
} from '../policy';
import {
  AgentPaymentRequest,
  PaymentOrchestrationResult,
  PendingApproval,
  ApprovalStatus,
  PendingApprovalNotFoundError,
  PendingApprovalStateError,
  PendingApprovalExpiredError,
  PaymentIdempotencyConflictError,
  InvalidPaymentInputError,
  generatePaymentRequestId,
} from './types';
import { IPendingApprovalStore } from './pending-approval-store';

/**
 * Phase 8.2: Agent Payment Orchestration Service
 * 
 * Coordinates the application lifecycle between Agent identity/status,
 * Policy & Budget Enforcement, and Pending Human Approvals.
 * 
 * CRITICAL ARCHITECTURAL CONSTRAINTS:
 * 1. Zero Blockchain Execution:
 *    - This service does NOT call Celo RPC, sign transactions, or execute on-chain transfers.
 *    - Execution remains strictly outside this phase.
 * 2. Asset Integrity:
 *    - All amounts are handled strictly in cUSD decimal strings (`amountCusd`).
 *    - cUSD and native CELO are NOT converted or treated as equivalent.
 * 3. Server-Enforced Trust Boundary:
 *    - Identity derives exclusively from `authenticatedOwnerAddress`.
 *    - Spending limits and approval validations are server-enforced.
 * 4. Approval Re-Evaluation:
 *    - Approval-required requests do NOT reserve budget.
 *    - Upon owner approval, policy and daily budget are strictly re-evaluated at approval time.
 */
export class AgentPaymentService {
  /** In-flight approval requests tracked to prevent concurrent race conditions (process-local) */
  private readonly inFlightApprovals: Set<string> = new Set();

  constructor(
    private readonly agentService: AgentService,
    private readonly policyEnforcementService: PolicyEnforcementService,
    private readonly pendingApprovalStore: IPendingApprovalStore,
    private readonly clock: () => number = () => Date.now(),
    private readonly approvalTtlMs: number = 86_400_000 // 24 hours default
  ) {}

  /**
   * Submits a payment request on behalf of an agent.
   * 
   * Flow:
   * 1. Validate request payload syntax.
   * 2. Authorize caller ownership and load agent via AgentService.
   * 3. Confirm agent is ACTIVE (rejects PAUSED or TERMINATED).
   * 4. Check for existing pending approval with same idempotencyKey.
   * 5. Delegate to PolicyEnforcementService for policy and budget evaluation.
   * 6. If RESERVED: return execution-ready result (does NOT execute on-chain).
   * 7. If REQUIRE_USER_APPROVAL: record PendingApproval without reserving budget.
   * 8. Return typed outcome.
   */
  public async requestPayment(
    authenticatedOwnerAddress: string,
    request: AgentPaymentRequest
  ): Promise<PaymentOrchestrationResult> {
    const nowMs = this.clock();

    // 1. Validate request payload syntax
    if (!request || typeof request !== 'object' || Array.isArray(request)) {
      throw new InvalidPaymentInputError('Payment request must be a valid non-null object');
    }

    if (typeof request.agentId !== 'string' || request.agentId.trim() === '') {
      throw new InvalidPaymentInputError('agentId must be a non-empty string');
    }
    const agentId = request.agentId.trim();

    if (typeof request.recipient !== 'string' || !isAddress(request.recipient.trim())) {
      throw new InvalidPaymentInputError(`Invalid recipient EVM address: ${String(request.recipient)}`);
    }
    const normalizedRecipient = getAddress(request.recipient.trim());

    if (typeof request.amountCusd !== 'string' || request.amountCusd.trim() === '') {
      throw new InvalidPaymentInputError('amountCusd must be a non-empty string');
    }
    const rawAmountCusd = request.amountCusd.trim();
    const parsedWei = parseCusdToBaseUnits(rawAmountCusd);
    if (parsedWei === null || parsedWei <= 0n) {
      throw new InvalidPaymentInputError(`Invalid amountCusd format or non-positive value: "${rawAmountCusd}"`);
    }

    if (typeof request.idempotencyKey !== 'string' || request.idempotencyKey.trim() === '') {
      throw new InvalidPaymentInputError('idempotencyKey must be a non-empty string');
    }
    const idempotencyKey = request.idempotencyKey.trim();

    const requestId = request.requestId && request.requestId.trim().length > 0
      ? request.requestId.trim()
      : generatePaymentRequestId(nowMs);

    // 2. Authorize caller ownership and load Agent domain record
    const agent = await this.agentService.getAgentById(authenticatedOwnerAddress, agentId);

    // 3. Confirm Agent lifecycle state
    if (agent.status === 'PAUSED') {
      throw new AgentPausedError(agent.id, 'Cannot request payment for a paused agent');
    }
    if (agent.status === 'TERMINATED') {
      throw new AgentTerminatedError(agent.id, 'Cannot request payment for a terminated agent');
    }

    // 4. Idempotency Check against Pending Approval Store
    const existingPending = await this.pendingApprovalStore.getByIdempotencyKey(agent.id, idempotencyKey);
    if (existingPending) {
      const amountMatches = existingPending.amountCusd === rawAmountCusd;
      const recipientMatches = existingPending.recipient.toLowerCase() === normalizedRecipient.toLowerCase();
      const policyMatches = existingPending.policyId === (request.policyId || agent.spendingPolicy.id || agent.spendingPolicy.policyId);

      if (!amountMatches || !recipientMatches || !policyMatches) {
        return {
          success: false,
          allowedToExecute: false,
          outcome: 'IDEMPOTENCY_CONFLICT',
          reason: 'Idempotency key was previously used with different payment parameters',
          requestId: existingPending.requestId,
          agentId: agent.id,
          amountCusd: rawAmountCusd,
          recipient: normalizedRecipient,
          idempotencyKey,
        };
      }

      if (existingPending.status === 'PENDING') {
        if (nowMs > existingPending.validUntil) {
          await this.pendingApprovalStore.transitionStatus(existingPending.requestId, 'PENDING', 'EXPIRED', {
            statusReason: 'Approval window lapsed',
            resolvedAt: nowMs,
          });
        } else {
          return {
            success: true,
            allowedToExecute: false,
            outcome: 'REQUIRE_USER_APPROVAL',
            reason: 'Payment request requires user approval (pending)',
            requestId: existingPending.requestId,
            agentId: agent.id,
            amountCusd: existingPending.amountCusd,
            recipient: existingPending.recipient,
            idempotencyKey: existingPending.idempotencyKey,
            pendingApproval: existingPending,
          };
        }
      }
    }

    // 5. Delegate to PolicyEnforcementService for policy and budget evaluation
    const enforceRequest: EnforcePaymentRequest = {
      agentId: agent.id,
      amountCusd: rawAmountCusd,
      recipient: normalizedRecipient,
      idempotencyKey,
      policyId: request.policyId || agent.spendingPolicy.id || agent.spendingPolicy.policyId,
    };

    const enforceResult = await this.policyEnforcementService.enforcePayment(
      agent.spendingPolicy,
      enforceRequest
    );

    // 6. Handle Enforcement Outcome
    if (enforceResult.outcome === 'RESERVED') {
      return {
        success: true,
        allowedToExecute: true,
        outcome: 'RESERVED',
        reason: enforceResult.reason,
        requestId,
        agentId: agent.id,
        amountCusd: rawAmountCusd,
        recipient: normalizedRecipient,
        idempotencyKey,
        reservation: enforceResult.reservation,
        budgetState: enforceResult.budgetState,
        policyEvaluation: enforceResult.policyEvaluation,
      };
    }

    if (enforceResult.outcome === 'REQUIRE_USER_APPROVAL') {
      // Create PendingApproval record (budget is NOT reserved)
      const pendingApprovalRecord: PendingApproval = {
        requestId,
        agentId: agent.id,
        amountCusd: rawAmountCusd,
        recipient: normalizedRecipient,
        idempotencyKey,
        policyId: request.policyId || agent.spendingPolicy.id || agent.spendingPolicy.policyId,
        createdAt: nowMs,
        validUntil: nowMs + this.approvalTtlMs,
        status: 'PENDING',
      };

      const createdApproval = await this.pendingApprovalStore.create(pendingApprovalRecord);

      return {
        success: true,
        allowedToExecute: false,
        outcome: 'REQUIRE_USER_APPROVAL',
        reason: enforceResult.reason,
        requestId,
        agentId: agent.id,
        amountCusd: rawAmountCusd,
        recipient: normalizedRecipient,
        idempotencyKey,
        pendingApproval: createdApproval,
        policyEvaluation: enforceResult.policyEvaluation,
      };
    }

    // For POLICY_DENIED, BUDGET_DENIED, DUPLICATE_COMMITTED, DUPLICATE_IN_PROGRESS, IDEMPOTENCY_CONFLICT
    return {
      success: enforceResult.outcome === 'DUPLICATE_COMMITTED',
      allowedToExecute: false,
      outcome: enforceResult.outcome,
      reason: enforceResult.reason,
      requestId,
      agentId: agent.id,
      amountCusd: rawAmountCusd,
      recipient: normalizedRecipient,
      idempotencyKey,
      reservation: enforceResult.reservation,
      budgetState: enforceResult.budgetState,
      policyEvaluation: enforceResult.policyEvaluation,
    };
  }

  /**
   * Authorizes and approves a pending payment request.
   * 
   * Strict Re-evaluation Order:
   * 1. Authenticate caller and load agent.
   * 2. Confirm agent is ACTIVE (PAUSED or TERMINATED agents cannot approve spending).
   * 3. Retrieve pending approval by requestId.
   * 4. Verify approval belongs to target agent.
   * 5. Verify approval status is currently PENDING.
   * 6. Verify approval has not expired (transitions to EXPIRED if lapsed).
   * 7. Construct UserApproval record bound to request parameters and current timestamp.
   * 8. Re-evaluate policy and current daily budget through PolicyEnforcementService.
   * 9. Only if reservation succeeds: transition approval status PENDING -> APPROVED.
   * 10. Return reservation result.
   */
  public async approvePaymentRequest(
    authenticatedOwnerAddress: string,
    agentId: string,
    requestId: string
  ): Promise<PaymentOrchestrationResult> {
    if (this.inFlightApprovals.has(requestId)) {
      throw new PendingApprovalStateError(
        requestId,
        'PENDING',
        `Approval for request ${requestId} is already in progress`
      );
    }

    this.inFlightApprovals.add(requestId);
    try {
      const nowMs = this.clock();

      // 1 & 2. Authenticate ownership and load Agent
      const agent = await this.agentService.getAgentById(authenticatedOwnerAddress, agentId);

      if (agent.status === 'PAUSED') {
        throw new AgentPausedError(agent.id, 'Cannot approve payment for a paused agent');
      }
      if (agent.status === 'TERMINATED') {
        throw new AgentTerminatedError(agent.id, 'Cannot approve payment for a terminated agent');
      }

      // 3 & 4. Load and verify pending approval
      const pending = await this.pendingApprovalStore.getByRequestId(requestId);
      if (!pending || pending.agentId !== agent.id) {
        throw new PendingApprovalNotFoundError(requestId);
      }

      // 5. Confirm status is PENDING
      if (pending.status !== 'PENDING') {
        throw new PendingApprovalStateError(
          pending.requestId,
          pending.status,
          `Cannot approve request ${pending.requestId}: approval is already ${pending.status}`
        );
      }

      // 6. Check expiration
      if (nowMs > pending.validUntil) {
        await this.pendingApprovalStore.transitionStatus(pending.requestId, 'PENDING', 'EXPIRED', {
          statusReason: 'Approval validity window expired',
          resolvedAt: nowMs,
        });
        throw new PendingApprovalExpiredError(pending.requestId, pending.validUntil);
      }

      // 7. Construct parameter-bound UserApproval attestation
      const boundApproval: UserApproval = {
        approvalId: `appr_${nowMs.toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
        agentId: agent.id,
        amountCusd: pending.amountCusd,
        recipient: pending.recipient,
        idempotencyKey: pending.idempotencyKey,
        policyId: pending.policyId || agent.spendingPolicy.id || agent.spendingPolicy.policyId,
        approvedAt: nowMs,
        validUntil: pending.validUntil,
      };

      // 8. Re-evaluate policy and reserve budget
      const enforceRequest: EnforcePaymentRequest = {
        agentId: agent.id,
        amountCusd: pending.amountCusd,
        recipient: pending.recipient,
        idempotencyKey: pending.idempotencyKey,
        policyId: pending.policyId || agent.spendingPolicy.id || agent.spendingPolicy.policyId,
        approval: boundApproval,
      };

      const enforceResult = await this.policyEnforcementService.enforcePayment(
        agent.spendingPolicy,
        enforceRequest
      );

      // If policy or budget denies, do NOT mark approval as APPROVED
      if (enforceResult.outcome !== 'RESERVED') {
        return {
          success: false,
          allowedToExecute: false,
          outcome: enforceResult.outcome,
          reason: enforceResult.reason,
          requestId: pending.requestId,
          agentId: agent.id,
          amountCusd: pending.amountCusd,
          recipient: pending.recipient,
          idempotencyKey: pending.idempotencyKey,
          pendingApproval: pending,
          policyEvaluation: enforceResult.policyEvaluation,
          budgetState: enforceResult.budgetState,
        };
      }

      // 9. Transition approval status PENDING -> APPROVED atomically
      const updatedApproval = await this.pendingApprovalStore.transitionStatus(
        pending.requestId,
        'PENDING',
        'APPROVED',
        {
          statusReason: 'Approved by authenticated owner',
          resolvedAt: nowMs,
        }
      );

      // 10. Return reservation result
      return {
        success: true,
        allowedToExecute: true,
        outcome: 'RESERVED',
        reason: enforceResult.reason,
        requestId: pending.requestId,
        agentId: agent.id,
        amountCusd: pending.amountCusd,
        recipient: pending.recipient,
        idempotencyKey: pending.idempotencyKey,
        reservation: enforceResult.reservation,
        budgetState: enforceResult.budgetState,
        pendingApproval: updatedApproval,
        policyEvaluation: enforceResult.policyEvaluation,
      };
    } finally {
      this.inFlightApprovals.delete(requestId);
    }
  }

  /**
   * Rejects a pending payment request.
   * Rejection releases no budget since pending approvals never encumber funds.
   */
  public async rejectPaymentRequest(
    authenticatedOwnerAddress: string,
    agentId: string,
    requestId: string,
    reason?: string
  ): Promise<PendingApproval> {
    const nowMs = this.clock();

    // 1. Authenticate ownership and load Agent
    const agent = await this.agentService.getAgentById(authenticatedOwnerAddress, agentId);

    // 2. Load pending approval
    const pending = await this.pendingApprovalStore.getByRequestId(requestId);
    if (!pending || pending.agentId !== agent.id) {
      throw new PendingApprovalNotFoundError(requestId);
    }

    // 3. Confirm status is PENDING
    if (pending.status !== 'PENDING') {
      throw new PendingApprovalStateError(
        pending.requestId,
        pending.status,
        `Cannot reject request ${pending.requestId}: approval is already ${pending.status}`
      );
    }

    // 4. Transition status PENDING -> REJECTED
    return this.pendingApprovalStore.transitionStatus(
      pending.requestId,
      'PENDING',
      'REJECTED',
      {
        statusReason: reason || 'Rejected by authenticated owner',
        resolvedAt: nowMs,
      }
    );
  }

  /**
   * Retrieves a single pending approval record after verifying owner authorization.
   */
  public async getPendingApproval(
    authenticatedOwnerAddress: string,
    agentId: string,
    requestId: string
  ): Promise<PendingApproval> {
    const agent = await this.agentService.getAgentById(authenticatedOwnerAddress, agentId);

    const pending = await this.pendingApprovalStore.getByRequestId(requestId);
    if (!pending || pending.agentId !== agent.id) {
      throw new PendingApprovalNotFoundError(requestId);
    }

    return pending;
  }

  /**
   * Lists pending approvals for an agent after verifying owner authorization.
   */
  public async listPendingApprovals(
    authenticatedOwnerAddress: string,
    agentId: string,
    status?: ApprovalStatus
  ): Promise<PendingApproval[]> {
    const agent = await this.agentService.getAgentById(authenticatedOwnerAddress, agentId);
    return this.pendingApprovalStore.listByAgentId(agent.id, status);
  }
}
