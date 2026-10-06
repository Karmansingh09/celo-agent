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
  TrustedSettlementConfirmation,
  BudgetReservation,
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
import {
  IPaymentExecutor,
  ExecuteReservedPaymentParams,
  ExecuteReservedPaymentResult,
  AssetMismatchError,
  InvalidReservationError,
  ExecutionInProgressError,
} from './execution-types';
import { CeloPaymentExecutor } from './execution';

/**
 * Phase 8.2 / 8.3: Agent Payment Orchestration Service
 * 
 * Coordinates the application lifecycle between Agent identity/status,
 * Policy & Budget Enforcement, Pending Human Approvals, and the Controlled Execution Boundary.
 * 
 * CRITICAL ARCHITECTURAL CONSTRAINTS:
 * 1. Controlled Execution Boundary:
 *    - All on-chain interactions go through `IPaymentExecutor`.
 *    - Process-local concurrency guards prevent duplicate concurrent executions of the same reservation.
 * 2. Asset Integrity:
 *    - Policy and accounting domains operate strictly in cUSD decimal strings (`amountCusd`).
 *    - Execution rails (such as native CELO) are distinct; cUSD and CELO are NOT converted or treated as 1:1.
 * 3. Server-Enforced Trust Boundary:
 *    - Identity derives exclusively from `authenticatedOwnerAddress`.
 *    - Spending limits, tenant isolation, and approval validations are server-enforced.
 * 4. Submission vs. Settlement Separation:
 *    - Network broadcast transitions reservation to `SUBMITTED`.
 *    - Moving funds permanently into `COMMITTED` requires settlement confirmation.
 */
export class AgentPaymentService {
  /** In-flight approval requests tracked to prevent concurrent race conditions (process-local) */
  private readonly inFlightApprovals: Set<string> = new Set();

  /** In-flight execution attempts tracked to prevent duplicate execution attempts (process-local) */
  private readonly inFlightExecutions: Set<string> = new Set();

  private readonly paymentExecutor: IPaymentExecutor;

  constructor(
    private readonly agentService: AgentService,
    private readonly policyEnforcementService: PolicyEnforcementService,
    private readonly pendingApprovalStore: IPendingApprovalStore,
    private readonly clock: () => number = () => Date.now(),
    private readonly approvalTtlMs: number = 86_400_000, // 24 hours default
    paymentExecutor?: IPaymentExecutor
  ) {
    this.paymentExecutor = paymentExecutor || new CeloPaymentExecutor();
  }

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

  // ============================================================================
  // PHASE 8.3: CONTROLLED PAYMENT EXECUTION BOUNDARY
  // ============================================================================

  /**
   * Executes a previously reserved payment on the underlying Celo payment rail.
   * 
   * Strict Invariants & Guarantees:
   * 1. Tenant & Agent Authorization:
   *    - Authenticates that `authenticatedOwnerAddress` owns `agentId`.
   *    - Ensures the agent is active (not PAUSED or TERMINATED).
   * 2. Reservation Integrity:
   *    - Loads the reservation by ID via `PolicyEnforcementService`.
   *    - Validates that the reservation belongs to `agentId`.
   *    - Validates that the reservation status is strictly `RESERVED`.
   * 3. Asset Boundary & Conversion Safety:
   *    - Explicitly checks that the execution asset is supported (`NATIVE_CELO`).
   *    - Does NOT convert `amountCusd` -> `amountCelo` or treat them as 1:1.
   *    - If an invalid or unconfigured asset is requested, throws `AssetMismatchError`.
   * 4. In-Flight Execution Guard:
   *    - Process-local concurrency lock prevents double-submission for the same reservation.
   * 5. Submission vs. Settlement Separation:
   *    - On successful broadcast (`status: 'SUBMITTED'`), calls `policyEnforcementService.markSubmitted(reservationId, txHash)`.
   *    - Does NOT mark `COMMITTED` at submission time.
   * 6. Failure & Reconciliation Safety:
   *    - On deterministic/known pre-submission failure (`status: 'FAILED'`), calls `policyEnforcementService.failAndRelease(reservationId, error)`.
   *    - On timeout/ambiguous failure (`status: 'UNCERTAIN'`), calls `policyEnforcementService.holdForReconciliation(reservationId, error)`
   *      and retains encumbrance in `reservedWei` to prevent overspending.
   */
  public async executeReservedPayment(
    authenticatedOwnerAddress: string,
    params: ExecuteReservedPaymentParams
  ): Promise<ExecuteReservedPaymentResult> {
    if (!params || typeof params !== 'object') {
      throw new InvalidPaymentInputError('Execution parameters must be a non-null object');
    }

    const { agentId, reservationId, asset, executionAmount, purpose } = params;

    if (!agentId || typeof agentId !== 'string') {
      throw new InvalidPaymentInputError('Agent ID is required');
    }
    if (!reservationId || typeof reservationId !== 'string') {
      throw new InvalidPaymentInputError('Reservation ID is required');
    }
    if (!asset || typeof asset !== 'object') {
      throw new InvalidPaymentInputError('Execution asset is required');
    }
    if (!executionAmount || typeof executionAmount !== 'string') {
      throw new InvalidPaymentInputError('Execution amount is required');
    }

    // 1. Authenticate owner & Agent status
    const agent = await this.agentService.getAgentById(authenticatedOwnerAddress, agentId);
    if (agent.status === 'PAUSED') {
      throw new AgentPausedError(agent.id);
    }
    if (agent.status === 'TERMINATED') {
      throw new AgentTerminatedError(agent.id);
    }

    // 2. Fetch & Validate Reservation
    const reservation = await this.policyEnforcementService.getReservationById(reservationId);
    if (!reservation) {
      throw new InvalidReservationError(reservationId, `Reservation ${reservationId} not found`);
    }

    if (reservation.agentId !== agent.id) {
      throw new InvalidReservationError(
        reservationId,
        `Reservation ${reservationId} does not belong to agent ${agent.id}`
      );
    }

    if (reservation.status !== 'RESERVED') {
      throw new InvalidReservationError(
        reservationId,
        `Reservation ${reservationId} is not in RESERVED status (current status: ${reservation.status})`
      );
    }

    // 3. Asset Integrity Verification
    // The policy/budget accounting domain is denominated strictly in cUSD.
    // The reservation authorizes a specific amount of cUSD (reservation.amountCusd).
    // Native CELO is a separate asset with floating exchange rates; cUSD != CELO.
    // In Phase 8.3, cross-asset execution between cUSD reservations and the native CELO rail
    // is strictly prohibited because no legitimate conversion, oracle, or exchange rate exists.
    if (asset.kind === 'NATIVE_CELO') {
      throw new AssetMismatchError(
        `Cannot execute cUSD reservation (${reservation.amountCusd} cUSD) via NATIVE_CELO rail: cross-asset execution is prohibited`
      );
    }

    if (asset.kind !== 'CUSD_ERC20') {
      throw new AssetMismatchError(
        `Unsupported execution asset: ${asset.kind}. Reservations are denominated in cUSD.`
      );
    }

    // Reject non-numeric or non-positive execution amounts
    if (!/^\d+(\.\d+)?$/.test(executionAmount.trim())) {
      throw new AssetMismatchError(
        `Invalid execution amount format: "${executionAmount}". Must be a positive decimal string.`
      );
    }
    const numAmount = Number(executionAmount.trim());
    if (isNaN(numAmount) || !isFinite(numAmount) || numAmount <= 0) {
      throw new AssetMismatchError(
        `Execution amount must be greater than zero. Received: "${executionAmount}"`
      );
    }

    // Verify execution amount matches the authorized reservation amount
    // An arbitrary execution amount must not bypass the authorized cUSD reservation.
    if (executionAmount.trim() !== reservation.amountCusd) {
      throw new AssetMismatchError(
        `Execution amount (${executionAmount.trim()} cUSD) does not match authorized reservation amount (${reservation.amountCusd} cUSD)`
      );
    }

    // 4. In-flight Concurrency Guard
    if (this.inFlightExecutions.has(reservationId)) {
      throw new ExecutionInProgressError(reservationId);
    }

    this.inFlightExecutions.add(reservationId);

    try {
      // 5. Invoke IPaymentExecutor Boundary
      const execResult = await this.paymentExecutor.execute({
        reservationId,
        agentId: agent.id,
        recipient: reservation.recipient,
        asset,
        amount: executionAmount.trim(),
        idempotencyKey: reservation.idempotencyKey,
        purpose,
      });

      // 6. Handle Execution Outcomes
      if (execResult.status === 'SUBMITTED' && execResult.txHash) {
        // Broadcast succeeded: transition reservation to SUBMITTED
        const updatedReservation = await this.policyEnforcementService.markSubmitted(
          reservationId,
          execResult.txHash
        );

        return {
          success: true,
          status: 'SUBMITTED',
          txHash: execResult.txHash,
          reservation: updatedReservation,
          explorerUrl: execResult.explorerUrl,
        };
      } else if (execResult.status === 'UNCERTAIN') {
        // Uncertain outcome (e.g., timeout): hold for reconciliation to keep funds encumbered
        const updatedReservation = await this.policyEnforcementService.holdForReconciliation(
          reservationId,
          execResult.error || 'Execution status uncertain / network timeout'
        );

        return {
          success: false,
          status: 'UNCERTAIN',
          txHash: execResult.txHash,
          reservation: updatedReservation,
          error: execResult.error,
          explorerUrl: execResult.explorerUrl,
        };
      } else {
        // Deterministic failure: release reservation back to available budget
        const updatedReservation = await this.policyEnforcementService.failAndRelease(
          reservationId,
          execResult.error || 'Payment execution failed'
        );

        return {
          success: false,
          status: 'FAILED',
          reservation: updatedReservation,
          error: execResult.error || 'Payment execution failed',
          explorerUrl: execResult.explorerUrl,
        };
      }
    } catch (err: unknown) {
      // If an unexpected error was thrown during executor invocation:
      // If error message indicates timeout / network uncertainty, hold for reconciliation;
      // otherwise fail and release.
      const errMsg = err instanceof Error ? err.message : 'Unexpected execution exception';
      const isUncertain =
        errMsg.toLowerCase().includes('timeout') ||
        errMsg.toLowerCase().includes('network') ||
        errMsg.toLowerCase().includes('timed out');

      if (isUncertain) {
        const updatedReservation = await this.policyEnforcementService.holdForReconciliation(
          reservationId,
          errMsg
        );
        return {
          success: false,
          status: 'UNCERTAIN',
          reservation: updatedReservation,
          error: errMsg,
        };
      } else {
        const updatedReservation = await this.policyEnforcementService.failAndRelease(
          reservationId,
          errMsg
        );
        return {
          success: false,
          status: 'FAILED',
          reservation: updatedReservation,
          error: errMsg,
        };
      }
    } finally {
      this.inFlightExecutions.delete(reservationId);
    }
  }

  /**
   * Confirms settlement of a submitted payment once receipt verification is established.
   * Permanently transitions the reservation to COMMITTED state and moves funds into spentWei.
   */
  public async confirmPaymentSettlement(
    authenticatedOwnerAddress: string,
    agentId: string,
    reservationId: string,
    confirmation: TrustedSettlementConfirmation
  ): Promise<BudgetReservation> {
    const agent = await this.agentService.getAgentById(authenticatedOwnerAddress, agentId);

    const reservation = await this.policyEnforcementService.getReservationById(reservationId);
    if (!reservation) {
      throw new InvalidReservationError(reservationId, `Reservation ${reservationId} not found`);
    }

    if (reservation.agentId !== agent.id) {
      throw new InvalidReservationError(
        reservationId,
        `Reservation ${reservationId} does not belong to agent ${agent.id}`
      );
    }

    return this.policyEnforcementService.confirmSettlement(reservationId, confirmation);
  }

  /**
   * Holds an uncertain or timed-out payment reservation for manual/automated reconciliation.
   * Preserves encumbrance in reservedWei to prevent double-spending.
   */
  public async holdPaymentForReconciliation(
    authenticatedOwnerAddress: string,
    agentId: string,
    reservationId: string,
    reason: string
  ): Promise<BudgetReservation> {
    const agent = await this.agentService.getAgentById(authenticatedOwnerAddress, agentId);

    const reservation = await this.policyEnforcementService.getReservationById(reservationId);
    if (!reservation) {
      throw new InvalidReservationError(reservationId, `Reservation ${reservationId} not found`);
    }

    if (reservation.agentId !== agent.id) {
      throw new InvalidReservationError(
        reservationId,
        `Reservation ${reservationId} does not belong to agent ${agent.id}`
      );
    }

    return this.policyEnforcementService.holdForReconciliation(reservationId, reason);
  }
}

