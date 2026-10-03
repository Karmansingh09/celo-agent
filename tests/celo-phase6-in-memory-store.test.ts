import { describe, it, expect, beforeEach } from 'vitest';
import { InMemoryBudgetStore } from '../src/lib/policy/in-memory-budget-store';
import {
  ReservationRequest,
  validateBudgetAccountingInvariant,
  parseCusdToBaseUnits,
} from '../src/lib/policy/budget-types';

describe('Phase 6.2: InMemoryBudgetStore', () => {
  let store: InMemoryBudgetStore;
  const agentA = 'agent-research-01';
  const agentB = 'agent-translator-02';
  const recipientA = '0x19E7E376E7C213B7E7e7e46cc70A5dD086DAff2A';
  const recipientB = '0x7E5F4552091A69125d5DfCb7b8C2659029395Bdf';
  const dailyLimit = '0.50'; // 0.50 cUSD
  const baseTime = Date.parse('2026-10-03T12:00:00.000Z');

  beforeEach(() => {
    store = new InMemoryBudgetStore();
  });

  it('1. should acquire a reservation and update budget state', async () => {
    const request: ReservationRequest = {
      agentId: agentA,
      amountCusd: '0.10',
      recipient: recipientA,
      idempotencyKey: 'tx-req-001',
      timestamp: baseTime,
    };

    const result = await store.acquireReservation(request, dailyLimit);
    expect(result.success).toBe(true);
    expect(result.outcome).toBe('RESERVED');
    expect(result.reservation).toBeDefined();
    expect(result.reservation?.status).toBe('RESERVED');
    expect(result.reservation?.amountCusd).toBe('0.10');
    expect(result.budgetState.reservedCusd).toBe('0.1');
    expect(result.budgetState.availableCusd).toBe('0.4');

    const inv = validateBudgetAccountingInvariant(
      result.budgetState.dailyLimitWei,
      result.budgetState.spentWei,
      result.budgetState.reservedWei
    );
    expect(inv.valid).toBe(true);
  });

  it('2. should deny a reservation that exceeds the available daily budget', async () => {
    const request: ReservationRequest = {
      agentId: agentA,
      amountCusd: '0.60', // Exceeds 0.50 limit
      recipient: recipientA,
      idempotencyKey: 'tx-req-overbudget',
      timestamp: baseTime,
    };

    const result = await store.acquireReservation(request, dailyLimit);
    expect(result.success).toBe(false);
    expect(result.outcome).toBe('DENIED');
    expect(result.reason).toContain('Daily budget exceeded');
    expect(result.budgetState.reservedCusd).toBe('0');
    expect(result.budgetState.availableCusd).toBe('0.5');
  });

  it('3. CORE CONCURRENCY: Two simultaneous $0.08 requests against $0.10 limit: exactly one succeeds', async () => {
    // Daily limit of 0.10 cUSD
    const smallLimit = '0.10';

    const req1: ReservationRequest = {
      agentId: agentA,
      amountCusd: '0.08',
      recipient: recipientA,
      idempotencyKey: 'concurrent-req-1',
      timestamp: baseTime,
    };

    const req2: ReservationRequest = {
      agentId: agentA,
      amountCusd: '0.08',
      recipient: recipientA,
      idempotencyKey: 'concurrent-req-2',
      timestamp: baseTime,
    };

    // Fire both simultaneously via Promise.all
    const [res1, res2] = await Promise.all([
      store.acquireReservation(req1, smallLimit),
      store.acquireReservation(req2, smallLimit),
    ]);

    const successes = [res1, res2].filter((r) => r.success && r.outcome === 'RESERVED');
    const denials = [res1, res2].filter((r) => !r.success && r.outcome === 'DENIED');

    expect(successes).toHaveLength(1);
    expect(denials).toHaveLength(1);

    const winner = successes[0];
    const loser = denials[0];

    expect(winner.reservation?.amountCusd).toBe('0.08');
    expect(loser.reason).toContain('Daily budget exceeded');

    // Final budget state check
    const finalState = await store.getBudgetState(agentA, '2026-10-03', smallLimit);
    expect(finalState.reservedCusd).toBe('0.08');
    expect(finalState.availableCusd).toBe('0.02');
    expect(finalState.spentCusd).toBe('0');
  });

  it('4. should handle same-key identical retry without double-reserving', async () => {
    const request: ReservationRequest = {
      agentId: agentA,
      amountCusd: '0.05',
      recipient: recipientA,
      idempotencyKey: 'retry-key-01',
      timestamp: baseTime,
    };

    const first = await store.acquireReservation(request, dailyLimit);
    expect(first.success).toBe(true);
    expect(first.outcome).toBe('RESERVED');
    expect(first.budgetState.reservedCusd).toBe('0.05');

    // Identical retry
    const retry = await store.acquireReservation(request, dailyLimit);
    expect(retry.success).toBe(true);
    expect(retry.outcome).toBe('DUPLICATE_IN_PROGRESS');
    expect(retry.reservation?.id).toBe(first.reservation?.id);
    expect(retry.budgetState.reservedCusd).toBe('0.05'); // Still only 0.05 reserved!
  });

  it('5. should reject repeated key with different payment details as IDEMPOTENCY_CONFLICT', async () => {
    const request: ReservationRequest = {
      agentId: agentA,
      amountCusd: '0.05',
      recipient: recipientA,
      idempotencyKey: 'conflict-key-01',
      timestamp: baseTime,
    };

    const first = await store.acquireReservation(request, dailyLimit);
    expect(first.success).toBe(true);

    // Mismatched amount
    const conflictAmount: ReservationRequest = {
      ...request,
      amountCusd: '0.08',
    };
    const resAmountConflict = await store.acquireReservation(conflictAmount, dailyLimit);
    expect(resAmountConflict.success).toBe(false);
    expect(resAmountConflict.outcome).toBe('IDEMPOTENCY_CONFLICT');
    expect(resAmountConflict.reason).toContain('different payment parameters');

    // Mismatched recipient
    const conflictRecipient: ReservationRequest = {
      ...request,
      recipient: recipientB,
    };
    const resRecipientConflict = await store.acquireReservation(conflictRecipient, dailyLimit);
    expect(resRecipientConflict.success).toBe(false);
    expect(resRecipientConflict.outcome).toBe('IDEMPOTENCY_CONFLICT');

    // Mismatched policyId
    const reqWithPolicy: ReservationRequest = {
      agentId: agentA,
      amountCusd: '0.05',
      recipient: recipientA,
      policyId: 'policy-alpha',
      idempotencyKey: 'policy-key-01',
      timestamp: baseTime,
    };
    await store.acquireReservation(reqWithPolicy, dailyLimit);

    const conflictPolicy: ReservationRequest = {
      ...reqWithPolicy,
      policyId: 'policy-beta',
    };
    const resPolicyConflict = await store.acquireReservation(conflictPolicy, dailyLimit);
    expect(resPolicyConflict.success).toBe(false);
    expect(resPolicyConflict.outcome).toBe('IDEMPOTENCY_CONFLICT');
    expect(resPolicyConflict.reason).toContain('policy');
  });

  it('6. should allow different agents to use the same idempotency key independently', async () => {
    const reqA: ReservationRequest = {
      agentId: agentA,
      amountCusd: '0.05',
      recipient: recipientA,
      idempotencyKey: 'shared-key-test',
      timestamp: baseTime,
    };

    const reqB: ReservationRequest = {
      agentId: agentB,
      amountCusd: '0.08',
      recipient: recipientB,
      idempotencyKey: 'shared-key-test', // Same key, different agent
      timestamp: baseTime,
    };

    const resA = await store.acquireReservation(reqA, dailyLimit);
    const resB = await store.acquireReservation(reqB, dailyLimit);

    expect(resA.success).toBe(true);
    expect(resA.outcome).toBe('RESERVED');
    expect(resB.success).toBe(true);
    expect(resB.outcome).toBe('RESERVED');

    expect(resA.reservation?.id).not.toBe(resB.reservation?.id);

    const lookupA = await store.getReservationByIdempotencyKey(agentA, 'shared-key-test');
    const lookupB = await store.getReservationByIdempotencyKey(agentB, 'shared-key-test');

    expect(lookupA?.amountCusd).toBe('0.05');
    expect(lookupB?.amountCusd).toBe('0.08');
  });

  it('7. should handle RESERVED -> SUBMITTED -> COMMITTED lifecycle accounting', async () => {
    const request: ReservationRequest = {
      agentId: agentA,
      amountCusd: '0.10',
      recipient: recipientA,
      idempotencyKey: 'lifecycle-test-01',
      timestamp: baseTime,
    };

    // 1. Acquire
    const { reservation } = await store.acquireReservation(request, dailyLimit);
    const resId = reservation!.id;

    // 2. Submit
    const submitted = await store.markSubmitted(resId, '0xabcdef123456');
    expect(submitted.status).toBe('SUBMITTED');
    expect(submitted.txHash).toBe('0xabcdef123456');

    let state = await store.getBudgetState(agentA, '2026-10-03', dailyLimit);
    expect(state.reservedCusd).toBe('0.1');
    expect(state.spentCusd).toBe('0');
    expect(state.availableCusd).toBe('0.4');

    // 3. Commit
    const committed = await store.commitReservation(resId);
    expect(committed.status).toBe('COMMITTED');

    state = await store.getBudgetState(agentA, '2026-10-03', dailyLimit);
    expect(state.reservedCusd).toBe('0');
    expect(state.spentCusd).toBe('0.1');
    expect(state.availableCusd).toBe('0.4');

    // Subsequent retry returns DUPLICATE_COMMITTED
    const retry = await store.acquireReservation(request, dailyLimit);
    expect(retry.success).toBe(true);
    expect(retry.outcome).toBe('DUPLICATE_COMMITTED');
  });

  it('8. should restore available budget when reservation is released after failure', async () => {
    const request: ReservationRequest = {
      agentId: agentA,
      amountCusd: '0.10',
      recipient: recipientA,
      idempotencyKey: 'release-test-01',
      timestamp: baseTime,
    };

    const { reservation } = await store.acquireReservation(request, dailyLimit);
    const resId = reservation!.id;

    // Release reservation
    const released = await store.releaseReservation(resId, 'Transaction reverted on-chain');
    expect(released.status).toBe('RELEASED');
    expect(released.failureReason).toBe('Transaction reverted on-chain');

    const state = await store.getBudgetState(agentA, '2026-10-03', dailyLimit);
    expect(state.reservedCusd).toBe('0');
    expect(state.spentCusd).toBe('0');
    expect(state.availableCusd).toBe('0.5'); // Fully restored to 0.50
  });

  it('9. should keep amount encumbered when held for reconciliation', async () => {
    const request: ReservationRequest = {
      agentId: agentA,
      amountCusd: '0.10',
      recipient: recipientA,
      idempotencyKey: 'reconciliation-test-01',
      timestamp: baseTime,
    };

    const { reservation } = await store.acquireReservation(request, dailyLimit);
    const resId = reservation!.id;

    await store.markSubmitted(resId, '0xpending123');
    const held = await store.holdForReconciliation(resId, 'RPC timeout waiting for receipt');
    expect(held.status).toBe('HELD_FOR_RECONCILIATION');

    const state = await store.getBudgetState(agentA, '2026-10-03', dailyLimit);
    expect(state.reservedCusd).toBe('0.1'); // Encumbrance preserved!
    expect(state.availableCusd).toBe('0.4');

    // From HELD_FOR_RECONCILIATION, can be committed if blockscout reveals it confirmed later
    const committed = await store.commitReservation(resId);
    expect(committed.status).toBe('COMMITTED');

    const finalState = await store.getBudgetState(agentA, '2026-10-03', dailyLimit);
    expect(finalState.reservedCusd).toBe('0');
    expect(finalState.spentCusd).toBe('0.1');
  });

  it('10. should prevent double-counting on duplicate lifecycle calls', async () => {
    const request: ReservationRequest = {
      agentId: agentA,
      amountCusd: '0.10',
      recipient: recipientA,
      idempotencyKey: 'double-call-test',
      timestamp: baseTime,
    };

    const { reservation } = await store.acquireReservation(request, dailyLimit);
    const resId = reservation!.id;

    await store.commitReservation(resId);
    // Duplicate commit
    await store.commitReservation(resId);

    const state = await store.getBudgetState(agentA, '2026-10-03', dailyLimit);
    expect(state.spentCusd).toBe('0.1'); // NOT 0.2!
    expect(state.reservedCusd).toBe('0');
  });

  it('11. should fail safely on invalid state transitions', async () => {
    const request: ReservationRequest = {
      agentId: agentA,
      amountCusd: '0.10',
      recipient: recipientA,
      idempotencyKey: 'invalid-transition-test',
      timestamp: baseTime,
    };

    const { reservation } = await store.acquireReservation(request, dailyLimit);
    const resId = reservation!.id;

    await store.releaseReservation(resId, 'test failure');

    // Attempting to submit or commit an already released reservation should fail
    await expect(store.markSubmitted(resId, '0x123')).rejects.toThrow(
      'Cannot mark reservation as SUBMITTED from status RELEASED'
    );
    await expect(store.commitReservation(resId)).rejects.toThrow(
      'Cannot commit reservation from status RELEASED'
    );
  });

  it('12. should scope budgets to UTC calendar days across midnight boundary', async () => {
    const day1Time = Date.parse('2026-10-03T23:50:00.000Z');
    const day2Time = Date.parse('2026-10-04T00:10:00.000Z');

    const reqDay1: ReservationRequest = {
      agentId: agentA,
      amountCusd: '0.40',
      recipient: recipientA,
      idempotencyKey: 'day1-tx',
      timestamp: day1Time,
    };

    const reqDay2: ReservationRequest = {
      agentId: agentA,
      amountCusd: '0.30',
      recipient: recipientA,
      idempotencyKey: 'day2-tx',
      timestamp: day2Time,
    };

    const resDay1 = await store.acquireReservation(reqDay1, dailyLimit);
    const resDay2 = await store.acquireReservation(reqDay2, dailyLimit);

    expect(resDay1.success).toBe(true);
    expect(resDay1.reservation?.windowId).toBe('2026-10-03');
    expect(resDay1.budgetState.availableCusd).toBe('0.1');

    // Day 2 has its own fresh daily limit of 0.50 cUSD
    expect(resDay2.success).toBe(true);
    expect(resDay2.reservation?.windowId).toBe('2026-10-04');
    expect(resDay2.budgetState.availableCusd).toBe('0.2');
  });

  it('13. should reject invalid amounts, recipient addresses, and timestamps safely', async () => {
    // Bad amount
    const badAmount: ReservationRequest = {
      agentId: agentA,
      amountCusd: '-0.10',
      recipient: recipientA,
      idempotencyKey: 'bad-amount',
      timestamp: baseTime,
    };
    const resAmount = await store.acquireReservation(badAmount, dailyLimit);
    expect(resAmount.success).toBe(false);
    expect(resAmount.reason).toContain('Invalid requested amount');

    // Bad recipient
    const badRecipient: ReservationRequest = {
      agentId: agentA,
      amountCusd: '0.10',
      recipient: 'not-an-evm-address',
      idempotencyKey: 'bad-recipient',
      timestamp: baseTime,
    };
    const resRecipient = await store.acquireReservation(badRecipient, dailyLimit);
    expect(resRecipient.success).toBe(false);
    expect(resRecipient.reason).toContain('Invalid recipient EVM address');

    // Bad timestamp (NaN)
    const badTimestamp: ReservationRequest = {
      agentId: agentA,
      amountCusd: '0.10',
      recipient: recipientA,
      idempotencyKey: 'bad-timestamp',
      timestamp: NaN,
    };
    const resTimestamp = await store.acquireReservation(badTimestamp, dailyLimit);
    expect(resTimestamp.success).toBe(false);
    expect(resTimestamp.reason).toContain('Invalid request timestamp');
  });

  it('14. should preserve accounting invariant after every sequence of operations', async () => {
    const r1 = await store.acquireReservation(
      {
        agentId: agentA,
        amountCusd: '0.10',
        recipient: recipientA,
        idempotencyKey: 'inv-test-1',
        timestamp: baseTime,
      },
      dailyLimit
    );
    expect(
      validateBudgetAccountingInvariant(
        r1.budgetState.dailyLimitWei,
        r1.budgetState.spentWei,
        r1.budgetState.reservedWei
      ).valid
    ).toBe(true);

    const r2 = await store.acquireReservation(
      {
        agentId: agentA,
        amountCusd: '0.15',
        recipient: recipientA,
        idempotencyKey: 'inv-test-2',
        timestamp: baseTime,
      },
      dailyLimit
    );
    expect(
      validateBudgetAccountingInvariant(
        r2.budgetState.dailyLimitWei,
        r2.budgetState.spentWei,
        r2.budgetState.reservedWei
      ).valid
    ).toBe(true);

    await store.commitReservation(r1.reservation!.id);
    const stateAfterCommit = await store.getBudgetState(agentA, '2026-10-03', dailyLimit);
    expect(
      validateBudgetAccountingInvariant(
        stateAfterCommit.dailyLimitWei,
        stateAfterCommit.spentWei,
        stateAfterCommit.reservedWei
      ).valid
    ).toBe(true);
    expect(stateAfterCommit.spentCusd).toBe('0.1');
    expect(stateAfterCommit.reservedCusd).toBe('0.15');
    expect(stateAfterCommit.availableCusd).toBe('0.25');
  });

  it('15. HISTORICAL SETTLEMENT: reservation created before UTC midnight settles after midnight', async () => {
    const day1Time = Date.parse('2026-10-03T23:55:00.000Z');
    const day2Time = Date.parse('2026-10-04T00:05:00.000Z');

    // Day 1 reservation: 0.20 cUSD
    const req1: ReservationRequest = {
      agentId: agentA,
      amountCusd: '0.20',
      recipient: recipientA,
      idempotencyKey: 'midnight-res-commit',
      timestamp: day1Time,
    };

    const res1 = await store.acquireReservation(req1, dailyLimit);
    expect(res1.success).toBe(true);
    expect(res1.reservation?.windowId).toBe('2026-10-03');

    // Day 1 reservation for release test: 0.10 cUSD
    const req2: ReservationRequest = {
      agentId: agentA,
      amountCusd: '0.10',
      recipient: recipientA,
      idempotencyKey: 'midnight-res-release',
      timestamp: day1Time,
    };

    const res2 = await store.acquireReservation(req2, dailyLimit);
    expect(res2.success).toBe(true);
    expect(res2.reservation?.windowId).toBe('2026-10-03');

    // Check Day 1 state before settlement
    const stateDay1Initial = await store.getBudgetState(agentA, '2026-10-03', dailyLimit);
    expect(stateDay1Initial.reservedCusd).toBe('0.3');
    expect(stateDay1Initial.spentCusd).toBe('0');
    expect(stateDay1Initial.availableCusd).toBe('0.2');

    // Simulate Next Day activity (Day 2): Spend 0.15 cUSD on day 2
    const reqDay2: ReservationRequest = {
      agentId: agentA,
      amountCusd: '0.15',
      recipient: recipientA,
      idempotencyKey: 'day2-independent-tx',
      timestamp: day2Time,
    };
    const resDay2 = await store.acquireReservation(reqDay2, dailyLimit);
    expect(resDay2.success).toBe(true);
    expect(resDay2.reservation?.windowId).toBe('2026-10-04');

    // Now, after midnight, commit res1 (from Day 1)
    const committed1 = await store.commitReservation(res1.reservation!.id);
    expect(committed1.status).toBe('COMMITTED');

    // And release res2 (from Day 1)
    const released2 = await store.releaseReservation(res2.reservation!.id, 'Failed on-chain');
    expect(released2.status).toBe('RELEASED');

    // Assert: Day 1 spending updated accurately (spent: 0.20, reserved: 0, available: 0.30)
    const stateDay1Final = await store.getBudgetState(agentA, '2026-10-03', dailyLimit);
    expect(stateDay1Final.spentCusd).toBe('0.2');
    expect(stateDay1Final.reservedCusd).toBe('0');
    expect(stateDay1Final.availableCusd).toBe('0.3');
    expect(validateBudgetAccountingInvariant(
      stateDay1Final.dailyLimitWei,
      stateDay1Final.spentWei,
      stateDay1Final.reservedWei
    ).valid).toBe(true);

    // Assert: Day 2 spending and budget are completely unaffected by Day 1 settlement
    const stateDay2Final = await store.getBudgetState(agentA, '2026-10-04', dailyLimit);
    expect(stateDay2Final.spentCusd).toBe('0');
    expect(stateDay2Final.reservedCusd).toBe('0.15');
    expect(stateDay2Final.availableCusd).toBe('0.35');
    expect(validateBudgetAccountingInvariant(
      stateDay2Final.dailyLimitWei,
      stateDay2Final.spentWei,
      stateDay2Final.reservedWei
    ).valid).toBe(true);
  });

  it('16. CONTRADICTORY LIMITS: rejects attempt to alter daily limit mid-window', async () => {
    const initialLimit = '0.50';
    const contradictoryLimit = '1.00';

    // Initialize window with 0.50
    const state = await store.getBudgetState(agentA, '2026-10-03', initialLimit);
    expect(state.dailyLimitCusd).toBe('0.5');

    // Attempting to query same window with different limit throws
    await expect(
      store.getBudgetState(agentA, '2026-10-03', contradictoryLimit)
    ).rejects.toThrow('Contradictory daily limit');

    // Attempting to acquire a reservation with different limit is DENIED
    const req: ReservationRequest = {
      agentId: agentA,
      amountCusd: '0.10',
      recipient: recipientA,
      idempotencyKey: 'contradictory-req',
      timestamp: baseTime,
    };
    const denied = await store.acquireReservation(req, contradictoryLimit);
    expect(denied.success).toBe(false);
    expect(denied.outcome).toBe('DENIED');
    expect(denied.reason).toContain('Contradictory daily limit');

    // Verify existing state was NOT mutated or inflated
    const verifiedState = await store.getBudgetState(agentA, '2026-10-03', initialLimit);
    expect(verifiedState.dailyLimitCusd).toBe('0.5');
    expect(verifiedState.availableCusd).toBe('0.5');
    expect(verifiedState.reservedCusd).toBe('0');
  });
});

