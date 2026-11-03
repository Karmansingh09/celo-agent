import { describe, expect, it } from 'vitest';
import {
  AgentPausedError,
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

class BlockingAgentStore extends InMemoryAgentStore {
  private blockNextRead = false;
  private readBlocked = false;
  private releaseRead!: () => void;
  private resolveReadStarted!: () => void;
  private readonly readStarted = new Promise<void>((resolve) => {
    this.resolveReadStarted = resolve;
  });

  public blockNextAgentRead(): void {
    this.blockNextRead = true;
  }

  public waitForBlockedRead(): Promise<void> {
    return this.readStarted;
  }

  public unblockRead(): void {
    this.releaseRead();
  }

  public override async getAgentById(id: string) {
    const agent = await super.getAgentById(id);
    if (this.blockNextRead && !this.readBlocked) {
      this.blockNextRead = false;
      this.readBlocked = true;
      this.resolveReadStarted();
      await new Promise<void>((resolve) => {
        this.releaseRead = resolve;
      });
    }
    return agent;
  }
}

describe('P1-A: lifecycle operations share the agent operation lock', () => {
  const owner = '0x1111111111111111111111111111111111111111';
  const recipient = '0x2222222222222222222222222222222222222222';

  async function setup() {
    const store = new BlockingAgentStore(() => Date.now());
    const agentService = new AgentService(store, () => Date.now());
    const policyService = new PolicyEnforcementService(new InMemoryBudgetStore());
    const paymentService = new AgentPaymentService(
      agentService,
      policyService,
      new InMemoryPendingApprovalStore()
    );
    const agent = await agentService.createAgent(owner, {
      name: 'Lock Test Agent',
      spendingPolicy: {
        maxPerTransaction: '1.00',
        maxPerDay: '2.00',
        allowedRecipients: [recipient],
        autoApproveThreshold: '1.00',
        validUntil: Date.now() + 86_400_000,
      },
    });

    return { store, agentService, paymentService, agent };
  }

  it('waits for pause before evaluating a concurrent payment request', async () => {
    const { store, agentService, paymentService, agent } = await setup();
    store.blockNextAgentRead();

    const pausePromise = agentService.pauseAgent(owner, agent.id, 'maintenance');
    await store.waitForBlockedRead();

    let paymentSettled = false;
    const paymentPromise = paymentService.requestPayment(owner, {
      agentId: agent.id,
      amountCusd: '0.10',
      recipient,
      idempotencyKey: 'pause-race-payment',
    }).finally(() => {
      paymentSettled = true;
    });

    await Promise.resolve();
    expect(paymentSettled).toBe(false);

    store.unblockRead();
    await expect(pausePromise).resolves.toMatchObject({ status: 'PAUSED' });
    await expect(paymentPromise).rejects.toBeInstanceOf(AgentPausedError);

    const finalAgent = await agentService.getAgentById(owner, agent.id);
    expect(finalAgent.status).toBe('PAUSED');
  });

  it('serializes concurrent pause and resume transitions in call order', async () => {
    const { store, agentService, agent } = await setup();
    store.blockNextAgentRead();

    const pausePromise = agentService.pauseAgent(owner, agent.id, 'first transition');
    await store.waitForBlockedRead();

    let resumeSettled = false;
    const resumePromise = agentService.resumeAgent(owner, agent.id, 'second transition')
      .finally(() => {
        resumeSettled = true;
      });

    await Promise.resolve();
    expect(resumeSettled).toBe(false);

    store.unblockRead();
    await expect(pausePromise).resolves.toMatchObject({ status: 'PAUSED' });
    await expect(resumePromise).resolves.toMatchObject({ status: 'ACTIVE' });

    const finalAgent = await agentService.getAgentById(owner, agent.id);
    expect(finalAgent.status).toBe('ACTIVE');
    expect(finalAgent.statusReason).toBe('second transition');
  });

  it('waits for pause before termination so cleanup observes the final lifecycle state', async () => {
    const { store, agentService, agent } = await setup();
    store.blockNextAgentRead();

    const pausePromise = agentService.pauseAgent(owner, agent.id);
    await store.waitForBlockedRead();

    let terminationSettled = false;
    const terminationPromise = agentService.terminateAgent(owner, agent.id)
      .finally(() => {
        terminationSettled = true;
      });

    await Promise.resolve();
    expect(terminationSettled).toBe(false);

    store.unblockRead();
    await expect(pausePromise).resolves.toMatchObject({ status: 'PAUSED' });
    await expect(terminationPromise).resolves.toMatchObject({ status: 'TERMINATED' });
  });
});
