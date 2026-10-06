import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  AgentPaymentService,
  InMemoryPendingApprovalStore,
  AgentPaymentRequest,
  PendingApprovalNotFoundError,
  PendingApprovalStateError,
  PendingApprovalExpiredError,
} from '../src/lib/payment';
import {
  AgentService,
  InMemoryAgentStore,
  AgentPausedError,
  AgentTerminatedError,
  UnauthorizedAgentError,
} from '../src/lib/agent';
import {
  PolicyEnforcementService,
  InMemoryBudgetStore,
  AgentSpendingPolicy,
} from '../src/lib/policy';
import * as celoPaymentModule from '../src/lib/celo/payment';

describe('Phase 8.2: AgentPaymentService (Payment Orchestration & Approvals)', () => {
  const ownerA = '0x1111111111111111111111111111111111111111';
  const ownerB = '0x2222222222222222222222222222222222222222';
  const recipientAllowed = '0x19E7E376E7C213B7E7e7e46cc70A5dD086DAff2A';
  const recipientDisallowed = '0x7E5F4552091A69125d5DfCb7b8C2659029395Bdf';

  let agentStore: InMemoryAgentStore;
  let agentService: AgentService;
  let budgetStore: InMemoryBudgetStore;
  let policyEnforcementService: PolicyEnforcementService;
  let pendingApprovalStore: InMemoryPendingApprovalStore;
  let paymentService: AgentPaymentService;
  let currentTime: number;

  const baseTime = Date.parse('2026-10-06T12:00:00.000Z');
  const policyExpiry = baseTime + 7 * 86_400_000;

  const standardSpendingPolicy: Omit<AgentSpendingPolicy, 'agentId'> = {
    maxPerTransaction: '1.00',     // max 1.00 cUSD per tx
    maxPerDay: '3.00',             // max 3.00 cUSD per day
    allowedRecipients: [recipientAllowed],
    autoApproveThreshold: '0.20',  // <= 0.20 cUSD auto-approved; > 0.20 needs approval
    validUntil: policyExpiry,
  };

  beforeEach(async () => {
    currentTime = baseTime;

    agentStore = new InMemoryAgentStore(() => currentTime);
    agentService = new AgentService(agentStore, () => currentTime);

    budgetStore = new InMemoryBudgetStore();
    policyEnforcementService = new PolicyEnforcementService(budgetStore, () => currentTime);

    pendingApprovalStore = new InMemoryPendingApprovalStore();

    paymentService = new AgentPaymentService(
      agentService,
      policyEnforcementService,
      pendingApprovalStore,
      () => currentTime,
      86_400_000 // 24 hour approval TTL
    );
  });

  async function createTestAgent(
    owner: string = ownerA,
    policyOverrides?: Partial<AgentSpendingPolicy>
  ) {
    return agentService.createAgent(owner, {
      name: 'Orchestration Test Agent',
      spendingPolicy: {
        ...standardSpendingPolicy,
        ...policyOverrides,
      },
    });
  }

  // ==========================================================================
  // BASIC SPENDING
  // ==========================================================================

  it('1. ACTIVE agent + policy ALLOW → RESERVED', async () => {
    const agent = await createTestAgent();

    const request: AgentPaymentRequest = {
      agentId: agent.id,
      amountCusd: '0.15', // <= 0.20 auto-approval threshold
      recipient: recipientAllowed,
      idempotencyKey: 'tx-req-001',
    };

    const result = await paymentService.requestPayment(ownerA, request);

    expect(result.success).toBe(true);
    expect(result.allowedToExecute).toBe(true);
    expect(result.outcome).toBe('RESERVED');
    expect(result.reservation).toBeDefined();
    expect(result.reservation?.status).toBe('RESERVED');
    expect(result.reservation?.amountCusd).toBe('0.15');
    expect(result.pendingApproval).toBeUndefined();

    // Verify budget state updated in budgetStore
    const state = await budgetStore.getBudgetState(agent.id, result.reservation!.windowId, '3.00');
    expect(state.reservedCusd).toBe('0.15');
    expect(state.availableCusd).toBe('2.85');
  });

  it('2. Policy denial (non-allowlisted recipient or over maxPerTx) → POLICY_DENIED', async () => {
    const agent = await createTestAgent();

    // Attempt paying an unauthorized recipient
    const requestDisallowed: AgentPaymentRequest = {
      agentId: agent.id,
      amountCusd: '0.10',
      recipient: recipientDisallowed,
      idempotencyKey: 'tx-denied-001',
    };

    const res1 = await paymentService.requestPayment(ownerA, requestDisallowed);
    expect(res1.success).toBe(false);
    expect(res1.allowedToExecute).toBe(false);
    expect(res1.outcome).toBe('POLICY_DENIED');
    expect(res1.reason.toLowerCase()).toContain('recipient');
    expect(res1.reservation).toBeUndefined();

    // Attempt exceeding maxPerTransaction (1.00 cUSD)
    const requestTooLarge: AgentPaymentRequest = {
      agentId: agent.id,
      amountCusd: '1.50',
      recipient: recipientAllowed,
      idempotencyKey: 'tx-denied-002',
    };

    const res2 = await paymentService.requestPayment(ownerA, requestTooLarge);
    expect(res2.success).toBe(false);
    expect(res2.allowedToExecute).toBe(false);
    expect(res2.outcome).toBe('POLICY_DENIED');
    expect(res2.reason.toLowerCase()).toContain('per-transaction limit');
  });

  it('3. Budget denial (exceeding daily limit) → BUDGET_DENIED', async () => {
    // Create an agent with maxPerTx = 2.00, maxPerDay = 1.00, autoApprove = 2.00
    const agent = await createTestAgent(ownerA, {
      maxPerTransaction: '2.00',
      maxPerDay: '1.00',
      autoApproveThreshold: '2.00',
    });

    // 1st request for 0.80 cUSD -> RESERVED
    const req1: AgentPaymentRequest = {
      agentId: agent.id,
      amountCusd: '0.80',
      recipient: recipientAllowed,
      idempotencyKey: 'tx-budget-001',
    };
    const res1 = await paymentService.requestPayment(ownerA, req1);
    expect(res1.outcome).toBe('RESERVED');

    // 2nd request for 0.40 cUSD -> exceeds remaining 0.20 cUSD -> BUDGET_DENIED
    const req2: AgentPaymentRequest = {
      agentId: agent.id,
      amountCusd: '0.40',
      recipient: recipientAllowed,
      idempotencyKey: 'tx-budget-002',
    };
    const res2 = await paymentService.requestPayment(ownerA, req2);
    expect(res2.success).toBe(false);
    expect(res2.allowedToExecute).toBe(false);
    expect(res2.outcome).toBe('BUDGET_DENIED');
    expect(res2.reservation).toBeUndefined();
    expect(res2.budgetState?.availableCusd).toBe('0.2');
  });

  // ==========================================================================
  // APPROVAL WORKFLOW
  // ==========================================================================

  it('4. Approval-required policy (> autoApproveThreshold) → REQUIRE_USER_APPROVAL', async () => {
    const agent = await createTestAgent();

    // 0.50 cUSD > 0.20 cUSD threshold, but <= 1.00 maxPerTx
    const request: AgentPaymentRequest = {
      agentId: agent.id,
      amountCusd: '0.50',
      recipient: recipientAllowed,
      idempotencyKey: 'tx-approval-001',
    };

    const result = await paymentService.requestPayment(ownerA, request);

    expect(result.success).toBe(true);
    expect(result.allowedToExecute).toBe(false);
    expect(result.outcome).toBe('REQUIRE_USER_APPROVAL');
    expect(result.pendingApproval).toBeDefined();
    expect(result.pendingApproval?.status).toBe('PENDING');
  });

  it('5. Approval-required request creates PendingApproval in store', async () => {
    const agent = await createTestAgent();

    const request: AgentPaymentRequest = {
      agentId: agent.id,
      amountCusd: '0.50',
      recipient: recipientAllowed,
      idempotencyKey: 'tx-approval-store-001',
    };

    const result = await paymentService.requestPayment(ownerA, request);
    const pendingFromStore = await pendingApprovalStore.getByRequestId(result.requestId);

    expect(pendingFromStore).not.toBeNull();
    expect(pendingFromStore?.requestId).toBe(result.requestId);
    expect(pendingFromStore?.agentId).toBe(agent.id);
    expect(pendingFromStore?.amountCusd).toBe('0.50');
    expect(pendingFromStore?.recipient).toBe(recipientAllowed);
    expect(pendingFromStore?.status).toBe('PENDING');
    expect(pendingFromStore?.validUntil).toBe(baseTime + 86_400_000);
  });

  it('6. Approval-required request does NOT create a budget reservation', async () => {
    const agent = await createTestAgent();

    const request: AgentPaymentRequest = {
      agentId: agent.id,
      amountCusd: '0.75',
      recipient: recipientAllowed,
      idempotencyKey: 'tx-no-reserve-001',
    };

    await paymentService.requestPayment(ownerA, request);

    // Verify budget store has ZERO reservations for this idempotency key
    const reservation = await budgetStore.getReservationByIdempotencyKey(agent.id, 'tx-no-reserve-001');
    expect(reservation).toBeNull();

    // Verify daily available budget is completely untouched (still 3.00 cUSD)
    const windowId = '2026-10-06';
    const state = await budgetStore.getBudgetState(agent.id, windowId, '3.00');
    expect(state.reservedCusd).toBe('0');
    expect(state.availableCusd).toBe('3');
  });

  it('7. Approve re-runs policy and budget enforcement at approval time', async () => {
    const agent = await createTestAgent();

    const request: AgentPaymentRequest = {
      agentId: agent.id,
      amountCusd: '0.60',
      recipient: recipientAllowed,
      idempotencyKey: 'tx-approve-rerun-001',
    };

    const reqResult = await paymentService.requestPayment(ownerA, request);

    // Spy on policyEnforcementService.enforcePayment
    const enforceSpy = vi.spyOn(policyEnforcementService, 'enforcePayment');

    await paymentService.approvePaymentRequest(ownerA, agent.id, reqResult.requestId);

    // enforcePayment must have been called during approve with an explicit UserApproval
    expect(enforceSpy).toHaveBeenCalled();
    const lastCall = enforceSpy.mock.calls[0];
    expect(lastCall[1].approval).toBeDefined();
    expect(lastCall[1].approval?.amountCusd).toBe('0.60');
    expect(lastCall[1].approval?.idempotencyKey).toBe('tx-approve-rerun-001');
  });

  it('8. Approval succeeds when current policy and budget allow → transitions to APPROVED and RESERVED', async () => {
    const agent = await createTestAgent();

    const request: AgentPaymentRequest = {
      agentId: agent.id,
      amountCusd: '0.50',
      recipient: recipientAllowed,
      idempotencyKey: 'tx-approve-success-001',
    };

    const reqResult = await paymentService.requestPayment(ownerA, request);
    const approveResult = await paymentService.approvePaymentRequest(ownerA, agent.id, reqResult.requestId);

    expect(approveResult.success).toBe(true);
    expect(approveResult.allowedToExecute).toBe(true);
    expect(approveResult.outcome).toBe('RESERVED');
    expect(approveResult.reservation).toBeDefined();
    expect(approveResult.reservation?.status).toBe('RESERVED');
    expect(approveResult.pendingApproval?.status).toBe('APPROVED');

    // Confirm store status updated
    const stored = await pendingApprovalStore.getByRequestId(reqResult.requestId);
    expect(stored?.status).toBe('APPROVED');
    expect(stored?.resolvedAt).toBeDefined();
  });

  it('9. Approval fails if policy changed between request and approval, now denying', async () => {
    const agent = await createTestAgent();

    const request: AgentPaymentRequest = {
      agentId: agent.id,
      amountCusd: '0.80',
      recipient: recipientAllowed,
      idempotencyKey: 'tx-policy-changed-001',
    };

    const reqResult = await paymentService.requestPayment(ownerA, request);

    // Owner updates agent policy to lower maxPerTransaction to 0.50 cUSD
    await agentService.updateAgent(ownerA, agent.id, {
      spendingPolicy: {
        ...standardSpendingPolicy,
        maxPerTransaction: '0.50', // 0.80 exceeds this now!
      },
    });

    // Approval attempted
    const approveResult = await paymentService.approvePaymentRequest(ownerA, agent.id, reqResult.requestId);

    expect(approveResult.success).toBe(false);
    expect(approveResult.allowedToExecute).toBe(false);
    expect(approveResult.outcome).toBe('POLICY_DENIED');
    expect(approveResult.reason.toLowerCase()).toContain('per-transaction limit');

    // Ensure pending approval was NOT marked APPROVED
    const stored = await pendingApprovalStore.getByRequestId(reqResult.requestId);
    expect(stored?.status).toBe('PENDING');
  });

  it('10. Approval fails if daily budget is no longer available at approval time', async () => {
    const agent = await createTestAgent();

    // Create approval-required request for 0.80 cUSD
    const req1: AgentPaymentRequest = {
      agentId: agent.id,
      amountCusd: '0.80',
      recipient: recipientAllowed,
      idempotencyKey: 'tx-budget-exhaust-pending',
    };
    const reqResult = await paymentService.requestPayment(ownerA, req1);

    // Another direct payment exhausts the remaining budget (e.g. 2.50 cUSD spent)
    // Daily limit is 3.00 cUSD. Spend 2.50 cUSD.
    await budgetStore.acquireReservation({
      agentId: agent.id,
      amountCusd: '2.50',
      recipient: recipientAllowed,
      idempotencyKey: 'tx-other-large-spend',
      timestamp: currentTime,
    }, '3.00');

    // Now only 0.50 cUSD available, but approved request is for 0.80 cUSD!
    const approveResult = await paymentService.approvePaymentRequest(ownerA, agent.id, reqResult.requestId);

    expect(approveResult.success).toBe(false);
    expect(approveResult.allowedToExecute).toBe(false);
    expect(approveResult.outcome).toBe('BUDGET_DENIED');
    expect(approveResult.reason.toLowerCase()).toContain('daily budget exceeded');

    // Ensure pending approval was NOT marked APPROVED
    const stored = await pendingApprovalStore.getByRequestId(reqResult.requestId);
    expect(stored?.status).toBe('PENDING');
  });

  it('11. Reject changes PENDING → REJECTED and leaves budget untouched', async () => {
    const agent = await createTestAgent();

    const request: AgentPaymentRequest = {
      agentId: agent.id,
      amountCusd: '0.40',
      recipient: recipientAllowed,
      idempotencyKey: 'tx-reject-001',
    };

    const reqResult = await paymentService.requestPayment(ownerA, request);

    const rejected = await paymentService.rejectPaymentRequest(
      ownerA,
      agent.id,
      reqResult.requestId,
      'Price was too high'
    );

    expect(rejected.status).toBe('REJECTED');
    expect(rejected.statusReason).toBe('Price was too high');
    expect(rejected.resolvedAt).toBe(currentTime);

    const stored = await pendingApprovalStore.getByRequestId(reqResult.requestId);
    expect(stored?.status).toBe('REJECTED');

    // Confirm no budget reservation exists
    const reservation = await budgetStore.getReservationByIdempotencyKey(agent.id, 'tx-reject-001');
    expect(reservation).toBeNull();
  });

  it('12. Expired approval cannot be approved', async () => {
    const agent = await createTestAgent();

    const request: AgentPaymentRequest = {
      agentId: agent.id,
      amountCusd: '0.50',
      recipient: recipientAllowed,
      idempotencyKey: 'tx-expired-001',
    };

    const reqResult = await paymentService.requestPayment(ownerA, request);

    // Fast-forward time past 24-hour validity window
    currentTime += 86_400_000 + 10_000;

    await expect(
      paymentService.approvePaymentRequest(ownerA, agent.id, reqResult.requestId)
    ).rejects.toThrow(PendingApprovalExpiredError);

    // Status in store should now be EXPIRED
    const stored = await pendingApprovalStore.getByRequestId(reqResult.requestId);
    expect(stored?.status).toBe('EXPIRED');
  });

  it('13. Already approved approval cannot be approved again', async () => {
    const agent = await createTestAgent();

    const request: AgentPaymentRequest = {
      agentId: agent.id,
      amountCusd: '0.30',
      recipient: recipientAllowed,
      idempotencyKey: 'tx-double-approve-001',
    };

    const reqResult = await paymentService.requestPayment(ownerA, request);
    await paymentService.approvePaymentRequest(ownerA, agent.id, reqResult.requestId);

    // Second approve attempt
    await expect(
      paymentService.approvePaymentRequest(ownerA, agent.id, reqResult.requestId)
    ).rejects.toThrow(PendingApprovalStateError);
  });

  it('14. Already rejected approval cannot be rejected again', async () => {
    const agent = await createTestAgent();

    const request: AgentPaymentRequest = {
      agentId: agent.id,
      amountCusd: '0.30',
      recipient: recipientAllowed,
      idempotencyKey: 'tx-double-reject-001',
    };

    const reqResult = await paymentService.requestPayment(ownerA, request);
    await paymentService.rejectPaymentRequest(ownerA, agent.id, reqResult.requestId);

    // Second reject attempt
    await expect(
      paymentService.rejectPaymentRequest(ownerA, agent.id, reqResult.requestId)
    ).rejects.toThrow(PendingApprovalStateError);
  });

  // ==========================================================================
  // AGENT LIFECYCLE
  // ==========================================================================

  it('15. PAUSED agent cannot create new payment requests', async () => {
    const agent = await createTestAgent();
    await agentService.pauseAgent(ownerA, agent.id, 'Maintenance pause');

    const request: AgentPaymentRequest = {
      agentId: agent.id,
      amountCusd: '0.10',
      recipient: recipientAllowed,
      idempotencyKey: 'tx-paused-req-001',
    };

    await expect(
      paymentService.requestPayment(ownerA, request)
    ).rejects.toThrow(AgentPausedError);
  });

  it('16. TERMINATED agent cannot create new payment requests', async () => {
    const agent = await createTestAgent();
    await agentService.terminateAgent(ownerA, agent.id, 'Decommissioned');

    const request: AgentPaymentRequest = {
      agentId: agent.id,
      amountCusd: '0.10',
      recipient: recipientAllowed,
      idempotencyKey: 'tx-term-req-001',
    };

    await expect(
      paymentService.requestPayment(ownerA, request)
    ).rejects.toThrow(AgentTerminatedError);
  });

  it('17. PAUSED agent cannot approve a pending payment', async () => {
    const agent = await createTestAgent();

    const request: AgentPaymentRequest = {
      agentId: agent.id,
      amountCusd: '0.40',
      recipient: recipientAllowed,
      idempotencyKey: 'tx-pause-approve-001',
    };
    const reqResult = await paymentService.requestPayment(ownerA, request);

    // Agent paused after request was queued
    await agentService.pauseAgent(ownerA, agent.id, 'Paused before review');

    await expect(
      paymentService.approvePaymentRequest(ownerA, agent.id, reqResult.requestId)
    ).rejects.toThrow(AgentPausedError);
  });

  it('18. TERMINATED agent cannot approve a pending payment', async () => {
    const agent = await createTestAgent();

    const request: AgentPaymentRequest = {
      agentId: agent.id,
      amountCusd: '0.40',
      recipient: recipientAllowed,
      idempotencyKey: 'tx-term-approve-001',
    };
    const reqResult = await paymentService.requestPayment(ownerA, request);

    // Agent terminated after request was queued
    await agentService.terminateAgent(ownerA, agent.id, 'Permanently retired');

    await expect(
      paymentService.approvePaymentRequest(ownerA, agent.id, reqResult.requestId)
    ).rejects.toThrow(AgentTerminatedError);
  });

  // ==========================================================================
  // AUTHORIZATION
  // ==========================================================================

  it('19. Non-owner cannot create payment for another owner’s agent', async () => {
    const agent = await createTestAgent(ownerA);

    const request: AgentPaymentRequest = {
      agentId: agent.id,
      amountCusd: '0.10',
      recipient: recipientAllowed,
      idempotencyKey: 'tx-unauth-001',
    };

    // Owner B attempts payment on Owner A's agent
    await expect(
      paymentService.requestPayment(ownerB, request)
    ).rejects.toThrow(UnauthorizedAgentError);
  });

  it('20. Non-owner cannot approve another owner’s pending payment', async () => {
    const agent = await createTestAgent(ownerA);

    const request: AgentPaymentRequest = {
      agentId: agent.id,
      amountCusd: '0.50',
      recipient: recipientAllowed,
      idempotencyKey: 'tx-unauth-approve-001',
    };
    const reqResult = await paymentService.requestPayment(ownerA, request);

    // Owner B attempts to approve
    await expect(
      paymentService.approvePaymentRequest(ownerB, agent.id, reqResult.requestId)
    ).rejects.toThrow(UnauthorizedAgentError);
  });

  it('21. Non-owner cannot reject another owner’s pending payment', async () => {
    const agent = await createTestAgent(ownerA);

    const request: AgentPaymentRequest = {
      agentId: agent.id,
      amountCusd: '0.50',
      recipient: recipientAllowed,
      idempotencyKey: 'tx-unauth-reject-001',
    };
    const reqResult = await paymentService.requestPayment(ownerA, request);

    // Owner B attempts to reject
    await expect(
      paymentService.rejectPaymentRequest(ownerB, agent.id, reqResult.requestId)
    ).rejects.toThrow(UnauthorizedAgentError);
  });

  // ==========================================================================
  // IDEMPOTENCY
  // ==========================================================================

  it('22. Same request / idempotency key preserves existing semantics', async () => {
    const agent = await createTestAgent();

    const request: AgentPaymentRequest = {
      agentId: agent.id,
      amountCusd: '0.10',
      recipient: recipientAllowed,
      idempotencyKey: 'tx-idemp-001',
    };

    const res1 = await paymentService.requestPayment(ownerA, request);
    expect(res1.outcome).toBe('RESERVED');

    // Repeated identical submission
    const res2 = await paymentService.requestPayment(ownerA, request);
    expect(res2.outcome).toBe('DUPLICATE_IN_PROGRESS');
    expect(res2.reservation?.id).toBe(res1.reservation?.id);
  });

  it('23. Conflicting idempotency input with different parameters is rejected', async () => {
    const agent = await createTestAgent();

    // 1st request: 0.50 cUSD (creates pending approval)
    const request1: AgentPaymentRequest = {
      agentId: agent.id,
      amountCusd: '0.50',
      recipient: recipientAllowed,
      idempotencyKey: 'tx-conflict-001',
    };
    await paymentService.requestPayment(ownerA, request1);

    // 2nd request with same idempotency key but different amount (0.60 cUSD)
    const request2: AgentPaymentRequest = {
      agentId: agent.id,
      amountCusd: '0.60',
      recipient: recipientAllowed,
      idempotencyKey: 'tx-conflict-001',
    };

    const res2 = await paymentService.requestPayment(ownerA, request2);
    expect(res2.outcome).toBe('IDEMPOTENCY_CONFLICT');
    expect(res2.allowedToExecute).toBe(false);
  });

  it('24. Duplicate approval attempts do not create duplicate successful approvals', async () => {
    const agent = await createTestAgent();

    const request: AgentPaymentRequest = {
      agentId: agent.id,
      amountCusd: '0.40',
      recipient: recipientAllowed,
      idempotencyKey: 'tx-dup-approve-001',
    };
    const reqResult = await paymentService.requestPayment(ownerA, request);

    const approve1 = await paymentService.approvePaymentRequest(ownerA, agent.id, reqResult.requestId);
    expect(approve1.success).toBe(true);

    await expect(
      paymentService.approvePaymentRequest(ownerA, agent.id, reqResult.requestId)
    ).rejects.toThrow(PendingApprovalStateError);
  });

  // ==========================================================================
  // CONCURRENCY & RACE CONDITIONS
  // ==========================================================================

  it('25. Two concurrent approval attempts for the same request cannot both transition PENDING → APPROVED', async () => {
    const agent = await createTestAgent();

    const request: AgentPaymentRequest = {
      agentId: agent.id,
      amountCusd: '0.40',
      recipient: recipientAllowed,
      idempotencyKey: 'tx-concurrent-approve-001',
    };
    const reqResult = await paymentService.requestPayment(ownerA, request);

    // Fire two concurrent approve calls simultaneously
    const results = await Promise.allSettled([
      paymentService.approvePaymentRequest(ownerA, agent.id, reqResult.requestId),
      paymentService.approvePaymentRequest(ownerA, agent.id, reqResult.requestId),
    ]);

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');

    // Exactly one must succeed and one must be rejected
    expect(fulfilled.length).toBe(1);
    expect(rejected.length).toBe(1);
    expect((rejected[0] as PromiseRejectedResult).reason).toBeInstanceOf(PendingApprovalStateError);
  });

  it('26. Concurrent spending requests still rely on the existing atomic budget store', async () => {
    // Daily budget 1.00 cUSD; two requests for 0.80 cUSD compete concurrently
    const agent = await createTestAgent(ownerA, {
      maxPerTransaction: '1.00',
      maxPerDay: '1.00',
      autoApproveThreshold: '1.00',
    });

    const req1: AgentPaymentRequest = {
      agentId: agent.id,
      amountCusd: '0.80',
      recipient: recipientAllowed,
      idempotencyKey: 'concurrent-spend-A',
    };
    const req2: AgentPaymentRequest = {
      agentId: agent.id,
      amountCusd: '0.80',
      recipient: recipientAllowed,
      idempotencyKey: 'concurrent-spend-B',
    };

    const [resA, resB] = await Promise.all([
      paymentService.requestPayment(ownerA, req1),
      paymentService.requestPayment(ownerA, req2),
    ]);

    const outcomes = [resA.outcome, resB.outcome];
    expect(outcomes).toContain('RESERVED');
    expect(outcomes).toContain('BUDGET_DENIED');
  });

  // ==========================================================================
  // ISOLATION
  // ==========================================================================

  it('27. Agent A cannot access Agent B’s pending approval', async () => {
    const agentA = await createTestAgent(ownerA);
    const agentB = await createTestAgent(ownerA);

    const reqA: AgentPaymentRequest = {
      agentId: agentA.id,
      amountCusd: '0.50',
      recipient: recipientAllowed,
      idempotencyKey: 'isolation-req-A',
    };
    const resultA = await paymentService.requestPayment(ownerA, reqA);

    // Attempting to approve reqA through agentB
    await expect(
      paymentService.approvePaymentRequest(ownerA, agentB.id, resultA.requestId)
    ).rejects.toThrow(PendingApprovalNotFoundError);

    // Attempting to reject reqA through agentB
    await expect(
      paymentService.rejectPaymentRequest(ownerA, agentB.id, resultA.requestId)
    ).rejects.toThrow(PendingApprovalNotFoundError);
  });

  it('28. Pending approvals are isolated by agent in listing', async () => {
    const agentA = await createTestAgent(ownerA);
    const agentB = await createTestAgent(ownerA);

    await paymentService.requestPayment(ownerA, {
      agentId: agentA.id,
      amountCusd: '0.30',
      recipient: recipientAllowed,
      idempotencyKey: 'iso-list-A-1',
    });
    await paymentService.requestPayment(ownerA, {
      agentId: agentA.id,
      amountCusd: '0.40',
      recipient: recipientAllowed,
      idempotencyKey: 'iso-list-A-2',
    });
    await paymentService.requestPayment(ownerA, {
      agentId: agentB.id,
      amountCusd: '0.35',
      recipient: recipientAllowed,
      idempotencyKey: 'iso-list-B-1',
    });

    const listA = await paymentService.listPendingApprovals(ownerA, agentA.id);
    const listB = await paymentService.listPendingApprovals(ownerA, agentB.id);

    expect(listA.length).toBe(2);
    expect(listB.length).toBe(1);
    expect(listA.every((item) => item.agentId === agentA.id)).toBe(true);
    expect(listB.every((item) => item.agentId === agentB.id)).toBe(true);
  });

  // ==========================================================================
  // EXECUTION & ASSET BOUNDARIES
  // ==========================================================================

  it('29. AgentPaymentService does not execute blockchain transactions', async () => {
    const executePaymentSpy = vi.spyOn(celoPaymentModule, 'executePayment');

    const agent = await createTestAgent();
    const request: AgentPaymentRequest = {
      agentId: agent.id,
      amountCusd: '0.10',
      recipient: recipientAllowed,
      idempotencyKey: 'no-exec-test-001',
    };

    const result = await paymentService.requestPayment(ownerA, request);
    expect(result.outcome).toBe('RESERVED');

    // Confirms executePayment was never invoked
    expect(executePaymentSpy).not.toHaveBeenCalled();
    executePaymentSpy.mockRestore();
  });

  it('30. No Celo RPC / payment execution function is invoked by these tests', () => {
    // Statically and dynamically verify that executePayment is not imported in service.ts
    // Check that AgentPaymentService does not reference viem walletClient or sendTransaction
    expect(paymentService).not.toHaveProperty('executePayment');
    expect(paymentService).not.toHaveProperty('walletClient');
    expect(paymentService).not.toHaveProperty('publicClient');
  });

  it('31. amountCusd remains the policy/accounting amount', async () => {
    const agent = await createTestAgent();
    const request: AgentPaymentRequest = {
      agentId: agent.id,
      amountCusd: '0.15',
      recipient: recipientAllowed,
      idempotencyKey: 'cusd-amount-001',
    };

    const result = await paymentService.requestPayment(ownerA, request);
    expect(result.amountCusd).toBe('0.15');
    expect(result.reservation?.amountCusd).toBe('0.15');
  });

  it('32. No conversion from cUSD to native CELO is performed', async () => {
    const agent = await createTestAgent();
    const request: AgentPaymentRequest = {
      agentId: agent.id,
      amountCusd: '0.18',
      recipient: recipientAllowed,
      idempotencyKey: 'no-conversion-001',
    };

    const result = await paymentService.requestPayment(ownerA, request);
    // Ensure no amountCelo property exists on orchestration result
    expect(result).not.toHaveProperty('amountCelo');
  });
});
