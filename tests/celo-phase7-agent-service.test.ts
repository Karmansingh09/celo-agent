import { describe, it, expect, beforeEach } from 'vitest';
import {
  AgentService,
  CreateAgentServiceInput,
  UpdateAgentServiceInput,
} from '../src/lib/agent/service';
import { InMemoryAgentStore } from '../src/lib/agent/in-memory-agent-store';
import {
  AgentNotFoundError,
  AgentTerminatedError,
  UnauthorizedAgentError,
  InvalidAgentInputError,
  InvalidAgentStateError,
  isValidAgentId,
} from '../src/lib/agent/types';

describe('Phase 7.3: AgentService', () => {
  let store: InMemoryAgentStore;
  let service: AgentService;
  let currentTime: number;

  const baseTime = Date.parse('2026-10-04T10:00:00.000Z');
  const owner1 = '0x19E7E376E7C213B7E7e7e46cc70A5dD086DAff2A';
  const owner2 = '0x7E5F4552091A69125d5DfCb7b8C2659029395Bdf';
  const validRecipient = '0x19E7E376E7C213B7E7e7e46cc70A5dD086DAff2A';

  const defaultPolicy = {
    maxPerTransaction: '0.10',
    maxPerDay: '0.50',
    allowedRecipients: [validRecipient],
    autoApproveThreshold: '0.05',
    validUntil: baseTime + 86400000,
    policyId: 'policy-test-v1',
  };

  beforeEach(() => {
    currentTime = baseTime;
    store = new InMemoryAgentStore(() => currentTime);
    service = new AgentService(store, () => currentTime);
  });

  describe('1. Agent Creation & ID / Policy Binding', () => {
    it('creates an agent with an auto-generated ID and correctly binds policy agentId', async () => {
      const created = await service.createAgent(owner1, {
        name: 'Auto-ID Agent',
        description: 'Testing auto-generated ID',
        spendingPolicy: defaultPolicy,
      });

      expect(isValidAgentId(created.id)).toBe(true);
      expect(created.name).toBe('Auto-ID Agent');
      expect(created.ownerAddress).toBe(owner1);
      expect(created.status).toBe('ACTIVE');
      expect(created.spendingPolicy.agentId).toBe(created.id);
      expect(created.spendingPolicy.maxPerTransaction).toBe('0.10');
      expect(created.createdAt).toBe(baseTime);
      expect(created.updatedAt).toBe(baseTime);
    });

    it('creates an agent with an explicit valid custom ID', async () => {
      const customId = 'agent_10000001';
      const created = await service.createAgent(owner1, {
        id: customId,
        name: 'Custom-ID Agent',
        spendingPolicy: defaultPolicy,
      });

      expect(created.id).toBe(customId);
      expect(created.spendingPolicy.agentId).toBe(customId);
    });

    it('binds policy when policy explicitly provides matching agentId', async () => {
      const customId = 'agent_10000002';
      const created = await service.createAgent(owner1, {
        id: customId,
        name: 'Matching Policy Agent',
        spendingPolicy: {
          ...defaultPolicy,
          agentId: customId,
        },
      });

      expect(created.id).toBe(customId);
      expect(created.spendingPolicy.agentId).toBe(customId);
    });

    it('rejects policy creation when policy specifies conflicting agentId', async () => {
      await expect(
        service.createAgent(owner1, {
          id: 'agent_10000003',
          name: 'Conflicting Policy Agent',
          spendingPolicy: {
            ...defaultPolicy,
            agentId: 'agent_different_id_99',
          },
        })
      ).rejects.toThrow(InvalidAgentInputError);
    });

    it('rejects creation with malformed spending policy structure', async () => {
      await expect(
        service.createAgent(owner1, {
          name: 'Invalid Policy Agent',
          spendingPolicy: {
            ...defaultPolicy,
            maxPerTransaction: '-1.00',
          },
        })
      ).rejects.toThrow(InvalidAgentInputError);
    });

    it('normalizes ownerAddress and walletAddress to checksummed EVM format', async () => {
      const lowerOwner = owner1.toLowerCase();
      const lowerWallet = owner2.toLowerCase();

      const created = await service.createAgent(lowerOwner, {
        name: 'Normalized Addresses Agent',
        walletAddress: lowerWallet,
        spendingPolicy: defaultPolicy,
      });

      expect(created.ownerAddress).toBe(owner1);
      expect(created.walletAddress).toBe(owner2);
    });

    it('validates and clones metadata during creation', async () => {
      const meta = { env: 'staging', team: 'defi' };
      const created = await service.createAgent(owner1, {
        name: 'Metadata Agent',
        spendingPolicy: defaultPolicy,
        metadata: meta,
      });

      expect(created.metadata).toEqual(meta);

      // Verify caller input mutation does not alter created agent
      meta.env = 'production';
      const retrieved = await service.getAgentById(owner1, created.id);
      expect(retrieved.metadata?.env).toBe('staging');
    });

    it('rejects creation with invalid name (empty, whitespace, or too long)', async () => {
      await expect(
        service.createAgent(owner1, { name: '', spendingPolicy: defaultPolicy })
      ).rejects.toThrow(InvalidAgentInputError);

      await expect(
        service.createAgent(owner1, { name: '   ', spendingPolicy: defaultPolicy })
      ).rejects.toThrow(InvalidAgentInputError);

      await expect(
        service.createAgent(owner1, { name: 'a'.repeat(101), spendingPolicy: defaultPolicy })
      ).rejects.toThrow(InvalidAgentInputError);
    });

    it('rejects creation with malformed input (null, array, non-object)', async () => {
      await expect(
        service.createAgent(owner1, null as unknown as CreateAgentServiceInput)
      ).rejects.toThrow(InvalidAgentInputError);

      await expect(
        service.createAgent(owner1, [] as unknown as CreateAgentServiceInput)
      ).rejects.toThrow(InvalidAgentInputError);

      await expect(
        service.createAgent('invalid_owner', { name: 'Agent', spendingPolicy: defaultPolicy })
      ).rejects.toThrow(InvalidAgentInputError);
    });
  });

  describe('2. Owner-Scoped Agent Retrieval (getAgentById)', () => {
    it('retrieves an agent when authenticatedOwnerAddress matches owner', async () => {
      const created = await service.createAgent(owner1, {
        name: 'Agent Retrieval Test',
        spendingPolicy: defaultPolicy,
      });

      const retrieved = await service.getAgentById(owner1, created.id);
      expect(retrieved.id).toBe(created.id);
      expect(retrieved.name).toBe('Agent Retrieval Test');
    });

    it('rejects retrieval with UnauthorizedAgentError when caller does not own the agent', async () => {
      const created = await service.createAgent(owner1, {
        name: 'Owner 1 Agent',
        spendingPolicy: defaultPolicy,
      });

      await expect(
        service.getAgentById(owner2, created.id)
      ).rejects.toThrow(UnauthorizedAgentError);
    });

    it('throws AgentNotFoundError when retrieving a non-existent agent', async () => {
      await expect(
        service.getAgentById(owner1, 'agent_non_existent')
      ).rejects.toThrow(AgentNotFoundError);
    });

    it('rejects invalid or empty agentId and invalid owner address', async () => {
      await expect(service.getAgentById(owner1, '')).rejects.toThrow(InvalidAgentInputError);
      await expect(service.getAgentById(owner1, '   ')).rejects.toThrow(InvalidAgentInputError);
      await expect(service.getAgentById('not_an_address', 'agent_123')).rejects.toThrow(InvalidAgentInputError);
    });

    it('guarantees reference isolation on retrieved records', async () => {
      const created = await service.createAgent(owner1, {
        name: 'Isolation Agent',
        spendingPolicy: defaultPolicy,
        metadata: { tag: 'initial' },
      });

      const retrieved = await service.getAgentById(owner1, created.id);
      retrieved.name = 'Tampered Local Name';
      retrieved.spendingPolicy.allowedRecipients.push('0x0000000000000000000000000000000000000000');
      retrieved.metadata!.tag = 'hacked';

      const fresh = await service.getAgentById(owner1, created.id);
      expect(fresh.name).toBe('Isolation Agent');
      expect(fresh.spendingPolicy.allowedRecipients).toEqual([validRecipient]);
      expect(fresh.metadata?.tag).toBe('initial');
    });
  });

  describe('3. Owner-Scoped Agent Listing (listAgents)', () => {
    beforeEach(async () => {
      currentTime = baseTime;
      // Create 3 agents for owner1
      await service.createAgent(owner1, { name: 'Agent A1', spendingPolicy: defaultPolicy });
      currentTime = baseTime + 1000;
      const a2 = await service.createAgent(owner1, { name: 'Agent A2', spendingPolicy: defaultPolicy });
      currentTime = baseTime + 2000;
      await service.createAgent(owner1, { name: 'Agent A3', spendingPolicy: defaultPolicy });

      // Pause A2
      currentTime = baseTime + 3000;
      await service.pauseAgent(owner1, a2.id, 'Routine maintenance');

      // Create 1 agent for owner2
      currentTime = baseTime + 4000;
      await service.createAgent(owner2, { name: 'Agent B1', spendingPolicy: defaultPolicy });
    });

    it('returns only agents belonging strictly to the authenticated owner', async () => {
      const owner1Agents = await service.listAgents(owner1);
      expect(owner1Agents).toHaveLength(3);
      expect(owner1Agents.every((a) => a.ownerAddress === owner1)).toBe(true);

      const owner2Agents = await service.listAgents(owner2);
      expect(owner2Agents).toHaveLength(1);
      expect(owner2Agents[0].name).toBe('Agent B1');
      expect(owner2Agents[0].ownerAddress === owner2).toBe(true);
    });

    it('applies lifecycle status filter', async () => {
      const activeAgents = await service.listAgents(owner1, { status: 'ACTIVE' });
      expect(activeAgents).toHaveLength(2);
      expect(activeAgents.map((a) => a.name)).toEqual(['Agent A1', 'Agent A3']);

      const pausedAgents = await service.listAgents(owner1, { status: 'PAUSED' });
      expect(pausedAgents).toHaveLength(1);
      expect(pausedAgents[0].name).toBe('Agent A2');
      expect(pausedAgents[0].statusReason).toBe('Routine maintenance');
    });

    it('applies pagination limit and offset deterministically', async () => {
      const page1 = await service.listAgents(owner1, { limit: 2, offset: 0 });
      expect(page1).toHaveLength(2);
      expect(page1.map((a) => a.name)).toEqual(['Agent A1', 'Agent A2']);

      const page2 = await service.listAgents(owner1, { limit: 2, offset: 2 });
      expect(page2).toHaveLength(1);
      expect(page2[0].name).toBe('Agent A3');
    });

    it('prevents caller from bypassing owner scoping via untyped filter properties', async () => {
      const maliciousFilter = {
        ownerAddress: owner2, // Attacker tries to pass owner2 in filter while authenticating as owner1
      };

      const result = await service.listAgents(owner1, maliciousFilter as any);
      expect(result.every((a) => a.ownerAddress === owner1)).toBe(true);
    });

    it('rejects invalid filter inputs or invalid owner address', async () => {
      await expect(
        service.listAgents('bad_address')
      ).rejects.toThrow(InvalidAgentInputError);

      await expect(
        service.listAgents(owner1, [] as any)
      ).rejects.toThrow(InvalidAgentInputError);

      await expect(
        service.listAgents(owner1, { limit: -1 })
      ).rejects.toThrow(InvalidAgentInputError);
    });
  });

  describe('4. Agent Update & Immutability Enforcement', () => {
    let targetAgentId: string;

    beforeEach(async () => {
      const agent = await service.createAgent(owner1, {
        name: 'Updatable Agent',
        description: 'Original description',
        spendingPolicy: defaultPolicy,
        metadata: { version: '1' },
      });
      targetAgentId = agent.id;
    });

    it('updates permitted mutable fields (name, description, walletAddress, metadata)', async () => {
      currentTime = baseTime + 5000;
      const updated = await service.updateAgent(owner1, targetAgentId, {
        name: 'Renamed Agent',
        description: 'Updated description',
        walletAddress: owner2,
        metadata: { version: '2', env: 'prod' },
      });

      expect(updated.name).toBe('Renamed Agent');
      expect(updated.description).toBe('Updated description');
      expect(updated.walletAddress).toBe(owner2);
      expect(updated.metadata).toEqual({ version: '2', env: 'prod' });
      expect(updated.updatedAt).toBe(baseTime + 5000);
      expect(updated.createdAt).toBe(baseTime);
    });

    it('updates spending policy and automatically binds agentId when omitted in patch', async () => {
      currentTime = baseTime + 6000;
      const updated = await service.updateAgent(owner1, targetAgentId, {
        spendingPolicy: {
          ...defaultPolicy,
          maxPerTransaction: '0.25',
          maxPerDay: '1.00',
        },
      });

      expect(updated.spendingPolicy.agentId).toBe(targetAgentId);
      expect(updated.spendingPolicy.maxPerTransaction).toBe('0.25');
      expect(updated.spendingPolicy.maxPerDay).toBe('1.00');
    });

    it('updates spending policy when matching agentId is provided', async () => {
      currentTime = baseTime + 7000;
      const updated = await service.updateAgent(owner1, targetAgentId, {
        spendingPolicy: {
          ...defaultPolicy,
          agentId: targetAgentId,
          maxPerTransaction: '0.30',
        },
      });

      expect(updated.spendingPolicy.agentId).toBe(targetAgentId);
      expect(updated.spendingPolicy.maxPerTransaction).toBe('0.30');
    });

    it('rejects policy update when conflicting agentId is provided', async () => {
      await expect(
        service.updateAgent(owner1, targetAgentId, {
          spendingPolicy: {
            ...defaultPolicy,
            agentId: 'agent_wrong_id_999',
          },
        })
      ).rejects.toThrow(InvalidAgentInputError);
    });

    it('rejects empty update requests or requests with only undefined values', async () => {
      await expect(
        service.updateAgent(owner1, targetAgentId, {})
      ).rejects.toThrow('Update request cannot be empty');

      await expect(
        service.updateAgent(owner1, targetAgentId, { name: undefined })
      ).rejects.toThrow('Update request cannot be empty');
    });

    it('rejects update attempts containing unknown or immutable fields', async () => {
      await expect(
        service.updateAgent(owner1, targetAgentId, { id: 'agent_new_id' } as any)
      ).rejects.toThrow('Cannot update unknown or immutable field: id');

      await expect(
        service.updateAgent(owner1, targetAgentId, { ownerAddress: owner2 } as any)
      ).rejects.toThrow('Cannot update unknown or immutable field: ownerAddress');

      await expect(
        service.updateAgent(owner1, targetAgentId, { createdAt: 123456 } as any)
      ).rejects.toThrow('Cannot update unknown or immutable field: createdAt');

      await expect(
        service.updateAgent(owner1, targetAgentId, { unknownProp: 'foo' } as any)
      ).rejects.toThrow('Cannot update unknown or immutable field: unknownProp');
    });

    it('rejects update when caller is not the owner (UnauthorizedAgentError)', async () => {
      await expect(
        service.updateAgent(owner2, targetAgentId, { name: 'Hacked Name' })
      ).rejects.toThrow(UnauthorizedAgentError);

      // Verify stored record was not modified
      const original = await service.getAgentById(owner1, targetAgentId);
      expect(original.name).toBe('Updatable Agent');
    });

    it('throws AgentNotFoundError when updating non-existent agent', async () => {
      await expect(
        service.updateAgent(owner1, 'agent_non_existent', { name: 'New Name' })
      ).rejects.toThrow(AgentNotFoundError);
    });

    it('rejects update on terminated agent with AgentTerminatedError', async () => {
      await service.terminateAgent(owner1, targetAgentId, 'Decommissioned');

      await expect(
        service.updateAgent(owner1, targetAgentId, { name: 'Attempted Revive' })
      ).rejects.toThrow(AgentTerminatedError);
    });

    it('guarantees all-or-nothing atomicity: failed updates leave state completely unmodified', async () => {
      await expect(
        service.updateAgent(owner1, targetAgentId, {
          name: 'Partially Prepared Name',
          spendingPolicy: {
            ...defaultPolicy,
            agentId: 'agent_conflicting_id',
          },
        })
      ).rejects.toThrow(InvalidAgentInputError);

      const unchanged = await service.getAgentById(owner1, targetAgentId);
      expect(unchanged.name).toBe('Updatable Agent');
    });
  });

  describe('5. Lifecycle Transitions (pause, resume, terminate)', () => {
    let agentId: string;

    beforeEach(async () => {
      const agent = await service.createAgent(owner1, {
        name: 'Lifecycle Agent',
        spendingPolicy: defaultPolicy,
      });
      agentId = agent.id;
    });

    it('pauses an active agent and records statusReason', async () => {
      currentTime = baseTime + 1000;
      const paused = await service.pauseAgent(owner1, agentId, 'Maintenance pause');

      expect(paused.status).toBe('PAUSED');
      expect(paused.statusReason).toBe('Maintenance pause');
      expect(paused.updatedAt).toBe(baseTime + 1000);
    });

    it('rejects pausing an already paused agent (InvalidAgentStateError)', async () => {
      await service.pauseAgent(owner1, agentId, 'First pause');

      await expect(
        service.pauseAgent(owner1, agentId, 'Second pause')
      ).rejects.toThrow(InvalidAgentStateError);
    });

    it('resumes a paused agent back to ACTIVE and clears previous pause reason when omitted', async () => {
      await service.pauseAgent(owner1, agentId, 'Pause reason');
      currentTime = baseTime + 2000;

      const resumed = await service.resumeAgent(owner1, agentId);
      expect(resumed.status).toBe('ACTIVE');
      expect(resumed.statusReason).toBeUndefined();
      expect(resumed.updatedAt).toBe(baseTime + 2000);
    });

    it('resumes a paused agent and sets a new reason when explicitly provided', async () => {
      await service.pauseAgent(owner1, agentId, 'Pause reason');
      currentTime = baseTime + 3000;

      const resumed = await service.resumeAgent(owner1, agentId, 'Resolved issue');
      expect(resumed.status).toBe('ACTIVE');
      expect(resumed.statusReason).toBe('Resolved issue');
    });

    it('rejects resuming an already ACTIVE agent (InvalidAgentStateError)', async () => {
      await expect(
        service.resumeAgent(owner1, agentId)
      ).rejects.toThrow(InvalidAgentStateError);
    });

    it('terminates an active or paused agent', async () => {
      currentTime = baseTime + 4000;
      const terminated = await service.terminateAgent(owner1, agentId, 'Permanent shutdown');

      expect(terminated.status).toBe('TERMINATED');
      expect(terminated.statusReason).toBe('Permanent shutdown');
      expect(terminated.updatedAt).toBe(baseTime + 4000);
    });

    it('terminates a paused agent successfully', async () => {
      await service.pauseAgent(owner1, agentId);
      currentTime = baseTime + 5000;

      const terminated = await service.terminateAgent(owner1, agentId, 'Terminated from paused');
      expect(terminated.status).toBe('TERMINATED');
      expect(terminated.statusReason).toBe('Terminated from paused');
    });

    it('strictly forbids all transitions from TERMINATED status', async () => {
      await service.terminateAgent(owner1, agentId, 'Final shutdown');

      // Cannot pause
      await expect(
        service.pauseAgent(owner1, agentId)
      ).rejects.toThrow(InvalidAgentStateError);

      // Cannot resume
      await expect(
        service.resumeAgent(owner1, agentId)
      ).rejects.toThrow(InvalidAgentStateError);

      // Cannot re-terminate
      await expect(
        service.terminateAgent(owner1, agentId)
      ).rejects.toThrow(InvalidAgentStateError);
    });

    it('rejects lifecycle operations performed by non-owner (UnauthorizedAgentError)', async () => {
      await expect(
        service.pauseAgent(owner2, agentId, 'Unauthorized pause')
      ).rejects.toThrow(UnauthorizedAgentError);

      await expect(
        service.resumeAgent(owner2, agentId)
      ).rejects.toThrow(UnauthorizedAgentError);

      await expect(
        service.terminateAgent(owner2, agentId)
      ).rejects.toThrow(UnauthorizedAgentError);
    });

    it('validates statusReason parameter and rejects whitespace or oversized strings', async () => {
      await expect(
        service.pauseAgent(owner1, agentId, '')
      ).rejects.toThrow(InvalidAgentInputError);

      await expect(
        service.pauseAgent(owner1, agentId, '   ')
      ).rejects.toThrow(InvalidAgentInputError);

      await expect(
        service.pauseAgent(owner1, agentId, 'x'.repeat(501))
      ).rejects.toThrow(InvalidAgentInputError);

      await expect(
        service.pauseAgent(owner1, agentId, 12345 as any)
      ).rejects.toThrow(InvalidAgentInputError);
    });
  });

  describe('6. Clock & Monotonic Timestamp Guarantees', () => {
    it('rejects unsafe timestamps (<=0, NaN, Infinity) on creation and updates', async () => {
      const unsafeService = new AgentService(store, () => -1);

      await expect(
        unsafeService.createAgent(owner1, { name: 'Bad Clock Agent', spendingPolicy: defaultPolicy })
      ).rejects.toThrow(RangeError);

      const nanService = new AgentService(store, () => NaN);
      await expect(
        nanService.createAgent(owner1, { name: 'NaN Clock Agent', spendingPolicy: defaultPolicy })
      ).rejects.toThrow(RangeError);

      const infService = new AgentService(store, () => Infinity);
      await expect(
        infService.createAgent(owner1, { name: 'Inf Clock Agent', spendingPolicy: defaultPolicy })
      ).rejects.toThrow(RangeError);
    });

    it('preserves updatedAt on repeated clock values without regressing', async () => {
      // Create agent at baseTime
      const agent = await service.createAgent(owner1, {
        name: 'Repeated Clock Agent',
        spendingPolicy: defaultPolicy,
      });

      // Update at exactly the same timestamp (repeated clock)
      const updated = await service.updateAgent(owner1, agent.id, {
        description: 'Updated in same millisecond',
      });

      expect(updated.updatedAt).toBe(baseTime);
      expect(updated.updatedAt).toBeGreaterThanOrEqual(agent.updatedAt);
    });

    it('rejects clock regression (clock moving backward) and leaves state unchanged', async () => {
      const agent = await service.createAgent(owner1, {
        name: 'Regressing Clock Agent',
        spendingPolicy: defaultPolicy,
      });

      // Set clock to an earlier timestamp
      currentTime = baseTime - 5000;

      await expect(
        service.updateAgent(owner1, agent.id, { name: 'New Name' })
      ).rejects.toThrow(RangeError);

      await expect(
        service.pauseAgent(owner1, agent.id)
      ).rejects.toThrow(RangeError);

      await expect(
        service.terminateAgent(owner1, agent.id)
      ).rejects.toThrow(RangeError);

      // Verify agent stored record updatedAt was NOT regressed
      currentTime = baseTime;
      const preserved = await service.getAgentById(owner1, agent.id);
      expect(preserved.updatedAt).toBe(baseTime);
      expect(preserved.name).toBe('Regressing Clock Agent');
      expect(preserved.status).toBe('ACTIVE');
    });
  });
});
