import { describe, expect, it } from 'vitest';
import {
  AgentService,
  InMemoryAgentStore,
} from '../src/lib/agent';
import {
  AgentPaymentService,
  InMemoryPendingApprovalStore,
} from '../src/lib/payment';
import {
  InMemoryBudgetStore,
  PolicyEnforcementService,
} from '../src/lib/policy';

describe('P1-B: server-managed policy versioning', () => {
  const owner = '0x1111111111111111111111111111111111111111';
  const recipient = '0x2222222222222222222222222222222222222222';
  const now = Date.parse('2026-11-03T12:00:00.000Z');

  function policy(overrides?: Record<string, unknown>) {
    return {
      maxPerTransaction: '1.00',
      maxPerDay: '2.00',
      autoApproveThreshold: '0.10',
      allowedRecipients: [recipient],
      validUntil: now + 86_400_000,
      ...overrides,
    };
  }

  it('generates a fresh policy version and ignores client-supplied identity on creation', async () => {
    const service = new AgentService(new InMemoryAgentStore(() => now), () => now);
    const agent = await service.createAgent(owner, {
      name: 'Versioned Agent',
      spendingPolicy: policy({ policyId: 'attacker-selected-v1', id: 'legacy-id' }),
    });

    expect(agent.spendingPolicy.policyId).toMatch(/^policy_[a-z0-9]+_[a-f0-9]{16}$/);
    expect(agent.spendingPolicy.policyId).not.toBe('attacker-selected-v1');
    expect(agent.spendingPolicy.id).toBeUndefined();
  });

  it('creates a new policy version for policy updates but preserves it for metadata-only updates', async () => {
    const service = new AgentService(new InMemoryAgentStore(() => now), () => now);
    const agent = await service.createAgent(owner, {
      name: 'Versioned Agent',
      spendingPolicy: policy(),
    });
    const firstPolicyId = agent.spendingPolicy.policyId;

    const metadataUpdated = await service.updateAgent(owner, agent.id, {
      metadata: { environment: 'test' },
    });
    expect(metadataUpdated.spendingPolicy.policyId).toBe(firstPolicyId);

    const policyUpdated = await service.updateAgent(owner, agent.id, {
      spendingPolicy: policy({
        maxPerTransaction: '0.50',
        policyId: 'attacker-selected-v2',
      }),
    });
    expect(policyUpdated.spendingPolicy.policyId).toMatch(/^policy_[a-z0-9]+_[a-f0-9]{16}$/);
    expect(policyUpdated.spendingPolicy.policyId).not.toBe(firstPolicyId);
    expect(policyUpdated.spendingPolicy.policyId).not.toBe('attacker-selected-v2');
  });

  it('binds pending approvals to the exact policy version and expires stale approvals', async () => {
    const agentService = new AgentService(new InMemoryAgentStore(() => now), () => now);
    const pendingStore = new InMemoryPendingApprovalStore();
    const paymentService = new AgentPaymentService(
      agentService,
      new PolicyEnforcementService(new InMemoryBudgetStore(), () => now),
      pendingStore,
      () => now
    );
    const agent = await agentService.createAgent(owner, {
      name: 'Approval Version Agent',
      spendingPolicy: policy(),
    });

    const requested = await paymentService.requestPayment(owner, {
      agentId: agent.id,
      amountCusd: '0.50',
      recipient,
      idempotencyKey: 'version-bound-approval',
    });
    expect(requested.outcome).toBe('REQUIRE_USER_APPROVAL');
    expect(requested.pendingApproval?.policyId).toBe(agent.spendingPolicy.policyId);

    const updatedAgent = await agentService.updateAgent(owner, agent.id, {
      spendingPolicy: policy({ maxPerTransaction: '0.75' }),
    });
    expect(updatedAgent.spendingPolicy.policyId).not.toBe(agent.spendingPolicy.policyId);

    await expect(
      paymentService.approvePaymentRequest(owner, agent.id, requested.requestId)
    ).rejects.toThrow('stale policy version');

    const invalidated = await pendingStore.getByRequestId(requested.requestId);
    expect(invalidated?.status).toBe('EXPIRED');
    expect(invalidated?.statusReason).toContain('policy version changed');
  });

  it('serializes concurrent approval attempts so at most one can authorize a version-bound request', async () => {
    const agentService = new AgentService(new InMemoryAgentStore(() => now), () => now);
    const pendingStore = new InMemoryPendingApprovalStore();
    const paymentService = new AgentPaymentService(
      agentService,
      new PolicyEnforcementService(new InMemoryBudgetStore(), () => now),
      pendingStore,
      () => now
    );
    const agent = await agentService.createAgent(owner, {
      name: 'Concurrent Approval Agent',
      spendingPolicy: policy(),
    });
    const requested = await paymentService.requestPayment(owner, {
      agentId: agent.id,
      amountCusd: '0.50',
      recipient,
      idempotencyKey: 'concurrent-version-approval',
    });

    const results = await Promise.allSettled([
      paymentService.approvePaymentRequest(owner, agent.id, requested.requestId),
      paymentService.approvePaymentRequest(owner, agent.id, requested.requestId),
    ]);

    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1);
    expect((await pendingStore.getByRequestId(requested.requestId))?.status).toBe('APPROVED');
  });
});
