import { describe, it, expect, beforeEach } from 'vitest';
import {
  Agent,
  AgentStatus,
  BoundAgentSpendingPolicy,
  AgentNotFoundError,
  AgentAlreadyExistsError,
  InvalidAgentStateError,
  InvalidAgentInputError,
} from '../src/lib/agent/types';
import { InMemoryAgentStore } from '../src/lib/agent/in-memory-agent-store';

describe('Phase 7.2: InMemoryAgentStore', () => {
  let store: InMemoryAgentStore;
  let currentTime: number;

  const baseTime = Date.parse('2026-10-04T10:00:00.000Z');
  const validOwner1 = '0x19E7E376E7C213B7E7e7e46cc70A5dD086DAff2A';
  const validOwner2 = '0x7E5F4552091A69125d5DfCb7b8C2659029395Bdf';
  const validRecipient = '0x19E7E376E7C213B7E7e7e46cc70A5dD086DAff2A';

  const createTestPolicy = (agentId: string): BoundAgentSpendingPolicy => ({
    agentId,
    maxPerTransaction: '0.10',
    maxPerDay: '0.50',
    allowedRecipients: [validRecipient],
    autoApproveThreshold: '0.05',
    validUntil: baseTime + 86400000,
    policyId: 'policy-test-v1',
  });

  const createTestAgent = (id: string, ownerAddress: string = validOwner1, createdAt: number = baseTime): Agent => ({
    id,
    ownerAddress,
    name: `Agent ${id}`,
    description: `Description for ${id}`,
    status: 'ACTIVE',
    spendingPolicy: createTestPolicy(id),
    metadata: { env: 'test', tier: 'standard' },
    createdAt,
    updatedAt: createdAt,
  });

  beforeEach(() => {
    currentTime = baseTime;
    store = new InMemoryAgentStore(() => currentTime);
  });

  describe('1. Agent Creation and Retrieval', () => {
    it('should create and retrieve an agent by ID preserving all fields', async () => {
      const agent = createTestAgent('agent_10000001');
      const created = await store.createAgent(agent);

      expect(created.id).toBe('agent_10000001');
      expect(created.name).toBe('Agent agent_10000001');
      expect(created.ownerAddress).toBe(validOwner1);
      expect(created.status).toBe('ACTIVE');
      expect(created.spendingPolicy.agentId).toBe('agent_10000001');
      expect(created.spendingPolicy.policyId).toBe('policy-test-v1');
      expect(created.metadata).toEqual({ env: 'test', tier: 'standard' });

      const retrieved = await store.getAgentById('agent_10000001');
      expect(retrieved).not.toBeNull();
      expect(retrieved?.id).toBe('agent_10000001');
      expect(retrieved?.name).toBe('Agent agent_10000001');
    });

    it('should return null when retrieving non-existent or invalid agent ID', async () => {
      expect(await store.getAgentById('agent_non_existent')).toBeNull();
      expect(await store.getAgentById('')).toBeNull();
      expect(await store.getAgentById('   ')).toBeNull();
    });

    it('should reject creating an agent with an existing ID (duplicate ID)', async () => {
      const agent = createTestAgent('agent_10000002');
      await store.createAgent(agent);

      await expect(store.createAgent(agent)).rejects.toThrow(AgentAlreadyExistsError);
    });
  });

  describe('2. Deep Cloning & Reference Isolation (Anti-Tampering)', () => {
    it('should not allow callers to mutate stored state by mutating input object after creation', async () => {
      const agent = createTestAgent('agent_10000003');
      await store.createAgent(agent);

      // Mutate original input object after store.createAgent
      agent.name = 'Tampered Input Name';
      agent.spendingPolicy.allowedRecipients.push('0x0000000000000000000000000000000000000000');
      agent.metadata!['env'] = 'hacked';

      const stored = await store.getAgentById('agent_10000003');
      expect(stored?.name).toBe('Agent agent_10000003');
      expect(stored?.spendingPolicy.allowedRecipients).toEqual([validRecipient]);
      expect(stored?.metadata?.env).toBe('test');
    });

    it('should not allow callers to mutate stored state by mutating returned agent object', async () => {
      const agent = createTestAgent('agent_10000004');
      const created = await store.createAgent(agent);

      // Mutate returned object
      created.name = 'Tampered Return Name';
      created.spendingPolicy.allowedRecipients.push('0x0000000000000000000000000000000000000000');
      created.metadata!['tier'] = 'vip';

      const retrieved1 = await store.getAgentById('agent_10000004');
      expect(retrieved1?.name).toBe('Agent agent_10000004');
      expect(retrieved1?.spendingPolicy.allowedRecipients).toEqual([validRecipient]);
      expect(retrieved1?.metadata?.tier).toBe('standard');

      // Mutate retrieved object
      retrieved1!.spendingPolicy.maxPerTransaction = '999.00';
      const retrieved2 = await store.getAgentById('agent_10000004');
      expect(retrieved2?.spendingPolicy.maxPerTransaction).toBe('0.10');
    });
  });

  describe('3. Validation on Create', () => {
    it('should reject invalid top-level shapes (null, array, primitive)', async () => {
      await expect(store.createAgent(null as unknown as Agent)).rejects.toThrow(InvalidAgentInputError);
      await expect(store.createAgent([] as unknown as Agent)).rejects.toThrow(InvalidAgentInputError);
      await expect(store.createAgent('string' as unknown as Agent)).rejects.toThrow(InvalidAgentInputError);
    });

    it('should reject malformed agent ID or name', async () => {
      const badIdAgent = { ...createTestAgent('bad_id') };
      await expect(store.createAgent(badIdAgent)).rejects.toThrow('Invalid agent ID format');

      const badNameAgent = { ...createTestAgent('agent_valid_01'), name: '' };
      await expect(store.createAgent(badNameAgent)).rejects.toThrow('Agent name must be a non-empty string');
    });

    it('should reject mismatched spending policy agentId', async () => {
      const agent = createTestAgent('agent_valid_02');
      agent.spendingPolicy.agentId = 'agent_different_99';
      await expect(store.createAgent(agent)).rejects.toThrow('does not match agent ID');
    });
  });

  describe('4. Updating Permitted Agent Fields', () => {
    it('should update permitted fields and advance updatedAt timestamp', async () => {
      const agent = createTestAgent('agent_update_01');
      await store.createAgent(agent);

      currentTime = baseTime + 5000;
      const updated = await store.updateAgent('agent_update_01', {
        name: 'Updated Name',
        description: 'Updated Description',
        metadata: { env: 'production' },
      });

      expect(updated.name).toBe('Updated Name');
      expect(updated.description).toBe('Updated Description');
      expect(updated.metadata).toEqual({ env: 'production' });
      expect(updated.createdAt).toBe(baseTime);
      expect(updated.updatedAt).toBe(baseTime + 5000);

      const retrieved = await store.getAgentById('agent_update_01');
      expect(retrieved?.name).toBe('Updated Name');
      expect(retrieved?.updatedAt).toBe(baseTime + 5000);
    });

    it('should update spending policy when agentId matches', async () => {
      const agent = createTestAgent('agent_update_02');
      await store.createAgent(agent);

      const newPolicy: BoundAgentSpendingPolicy = {
        agentId: 'agent_update_02',
        maxPerTransaction: '0.20',
        maxPerDay: '1.00',
        allowedRecipients: [validRecipient],
        autoApproveThreshold: '0.10',
        validUntil: baseTime + 172800000,
        policyId: 'policy-test-v2',
      };

      const updated = await store.updateAgent('agent_update_02', { spendingPolicy: newPolicy });
      expect(updated.spendingPolicy.maxPerTransaction).toBe('0.20');
      expect(updated.spendingPolicy.maxPerDay).toBe('1.00');
      expect(updated.spendingPolicy.policyId).toBe('policy-test-v2');
    });

    it('should reject update if policy agentId does not match target agent', async () => {
      const agent = createTestAgent('agent_update_03');
      await store.createAgent(agent);

      const mismatchedPolicy: BoundAgentSpendingPolicy = {
        ...createTestPolicy('agent_different_id_99'),
        maxPerTransaction: '0.20',
      };

      await expect(
        store.updateAgent('agent_update_03', { spendingPolicy: mismatchedPolicy })
      ).rejects.toThrow('does not match agent ID');
    });

    it('should throw AgentNotFoundError when updating non-existent agent', async () => {
      await expect(
        store.updateAgent('agent_non_existent', { name: 'New Name' })
      ).rejects.toThrow(AgentNotFoundError);
    });
  });

  describe('5. Immutability Protection & Rejection of Forbidden Fields', () => {
    it('should strictly reject attempts to modify immutable fields in untyped patch', async () => {
      const agent = createTestAgent('agent_immutable_01');
      await store.createAgent(agent);

      // Attempt to modify id
      await expect(
        store.updateAgent('agent_immutable_01', { id: 'agent_new_id' } as unknown as any)
      ).rejects.toThrow('Cannot modify immutable field: id');

      // Attempt to modify ownerAddress
      await expect(
        store.updateAgent('agent_immutable_01', { ownerAddress: validOwner2 } as unknown as any)
      ).rejects.toThrow('Cannot modify immutable field: ownerAddress');

      // Attempt to modify createdAt
      await expect(
        store.updateAgent('agent_immutable_01', { createdAt: 1000 } as unknown as any)
      ).rejects.toThrow('Cannot modify immutable field: createdAt');
    });
  });

  describe('6. All-or-Nothing Atomicity on Failed Update', () => {
    it('should leave stored state completely unchanged if an update fails validation', async () => {
      const agent = createTestAgent('agent_atomic_01');
      await store.createAgent(agent);

      // Patch contains valid name update, but invalid spending policy
      const invalidPatch = {
        name: 'New Name That Should Not Persist',
        spendingPolicy: {
          agentId: 'agent_mismatched_id',
          maxPerTransaction: '0.20',
          maxPerDay: '1.00',
          allowedRecipients: [validRecipient],
          autoApproveThreshold: '0.10',
          validUntil: baseTime + 100000,
        },
      };

      await expect(store.updateAgent('agent_atomic_01', invalidPatch)).rejects.toThrow();

      // Verify stored record was NOT mutated
      const stored = await store.getAgentById('agent_atomic_01');
      expect(stored?.name).toBe('Agent agent_atomic_01');
      expect(stored?.updatedAt).toBe(baseTime);
    });
  });

  describe('7. Lifecycle Transitions and statusReason Semantics', () => {
    it('should pause an active agent and record statusReason', async () => {
      const agent = createTestAgent('agent_lifecycle_01');
      await store.createAgent(agent);

      const paused = await store.updateAgent('agent_lifecycle_01', {
        status: 'PAUSED',
        statusReason: 'Suspicious activity detected',
      });

      expect(paused.status).toBe('PAUSED');
      expect(paused.statusReason).toBe('Suspicious activity detected');

      const retrieved = await store.getAgentById('agent_lifecycle_01');
      expect(retrieved?.status).toBe('PAUSED');
      expect(retrieved?.statusReason).toBe('Suspicious activity detected');
    });

    it('should resume a paused agent and clear statusReason unless explicitly specified', async () => {
      const agent = createTestAgent('agent_lifecycle_02');
      await store.createAgent(agent);

      await store.updateAgent('agent_lifecycle_02', {
        status: 'PAUSED',
        statusReason: 'Under maintenance',
      });

      // Resume without statusReason -> clears previous pause reason
      const resumed = await store.updateAgent('agent_lifecycle_02', { status: 'ACTIVE' });
      expect(resumed.status).toBe('ACTIVE');
      expect(resumed.statusReason).toBeUndefined();

      // Pause again and resume with explicit reason
      await store.updateAgent('agent_lifecycle_02', { status: 'PAUSED', statusReason: 'Audit' });
      const resumedWithReason = await store.updateAgent('agent_lifecycle_02', {
        status: 'ACTIVE',
        statusReason: 'Audit passed successfully',
      });
      expect(resumedWithReason.status).toBe('ACTIVE');
      expect(resumedWithReason.statusReason).toBe('Audit passed successfully');
    });

    it('should terminate an agent and record statusReason', async () => {
      const agent = createTestAgent('agent_lifecycle_03');
      await store.createAgent(agent);

      const terminated = await store.updateAgent('agent_lifecycle_03', {
        status: 'TERMINATED',
        statusReason: 'Project decommissioned',
      });

      expect(terminated.status).toBe('TERMINATED');
      expect(terminated.statusReason).toBe('Project decommissioned');
    });

    it('should reject invalid lifecycle transitions (from TERMINATED or to identical status)', async () => {
      const agent = createTestAgent('agent_lifecycle_04');
      await store.createAgent(agent);

      // Same-state transition (ACTIVE -> ACTIVE)
      await expect(
        store.updateAgent('agent_lifecycle_04', { status: 'ACTIVE' })
      ).rejects.toThrow(InvalidAgentStateError);

      // Terminate
      await store.updateAgent('agent_lifecycle_04', { status: 'TERMINATED' });

      // Attempt to resume from TERMINATED
      await expect(
        store.updateAgent('agent_lifecycle_04', { status: 'ACTIVE' })
      ).rejects.toThrow('Agent is TERMINATED');

      // Attempt to pause from TERMINATED
      await expect(
        store.updateAgent('agent_lifecycle_04', { status: 'PAUSED' })
      ).rejects.toThrow('Agent is TERMINATED');

      // Attempt to re-terminate from TERMINATED
      await expect(
        store.updateAgent('agent_lifecycle_04', { status: 'TERMINATED' })
      ).rejects.toThrow('Agent is TERMINATED');
    });
  });

  describe('8. Listing, Filtering, and Pagination', () => {
    beforeEach(async () => {
      // Seed 4 agents:
      // Agent 1: Owner 1, ACTIVE, createdAt = baseTime + 1000
      await store.createAgent(createTestAgent('agent_seed_0001', validOwner1, baseTime + 1000));

      // Agent 2: Owner 1, PAUSED, createdAt = baseTime + 2000
      const a2 = await store.createAgent(createTestAgent('agent_seed_0002', validOwner1, baseTime + 2000));
      await store.updateAgent(a2.id, { status: 'PAUSED' });

      // Agent 3: Owner 2, ACTIVE, createdAt = baseTime + 3000
      await store.createAgent(createTestAgent('agent_seed_0003', validOwner2, baseTime + 3000));

      // Agent 4: Owner 2, TERMINATED, createdAt = baseTime + 4000
      const a4 = await store.createAgent(createTestAgent('agent_seed_0004', validOwner2, baseTime + 4000));
      await store.updateAgent(a4.id, { status: 'TERMINATED' });
    });

    it('should list all agents sorted deterministically by createdAt ascending', async () => {
      const all = await store.listAgents();
      expect(all).toHaveLength(4);
      expect(all.map((a) => a.id)).toEqual([
        'agent_seed_0001',
        'agent_seed_0002',
        'agent_seed_0003',
        'agent_seed_0004',
      ]);
    });

    it('should filter agents by ownerAddress (case-insensitive checksum matching)', async () => {
      const lowerOwner1 = validOwner1.toLowerCase();
      const owner1Agents = await store.listAgents({ ownerAddress: lowerOwner1 });
      expect(owner1Agents).toHaveLength(2);
      expect(owner1Agents.map((a) => a.id)).toEqual(['agent_seed_0001', 'agent_seed_0002']);

      const owner2Agents = await store.listAgents({ ownerAddress: validOwner2 });
      expect(owner2Agents).toHaveLength(2);
      expect(owner2Agents.map((a) => a.id)).toEqual(['agent_seed_0003', 'agent_seed_0004']);
    });

    it('should filter agents by status', async () => {
      const activeAgents = await store.listAgents({ status: 'ACTIVE' });
      expect(activeAgents).toHaveLength(2);
      expect(activeAgents.map((a) => a.id)).toEqual(['agent_seed_0001', 'agent_seed_0003']);

      const pausedAgents = await store.listAgents({ status: 'PAUSED' });
      expect(pausedAgents).toHaveLength(1);
      expect(pausedAgents[0].id).toBe('agent_seed_0002');

      const terminatedAgents = await store.listAgents({ status: 'TERMINATED' });
      expect(terminatedAgents).toHaveLength(1);
      expect(terminatedAgents[0].id).toBe('agent_seed_0004');
    });

    it('should filter agents by both ownerAddress and status', async () => {
      const matches = await store.listAgents({ ownerAddress: validOwner1, status: 'PAUSED' });
      expect(matches).toHaveLength(1);
      expect(matches[0].id).toBe('agent_seed_0002');

      const emptyMatches = await store.listAgents({ ownerAddress: validOwner2, status: 'PAUSED' });
      expect(emptyMatches).toHaveLength(0);
    });

    it('should paginate results with limit and offset', async () => {
      const page1 = await store.listAgents({ limit: 2, offset: 0 });
      expect(page1).toHaveLength(2);
      expect(page1.map((a) => a.id)).toEqual(['agent_seed_0001', 'agent_seed_0002']);

      const page2 = await store.listAgents({ limit: 2, offset: 2 });
      expect(page2).toHaveLength(2);
      expect(page2.map((a) => a.id)).toEqual(['agent_seed_0003', 'agent_seed_0004']);

      const page3 = await store.listAgents({ limit: 2, offset: 4 });
      expect(page3).toHaveLength(0);
    });

    it('should reject invalid pagination parameters', async () => {
      await expect(store.listAgents({ limit: -1 })).rejects.toThrow(InvalidAgentInputError);
      await expect(store.listAgents({ limit: 1001 })).rejects.toThrow(InvalidAgentInputError);
      await expect(store.listAgents({ limit: 1.5 })).rejects.toThrow(InvalidAgentInputError);
      await expect(store.listAgents({ offset: -5 })).rejects.toThrow(InvalidAgentInputError);
      await expect(store.listAgents({ offset: 2.2 })).rejects.toThrow(InvalidAgentInputError);
    });
  });

  describe('9. Low-level Deletion and Clear', () => {
    it('should delete an agent by ID and return boolean result', async () => {
      const agent = createTestAgent('agent_del_0001');
      await store.createAgent(agent);

      expect(await store.getAgentById('agent_del_0001')).not.toBeNull();
      const deleted = await store.deleteAgent('agent_del_0001');
      expect(deleted).toBe(true);

      expect(await store.getAgentById('agent_del_0001')).toBeNull();

      // Deleting again returns false
      expect(await store.deleteAgent('agent_del_0001')).toBe(false);
    });

    it('should clear all agents from the store', async () => {
      await store.createAgent(createTestAgent('agent_clear_01'));
      await store.createAgent(createTestAgent('agent_clear_02'));

      expect(await store.listAgents()).toHaveLength(2);
      store.clear();
      expect(await store.listAgents()).toHaveLength(0);
    });
  });
});
