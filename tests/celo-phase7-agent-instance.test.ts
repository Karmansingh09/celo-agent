import { describe, it, expect, beforeEach } from 'vitest';
import { getAgentStore, getAgentService, InMemoryAgentStore, AgentService } from '../src/lib/agent';

describe('Phase 7.5.1: Agent Service Singleton Wiring', () => {
  const testOwner = '0x1111111111111111111111111111111111111111';

  beforeEach(() => {
    // Reset global singletons before each test
    globalThis.__celoAgentStore = undefined;
    globalThis.__celoAgentService = undefined;
  });

  it('repeated getAgentStore() calls return the identical store instance', () => {
    const store1 = getAgentStore();
    const store2 = getAgentStore();

    expect(store1).toBeInstanceOf(InMemoryAgentStore);
    expect(store1).toBe(store2);
  });

  it('repeated getAgentService() calls return the identical service instance', () => {
    const service1 = getAgentService();
    const service2 = getAgentService();

    expect(service1).toBeInstanceOf(AgentService);
    expect(service1).toBe(service2);
  });

  it('the service uses the identical underlying singleton store', async () => {
    const store = getAgentStore();
    const service = getAgentService();

    const createdAgent = await service.createAgent(testOwner, {
      name: 'Singleton Verification Agent',
      spendingPolicy: {
        maxPerTransaction: '10.0',
        maxPerDay: '50.0',
        autoApproveThreshold: '5.0',
        validUntil: Date.now() + 86_400_000,
        allowedRecipients: ['0x2222222222222222222222222222222222222222'],
      },
    });

    // Directly verify that the agent exists in the underlying singleton store
    const retrievedFromStore = await store.getAgentById(createdAgent.id);
    expect(retrievedFromStore).not.toBeNull();
    expect(retrievedFromStore?.id).toBe(createdAgent.id);
    expect(retrievedFromStore?.name).toBe('Singleton Verification Agent');
    expect(retrievedFromStore?.ownerAddress).toBe(testOwner);
  });

  it('no duplicate store or service is created during normal calls', async () => {
    // Call getters multiple times interleaved
    const s1 = getAgentStore();
    const svc1 = getAgentService();
    const s2 = getAgentStore();
    const svc2 = getAgentService();

    expect(s1).toBe(s2);
    expect(svc1).toBe(svc2);
    expect(globalThis.__celoAgentStore).toBe(s1);
    expect(globalThis.__celoAgentService).toBe(svc1);
  });
});
