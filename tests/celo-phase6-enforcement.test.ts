import { describe, it, expect, beforeEach } from 'vitest';
import {
  PolicyEnforcementService,
  EnforcePaymentRequest,
  UserApproval,
  TrustedSettlementConfirmation,
} from '../src/lib/policy/enforcement-service';
import { InMemoryBudgetStore } from '../src/lib/policy/in-memory-budget-store';
import { AgentSpendingPolicy } from '../src/lib/policy/types';
import { validateBudgetAccountingInvariant } from '../src/lib/policy/budget-types';

describe('Phase 6.3: PolicyEnforcementService', () => {
  let store: InMemoryBudgetStore;
  let service: PolicyEnforcementService;

  const agentId = 'agent-payment-coordinator';
  const recipientAuthorized = '0x19E7E376E7C213B7E7e7e46cc70A5dD086DAff2A';
  const recipientOther = '0x7E5F4552091A69125d5DfCb7b8C2659029395Bdf';
  const validTxHash = '0x0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
  let currentTime: number;
  const baseTime = Date.parse('2026-10-03T12:00:00.000Z');
  const validUntil = Date.parse('2026-10-10T00:00:00.000Z');

  // Baseline standard policy
  const defaultPolicy: AgentSpendingPolicy = {
    agentId,
    maxPerTransaction: '0.25',     // 0.25 cUSD single tx ceiling
    maxPerDay: '1.00',             // 1.00 cUSD daily limit
    allowedRecipients: [recipientAuthorized],
    autoApproveThreshold: '0.10',  // <= 0.10 auto-approved; > 0.10 needs approval
    validUntil,
  };

  beforeEach(() => {
    store = new InMemoryBudgetStore();
    currentTime = baseTime;
    // Inject trusted service clock
    service = new PolicyEnforcementService(store, () => currentTime);
  });

  it('1. should allow auto-approved request within threshold, acquire reservation, and permit execution', async () => {
    const request: EnforcePaymentRequest = {
      agentId,
      amountCusd: '0.08',
      recipient: recipientAuthorized,
      idempotencyKey: 'req-auto-01',
    };

    const result = await service.enforcePayment(defaultPolicy, request);

    expect(result.allowedToExecute).toBe(true);
    expect(result.outcome).toBe('RESERVED');
    expect(result.reason.toLowerCase()).toContain('reservation');
    expect(result.policyEvaluation?.decision).toBe('ALLOW');
    expect(result.reservation).toBeDefined();
    expect(result.reservation?.status).toBe('RESERVED');
    expect(result.reservation?.amountCusd).toBe('0.08');
    expect(result.budgetState?.reservedCusd).toBe('0.08');
    expect(result.budgetState?.availableCusd).toBe('0.92');

    const inv = validateBudgetAccountingInvariant(
      result.budgetState!.dailyLimitWei,
      result.budgetState!.spentWei,
      result.budgetState!.reservedWei
    );
    expect(inv.valid).toBe(true);
  });

  it('2. should require user approval when amount exceeds threshold and NOT reserve budget', async () => {
    const request: EnforcePaymentRequest = {
      agentId,
      amountCusd: '0.15', // > 0.10 threshold, but <= 0.25 per-tx
      recipient: recipientAuthorized,
      idempotencyKey: 'req-approval-01',
    };

    const result = await service.enforcePayment(defaultPolicy, request);

    expect(result.allowedToExecute).toBe(false);
    expect(result.outcome).toBe('REQUIRE_USER_APPROVAL');
    expect(result.reason).toContain('User approval required');
    expect(result.policyEvaluation?.decision).toBe('REQUIRE_USER_APPROVAL');
    expect(result.reservation).toBeUndefined();
    expect(result.budgetState).toBeUndefined();

    // Verify budget store has zero reservations and was not encumbered
    const lookup = await store.getReservationByIdempotencyKey(agentId, 'req-approval-01');
    expect(lookup).toBeNull();
  });

  it('3. should permit execution and reserve budget once explicit bound UserApproval is provided', async () => {
    const approval: UserApproval = {
      approvalId: 'appr-uuid-001',
      agentId,
      amountCusd: '0.15',
      recipient: recipientAuthorized,
      idempotencyKey: 'req-approved-01',
      approvedAt: baseTime - 1000,
      validUntil: baseTime + 60_000,
    };

    const approvedRequest: EnforcePaymentRequest = {
      agentId,
      amountCusd: '0.15',
      recipient: recipientAuthorized,
      idempotencyKey: 'req-approved-01',
      approval,
    };

    const result = await service.enforcePayment(defaultPolicy, approvedRequest);

    expect(result.allowedToExecute).toBe(true);
    expect(result.outcome).toBe('RESERVED');
    expect(result.policyEvaluation?.decision).toBe('REQUIRE_USER_APPROVAL');
    expect(result.reservation).toBeDefined();
    expect(result.reservation?.amountCusd).toBe('0.15');
    expect(result.budgetState?.reservedCusd).toBe('0.15');
    expect(result.budgetState?.availableCusd).toBe('0.85');
  });

  it('4. should reject mismatched, stale, or forged UserApprovals', async () => {
    const validApprovalBase: UserApproval = {
      approvalId: 'appr-uuid-base',
      agentId,
      amountCusd: '0.15',
      recipient: recipientAuthorized,
      idempotencyKey: 'req-tamper-test',
      approvedAt: baseTime - 1000,
      validUntil: baseTime + 60_000,
    };

    const baseRequest: EnforcePaymentRequest = {
      agentId,
      amountCusd: '0.15',
      recipient: recipientAuthorized,
      idempotencyKey: 'req-tamper-test',
    };

    // Mismatched amount
    const badAmountResult = await service.enforcePayment(defaultPolicy, {
      ...baseRequest,
      approval: { ...validApprovalBase, amountCusd: '0.14' },
    });
    expect(badAmountResult.allowedToExecute).toBe(false);
    expect(badAmountResult.outcome).toBe('POLICY_DENIED');
    expect(badAmountResult.reason).toContain('User approval mismatch');

    // Mismatched recipient
    const badRecipientResult = await service.enforcePayment(defaultPolicy, {
      ...baseRequest,
      approval: { ...validApprovalBase, recipient: recipientOther },
    });
    expect(badRecipientResult.allowedToExecute).toBe(false);
    expect(badRecipientResult.outcome).toBe('POLICY_DENIED');
    expect(badRecipientResult.reason).toContain('recipient');

    // Mismatched agentId
    const badAgentResult = await service.enforcePayment(defaultPolicy, {
      ...baseRequest,
      approval: { ...validApprovalBase, agentId: 'different-agent' },
    });
    expect(badAgentResult.allowedToExecute).toBe(false);
    expect(badAgentResult.outcome).toBe('POLICY_DENIED');
    expect(badAgentResult.reason).toContain('agent');

    // Mismatched idempotencyKey
    const badKeyResult = await service.enforcePayment(defaultPolicy, {
      ...baseRequest,
      approval: { ...validApprovalBase, idempotencyKey: 'different-key' },
    });
    expect(badKeyResult.allowedToExecute).toBe(false);
    expect(badKeyResult.outcome).toBe('POLICY_DENIED');
    expect(badKeyResult.reason).toContain('idempotency key');

    // Expired approval (stale)
    const expiredApprovalResult = await service.enforcePayment(defaultPolicy, {
      ...baseRequest,
      approval: { ...validApprovalBase, validUntil: baseTime - 100 },
    });
    expect(expiredApprovalResult.allowedToExecute).toBe(false);
    expect(expiredApprovalResult.outcome).toBe('POLICY_DENIED');
    expect(expiredApprovalResult.reason).toContain('expired');

    // Future approval timestamp
    const futureApprovalResult = await service.enforcePayment(defaultPolicy, {
      ...baseRequest,
      approval: { ...validApprovalBase, approvedAt: baseTime + 10_000 },
    });
    expect(futureApprovalResult.allowedToExecute).toBe(false);
    expect(futureApprovalResult.outcome).toBe('POLICY_DENIED');
    expect(futureApprovalResult.reason).toContain('future');
  });

  it('5. TRUSTED TIME: callers cannot backdate requests or manipulate clock to bypass policy expiry', async () => {
    // Advance trusted service clock past policy validity
    currentTime = validUntil + 1000;

    const request: EnforcePaymentRequest = {
      agentId,
      amountCusd: '0.05',
      recipient: recipientAuthorized,
      idempotencyKey: 'req-backdate-attempt',
    };

    const result = await service.enforcePayment(defaultPolicy, request);

    expect(result.allowedToExecute).toBe(false);
    expect(result.outcome).toBe('POLICY_DENIED');
    expect(result.reason).toContain('Policy has expired');
    expect(result.reservation).toBeUndefined();

    // Verify budget store was not touched
    const res = await store.getReservationByIdempotencyKey(agentId, 'req-backdate-attempt');
    expect(res).toBeNull();
  });

  it('6. TRUSTED TIME: daily calendar window is governed by trusted service clock', async () => {
    // Service clock at Day 1
    currentTime = Date.parse('2026-10-03T23:55:00.000Z');
    const req1: EnforcePaymentRequest = {
      agentId,
      amountCusd: '0.05',
      recipient: recipientAuthorized,
      idempotencyKey: 'clock-day1',
    };
    const res1 = await service.enforcePayment(defaultPolicy, req1);
    expect(res1.reservation?.windowId).toBe('2026-10-03');

    // Advance clock past midnight into Day 2
    currentTime = Date.parse('2026-10-04T00:05:00.000Z');
    const req2: EnforcePaymentRequest = {
      agentId,
      amountCusd: '0.05',
      recipient: recipientAuthorized,
      idempotencyKey: 'clock-day2',
    };
    const res2 = await service.enforcePayment(defaultPolicy, req2);
    expect(res2.reservation?.windowId).toBe('2026-10-04');
  });

  it('7. should deny payment when agent identity does not match policy', async () => {
    const request: EnforcePaymentRequest = {
      agentId: 'imposter-agent',
      amountCusd: '0.05',
      recipient: recipientAuthorized,
      idempotencyKey: 'req-mismatch-agent',
    };

    const result = await service.enforcePayment(defaultPolicy, request);

    expect(result.allowedToExecute).toBe(false);
    expect(result.outcome).toBe('POLICY_DENIED');
    expect(result.reason).toContain('Agent identity does not match policy');
    expect(result.reservation).toBeUndefined();
  });

  it('8. should deny payment when recipient is not authorized in policy', async () => {
    const request: EnforcePaymentRequest = {
      agentId,
      amountCusd: '0.05',
      recipient: recipientOther,
      idempotencyKey: 'req-unauthorized-rcpt',
    };

    const result = await service.enforcePayment(defaultPolicy, request);

    expect(result.allowedToExecute).toBe(false);
    expect(result.outcome).toBe('POLICY_DENIED');
    expect(result.reason).toContain('Recipient is not authorized');
    expect(result.reservation).toBeUndefined();
  });

  it('9. should deny payment when amount exceeds per-transaction limit (even if approved)', async () => {
    const approval: UserApproval = {
      approvalId: 'appr-large',
      agentId,
      amountCusd: '0.50',
      recipient: recipientAuthorized,
      idempotencyKey: 'req-exceed-per-tx',
      approvedAt: baseTime - 1000,
      validUntil: baseTime + 60_000,
    };

    const request: EnforcePaymentRequest = {
      agentId,
      amountCusd: '0.50', // exceeds maxPerTransaction of 0.25
      recipient: recipientAuthorized,
      idempotencyKey: 'req-exceed-per-tx',
      approval,
    };

    const result = await service.enforcePayment(defaultPolicy, request);

    expect(result.allowedToExecute).toBe(false);
    expect(result.outcome).toBe('POLICY_DENIED');
    expect(result.reason).toContain('Amount exceeds per-transaction limit');
    expect(result.reservation).toBeUndefined();
  });

  it('10. should safely deny invalid, negative, zero, or malformed amounts without reserving budget', async () => {
    const testCases = ['-0.10', '0', '0.00', 'abc', '', '0.0.1', '0.0000000000000000001'];

    for (const badAmount of testCases) {
      const request: EnforcePaymentRequest = {
        agentId,
        amountCusd: badAmount,
        recipient: recipientAuthorized,
        idempotencyKey: `bad-${badAmount}`,
      };

      const result = await service.enforcePayment(defaultPolicy, request);
      expect(result.allowedToExecute).toBe(false);
      expect(result.outcome).toBe('POLICY_DENIED');
      expect(result.reason).toContain('Invalid payment amount');
      expect(result.reservation).toBeUndefined();
    }
  });

  it('11. should return typed BUDGET_DENIED when daily budget is exceeded', async () => {
    const smallBudgetPolicy: AgentSpendingPolicy = {
      ...defaultPolicy,
      maxPerDay: '0.20',
      maxPerTransaction: '0.15',
      autoApproveThreshold: '0.15',
    };

    // First request: 0.12 cUSD (succeeds)
    const req1: EnforcePaymentRequest = {
      agentId,
      amountCusd: '0.12',
      recipient: recipientAuthorized,
      idempotencyKey: 'budget-req-1',
    };
    const res1 = await service.enforcePayment(smallBudgetPolicy, req1);
    expect(res1.allowedToExecute).toBe(true);
    expect(res1.outcome).toBe('RESERVED');

    // Second request: 0.10 cUSD (passes policy per-tx, but exceeds remaining 0.08 budget)
    const req2: EnforcePaymentRequest = {
      agentId,
      amountCusd: '0.10',
      recipient: recipientAuthorized,
      idempotencyKey: 'budget-req-2',
    };
    const res2 = await service.enforcePayment(smallBudgetPolicy, req2);
    expect(res2.allowedToExecute).toBe(false);
    expect(res2.outcome).toBe('BUDGET_DENIED');
    expect(res2.reason).toContain('Daily budget exceeded');
    expect(res2.budgetState?.availableCusd).toBe('0.08');
    expect(res2.budgetState?.reservedCusd).toBe('0.12');
  });

  it('12. should handle duplicate in-progress request without creating second reservation', async () => {
    const request: EnforcePaymentRequest = {
      agentId,
      amountCusd: '0.08',
      recipient: recipientAuthorized,
      idempotencyKey: 'duplicate-in-progress-key',
    };

    const first = await service.enforcePayment(defaultPolicy, request);
    expect(first.allowedToExecute).toBe(true);
    expect(first.outcome).toBe('RESERVED');

    // Duplicate identical request
    const duplicate = await service.enforcePayment(defaultPolicy, request);
    expect(duplicate.allowedToExecute).toBe(false); // Execution already initiated
    expect(duplicate.outcome).toBe('DUPLICATE_IN_PROGRESS');
    expect(duplicate.reason).toContain('in progress');
    expect(duplicate.reservation?.id).toBe(first.reservation?.id);
    expect(duplicate.budgetState?.reservedCusd).toBe('0.08'); // Still single encumbrance
  });

  it('13. should handle duplicate request for confirmed payment without re-executing (committed)', async () => {
    const request: EnforcePaymentRequest = {
      agentId,
      amountCusd: '0.08',
      recipient: recipientAuthorized,
      idempotencyKey: 'duplicate-committed-key',
    };

    const first = await service.enforcePayment(defaultPolicy, request);
    expect(first.allowedToExecute).toBe(true);

    // Broadcast and confirm on-chain with verified settlement confirmation
    const confirmation: TrustedSettlementConfirmation = {
      txHash: validTxHash,
      blockNumber: 12345678n,
    };
    await service.confirmSettlement(first.reservation!.id, confirmation);

    // Duplicate request
    const retry = await service.enforcePayment(defaultPolicy, request);
    expect(retry.allowedToExecute).toBe(false);
    expect(retry.outcome).toBe('DUPLICATE_COMMITTED');
    expect(retry.reason).toContain('already completed');
    expect(retry.reservation?.status).toBe('COMMITTED');
  });

  it('14. should surface IDEMPOTENCY_CONFLICT when key is reused with different parameters', async () => {
    const originalRequest: EnforcePaymentRequest = {
      agentId,
      amountCusd: '0.08',
      recipient: recipientAuthorized,
      idempotencyKey: 'idemp-conflict-key',
    };

    const first = await service.enforcePayment(defaultPolicy, originalRequest);
    expect(first.allowedToExecute).toBe(true);

    // Reuse key with different amount (0.09)
    const conflictAmount: EnforcePaymentRequest = {
      ...originalRequest,
      amountCusd: '0.09',
    };
    const resAmountConflict = await service.enforcePayment(defaultPolicy, conflictAmount);
    expect(resAmountConflict.allowedToExecute).toBe(false);
    expect(resAmountConflict.outcome).toBe('IDEMPOTENCY_CONFLICT');
    expect(resAmountConflict.reason).toContain('different payment parameters');
  });

  it('15. LIFECYCLE SEPARATION: distinct submission, confirmation, failure, and reconciliation states', async () => {
    const req: EnforcePaymentRequest = {
      agentId,
      amountCusd: '0.10',
      recipient: recipientAuthorized,
      idempotencyKey: 'distinct-lifecycle-key',
    };

    // 1. Acquire reservation: status is RESERVED, funds encumbered in reservedWei
    const res = await service.enforcePayment(defaultPolicy, req);
    expect(res.allowedToExecute).toBe(true);
    const resId = res.reservation!.id;

    let state = await service.getBudgetState(agentId, '2026-10-03', '1.00');
    expect(state.reservedCusd).toBe('0.1');
    expect(state.spentCusd).toBe('0');
    expect(state.availableCusd).toBe('0.9');

    // 2. Submit transaction: status is SUBMITTED with txHash
    // CRITICAL CHECK: submission does NOT commit the funds!
    const submitted = await service.markSubmitted(resId, validTxHash);
    expect(submitted.status).toBe('SUBMITTED');
    expect(submitted.txHash).toBe(validTxHash);

    state = await service.getBudgetState(agentId, '2026-10-03', '1.00');
    expect(state.reservedCusd).toBe('0.1'); // STILL ENCUMBERED!
    expect(state.spentCusd).toBe('0');     // NOT YET SPENT!
    expect(state.availableCusd).toBe('0.9');

    // 3. Confirm settlement: requires verified confirmation attestation from trusted caller
    const confirmation: TrustedSettlementConfirmation = {
      txHash: validTxHash,
      blockNumber: 10001,
      confirmedAt: baseTime + 5000,
      attestedBy: 'celo-payment-pipeline',
    };
    const committed = await service.confirmSettlement(resId, confirmation);
    expect(committed.status).toBe('COMMITTED');

    state = await service.getBudgetState(agentId, '2026-10-03', '1.00');
    expect(state.reservedCusd).toBe('0');   // Encumbrance cleared
    expect(state.spentCusd).toBe('0.1');    // Moved permanently to spent!
    expect(state.availableCusd).toBe('0.9');

    // 4. Test failure and release
    const reqFail: EnforcePaymentRequest = {
      agentId,
      amountCusd: '0.10',
      recipient: recipientAuthorized,
      idempotencyKey: 'fail-release-key',
    };
    const resFail = await service.enforcePayment(defaultPolicy, reqFail);
    const failId = resFail.reservation!.id;

    const released = await service.failAndRelease(failId, 'Transaction reverted on Celo');
    expect(released.status).toBe('RELEASED');

    state = await service.getBudgetState(agentId, '2026-10-03', '1.00');
    expect(state.reservedCusd).toBe('0');
    expect(state.spentCusd).toBe('0.1');
    expect(state.availableCusd).toBe('0.9'); // Fully returned to available

    // 5. Test uncertain outcome / reconciliation hold
    const reqUncertain: EnforcePaymentRequest = {
      agentId,
      amountCusd: '0.10',
      recipient: recipientAuthorized,
      idempotencyKey: 'uncertain-key',
    };
    const resUncertain = await service.enforcePayment(defaultPolicy, reqUncertain);
    const uncertainId = resUncertain.reservation!.id;

    await service.markSubmitted(uncertainId, validTxHash);
    const held = await service.holdForReconciliation(uncertainId, 'RPC timeout: status uncertain');
    expect(held.status).toBe('HELD_FOR_RECONCILIATION');

    state = await service.getBudgetState(agentId, '2026-10-03', '1.00');
    expect(state.reservedCusd).toBe('0.1'); // Encumbrance preserved, never auto-released!
    expect(state.spentCusd).toBe('0.1');
    expect(state.availableCusd).toBe('0.8');

    // Invariant check
    expect(
      validateBudgetAccountingInvariant(
        state.dailyLimitWei,
        state.spentWei,
        state.reservedWei
      ).valid
    ).toBe(true);
  });

  it('16. TRUSTED SETTLEMENT CONFIRMATION: rejects malformed hashes defensively and enforces trusted caller responsibility', async () => {
    const req: EnforcePaymentRequest = {
      agentId,
      amountCusd: '0.10',
      recipient: recipientAuthorized,
      idempotencyKey: 'confirmation-validation-key',
    };
    const res = await service.enforcePayment(defaultPolicy, req);
    const resId = res.reservation!.id;

    // Missing confirmation object / null
    await expect(
      service.confirmSettlement(resId, null as unknown as TrustedSettlementConfirmation)
    ).rejects.toThrow('TrustedSettlementConfirmation');

    // Invalid txHash (not 32-byte 0x-prefixed hex)
    await expect(
      service.confirmSettlement(resId, { txHash: 'not-a-hash' })
    ).rejects.toThrow('32-byte 0x transaction hash');

    await expect(
      service.confirmSettlement(resId, { txHash: '0x1234' })
    ).rejects.toThrow('32-byte 0x transaction hash');

    // Valid syntax confirmation from trusted caller confirms settlement
    const confirmed = await service.confirmSettlement(resId, {
      txHash: validTxHash,
      attestedBy: 'trusted-payment-service',
    });
    expect(confirmed.status).toBe('COMMITTED');
  });

  it('17. STRICT POLICY IDENTITY BINDING: approvals must match active policy identity', async () => {
    const policyWithId = {
      ...defaultPolicy,
      policyId: 'policy-alpha-v1',
    };

    const baseRequest: EnforcePaymentRequest = {
      agentId,
      amountCusd: '0.15',
      recipient: recipientAuthorized,
      idempotencyKey: 'policy-binding-key',
    };

    // 1. Approval omits policyId when policy defines one -> REJECTED
    const approvalMissingId: UserApproval = {
      approvalId: 'appr-missing-id',
      agentId,
      amountCusd: '0.15',
      recipient: recipientAuthorized,
      idempotencyKey: 'policy-binding-key',
      approvedAt: baseTime - 1000,
      validUntil: baseTime + 60_000,
      // policyId omitted
    };
    const resMissing = await service.enforcePayment(policyWithId, {
      ...baseRequest,
      approval: approvalMissingId,
    });
    expect(resMissing.allowedToExecute).toBe(false);
    expect(resMissing.outcome).toBe('POLICY_DENIED');
    expect(resMissing.reason).toContain('missing required policy binding');

    // 2. Approval specifies mismatched policyId -> REJECTED
    const approvalMismatchedId: UserApproval = {
      ...approvalMissingId,
      policyId: 'policy-beta-v2', // Mismatch!
    };
    const resMismatched = await service.enforcePayment(policyWithId, {
      ...baseRequest,
      approval: approvalMismatchedId,
    });
    expect(resMismatched.allowedToExecute).toBe(false);
    expect(resMismatched.outcome).toBe('POLICY_DENIED');
    expect(resMismatched.reason).toContain('User approval mismatch: approval is bound to policy "policy-beta-v2"');

    // 3. Approval specifies matching policyId -> ACCEPTED
    const approvalMatchingId: UserApproval = {
      ...approvalMissingId,
      policyId: 'policy-alpha-v1', // Exact match
    };
    const resMatching = await service.enforcePayment(policyWithId, {
      ...baseRequest,
      approval: approvalMatchingId,
    });
    expect(resMatching.allowedToExecute).toBe(true);
    expect(resMatching.outcome).toBe('RESERVED');

    // 4. Policy has NO identity, but approval specifies one -> REJECTED
    const policyNoId: AgentSpendingPolicy = { ...defaultPolicy };
    const resNoIdPolicyWithBoundApproval = await service.enforcePayment(policyNoId, {
      ...baseRequest,
      idempotencyKey: 'policy-no-id-key',
      approval: { ...approvalMatchingId, idempotencyKey: 'policy-no-id-key' },
    });
    expect(resNoIdPolicyWithBoundApproval.allowedToExecute).toBe(false);
    expect(resNoIdPolicyWithBoundApproval.outcome).toBe('POLICY_DENIED');
    expect(resNoIdPolicyWithBoundApproval.reason).toContain('active policy has no ID');
  });

  it('18. LIFECYCLE SAFETY: confirmSettlement handles duplicate calls idempotently, settles reconciled holds, and rejects released reservations', async () => {
    const confirmation: TrustedSettlementConfirmation = {
      txHash: validTxHash,
      attestedBy: 'trusted-payment-service',
    };

    // 1. Idempotent retry: calling confirmSettlement twice returns COMMITTED without throwing or double-counting
    const req1: EnforcePaymentRequest = {
      agentId,
      amountCusd: '0.05',
      recipient: recipientAuthorized,
      idempotencyKey: 'idemp-confirm-test',
    };
    const res1 = await service.enforcePayment(defaultPolicy, req1);
    const id1 = res1.reservation!.id;

    const firstCommit = await service.confirmSettlement(id1, confirmation);
    expect(firstCommit.status).toBe('COMMITTED');

    const duplicateCommit = await service.confirmSettlement(id1, confirmation);
    expect(duplicateCommit.status).toBe('COMMITTED');

    // 2. Reconciliation hold -> confirmed settlement
    const req2: EnforcePaymentRequest = {
      agentId,
      amountCusd: '0.05',
      recipient: recipientAuthorized,
      idempotencyKey: 'reconciliation-commit-test',
    };
    const res2 = await service.enforcePayment(defaultPolicy, req2);
    const id2 = res2.reservation!.id;

    await service.markSubmitted(id2, validTxHash);
    await service.holdForReconciliation(id2, 'RPC timeout');

    // When verified receipt arrives later, confirmSettlement transitions HELD_FOR_RECONCILIATION -> COMMITTED
    const reconciledCommit = await service.confirmSettlement(id2, confirmation);
    expect(reconciledCommit.status).toBe('COMMITTED');

    // 3. Rejected transition: cannot confirm a RELEASED reservation
    const req3: EnforcePaymentRequest = {
      agentId,
      amountCusd: '0.05',
      recipient: recipientAuthorized,
      idempotencyKey: 'released-commit-test',
    };
    const res3 = await service.enforcePayment(defaultPolicy, req3);
    const id3 = res3.reservation!.id;

    await service.failAndRelease(id3, 'Payment failed pre-execution');

    await expect(service.confirmSettlement(id3, confirmation)).rejects.toThrow(
      'Cannot commit reservation from status RELEASED'
    );
  });
});

