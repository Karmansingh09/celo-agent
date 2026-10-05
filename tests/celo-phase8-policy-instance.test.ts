import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import {
  getBudgetStore,
  getPolicyEnforcementService,
  InMemoryBudgetStore,
  PolicyEnforcementService,
  AgentSpendingPolicy,
  EnforcePaymentRequest,
  TrustedSettlementConfirmation,
} from '../src/lib/policy';

describe('Phase 8.1: Policy & Budget Singleton Wiring', () => {
  const agentId = 'agent_singleton_test_001';
  const recipient = '0x19E7E376E7C213B7E7e7e46cc70A5dD086DAff2A';
  const validTxHash = '0x0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

  const testPolicy: AgentSpendingPolicy = {
    agentId,
    maxPerTransaction: '1.00',
    maxPerDay: '5.00',
    allowedRecipients: [recipient],
    autoApproveThreshold: '0.50',
    validUntil: Date.now() + 86_400_000,
  };

  beforeEach(() => {
    // Reset global singletons before each test to ensure test isolation
    globalThis.__celoBudgetStore = undefined;
    globalThis.__celoPolicyEnforcementService = undefined;
  });

  it('1. repeated getBudgetStore() calls return the identical store instance', () => {
    const store1 = getBudgetStore();
    const store2 = getBudgetStore();

    expect(store1).toBeInstanceOf(InMemoryBudgetStore);
    expect(store1).toBe(store2);
  });

  it('2. repeated getPolicyEnforcementService() calls return the identical service instance', () => {
    const service1 = getPolicyEnforcementService();
    const service2 = getPolicyEnforcementService();

    expect(service1).toBeInstanceOf(PolicyEnforcementService);
    expect(service1).toBe(service2);
  });

  it('3. PolicyEnforcementService uses the exact same BudgetStore instance returned by getBudgetStore()', async () => {
    const store = getBudgetStore();
    const service = getPolicyEnforcementService();

    const request: EnforcePaymentRequest = {
      agentId,
      amountCusd: '0.25',
      recipient,
      idempotencyKey: 'singleton-req-01',
    };

    const enforcementResult = await service.enforcePayment(testPolicy, request);
    expect(enforcementResult.allowedToExecute).toBe(true);
    expect(enforcementResult.outcome).toBe('RESERVED');
    expect(enforcementResult.reservation).toBeDefined();

    // Directly query the underlying singleton store to verify the reservation was created in that exact store
    const storedReservation = await store.getReservationByIdempotencyKey(
      agentId,
      'singleton-req-01'
    );
    expect(storedReservation).not.toBeNull();
    expect(storedReservation?.id).toBe(enforcementResult.reservation?.id);
    expect(storedReservation?.amountCusd).toBe('0.25');
    expect(storedReservation?.status).toBe('RESERVED');
  });

  it('4. interleaved calls do not create duplicate singleton instances', () => {
    const s1 = getBudgetStore();
    const svc1 = getPolicyEnforcementService();
    const s2 = getBudgetStore();
    const svc2 = getPolicyEnforcementService();
    const s3 = getBudgetStore();
    const svc3 = getPolicyEnforcementService();

    expect(s1).toBe(s2);
    expect(s2).toBe(s3);
    expect(svc1).toBe(svc2);
    expect(svc2).toBe(svc3);
  });

  it('5. singleton behavior remains stable when getters are called in different orders', () => {
    // Calling getPolicyEnforcementService() first when singletons are undefined
    // must instantiate the underlying store and bind it
    expect(globalThis.__celoBudgetStore).toBeUndefined();
    expect(globalThis.__celoPolicyEnforcementService).toBeUndefined();

    const service = getPolicyEnforcementService();
    expect(service).toBeInstanceOf(PolicyEnforcementService);
    expect(globalThis.__celoBudgetStore).toBeDefined();

    const store = getBudgetStore();
    expect(store).toBeInstanceOf(InMemoryBudgetStore);
    expect(store).toBe(globalThis.__celoBudgetStore);
  });

  it('6. existing budget and enforcement behavior still works completely through singleton instances', async () => {
    const store = getBudgetStore();
    const service = getPolicyEnforcementService();

    const request: EnforcePaymentRequest = {
      agentId,
      amountCusd: '0.40',
      recipient,
      idempotencyKey: 'singleton-lifecycle-01',
    };

    // 1. Enforce and reserve
    const reserveResult = await service.enforcePayment(testPolicy, request);
    expect(reserveResult.allowedToExecute).toBe(true);
    expect(reserveResult.reservation?.status).toBe('RESERVED');

    // 2. Mark submitted
    const submittedRes = await service.markSubmitted(
      reserveResult.reservation!.id,
      validTxHash
    );
    expect(submittedRes.status).toBe('SUBMITTED');
    expect(submittedRes.txHash).toBe(validTxHash);

    // 3. Confirm settlement
    const confirmation: TrustedSettlementConfirmation = {
      txHash: validTxHash,
      blockNumber: 123456n,
      confirmedAt: Date.now(),
    };
    const committedRes = await service.confirmSettlement(
      reserveResult.reservation!.id,
      confirmation
    );
    expect(committedRes.status).toBe('COMMITTED');

    // 4. Verify budget state on singleton store
    const windowId = committedRes.windowId;
    const budgetState = await store.getBudgetState(agentId, windowId, '5.00');
    expect(budgetState.spentCusd).toBe('0.4');
    expect(budgetState.reservedCusd).toBe('0');
    expect(budgetState.availableCusd).toBe('4.6');
  });

  it('7. src/lib/policy/instance.ts contains import server-only boundary', () => {
    const filePath = resolve(__dirname, '../src/lib/policy/instance.ts');
    const content = readFileSync(filePath, 'utf-8');

    expect(content).toMatch(/^import ['"]server-only['"];/);
  });
});
