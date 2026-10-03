import { describe, it, expect } from 'vitest';
import {
  Agent,
  AgentStatus,
  CreateAgentInput,
  UpdateAgentInput,
  CreateAgentSpendingPolicyInput,
  generateAgentId,
  isValidAgentId,
  normalizeOwnerAddress,
  assertValidStateTransition,
  validateCreateAgentInput,
  validateUpdateAgentInput,
  resolveAndBindAgentPolicy,
  validateAgentMetadata,
  MAX_METADATA_KEYS,
  MAX_METADATA_KEY_LENGTH,
  MAX_METADATA_VALUE_LENGTH,
  AgentNotFoundError,
  AgentAlreadyExistsError,
  AgentPausedError,
  AgentTerminatedError,
  UnauthorizedAgentError,
  InvalidAgentStateError,
  InvalidAgentInputError,
} from '../src/lib/agent/types';
import { AgentSpendingPolicy } from '../src/lib/policy/types';

describe('Phase 7.1: Agent Domain Model & Lifecycle Types', () => {
  const validOwner = '0x19E7E376E7C213B7E7e7e46cc70A5dD086DAff2A';
  const validRecipient = '0x7E5F4552091A69125d5DfCb7b8C2659029395Bdf';

  const createValidPolicy = (agentId: string): AgentSpendingPolicy => ({
    agentId,
    maxPerTransaction: '0.10',
    maxPerDay: '0.50',
    allowedRecipients: [validRecipient],
    autoApproveThreshold: '0.05',
    validUntil: Date.now() + 86400000,
  });

  describe('Agent ID Generation and Validation', () => {
    it('should generate valid, formatted, and unique agent IDs', () => {
      const id1 = generateAgentId();
      const id2 = generateAgentId();

      expect(id1).toMatch(/^agent_[a-zA-Z0-9_-]{8,64}$/);
      expect(id2).toMatch(/^agent_[a-zA-Z0-9_-]{8,64}$/);
      expect(id1).not.toBe(id2);
      expect(isValidAgentId(id1)).toBe(true);
      expect(isValidAgentId(id2)).toBe(true);
    });

    it('should handle fractional timestamps by flooring before base-36 conversion', () => {
      const fractionalTime = 1740000000123.789;
      const id = generateAgentId(fractionalTime);

      expect(id).toMatch(/^agent_[a-zA-Z0-9_-]{8,64}$/);
      expect(isValidAgentId(id)).toBe(true);
      // Floor check: should not contain any decimal dot
      expect(id).not.toContain('.');
    });

    it('should handle zero timestamp (Unix epoch)', () => {
      const id = generateAgentId(0);
      expect(id).toMatch(/^agent_[a-zA-Z0-9_-]{8,64}$/);
      expect(isValidAgentId(id)).toBe(true);
      expect(id.startsWith('agent_0_')).toBe(true);
    });

    it('should handle large future timestamps', () => {
      const largeTime = Date.parse('2100-01-01T00:00:00.000Z'); // 4102444800000
      const id = generateAgentId(largeTime);
      expect(id).toMatch(/^agent_[a-zA-Z0-9_-]{8,64}$/);
      expect(isValidAgentId(id)).toBe(true);
    });

    it('should reject invalid non-finite timestamp numbers', () => {
      expect(() => generateAgentId(NaN)).toThrow(RangeError);
      expect(() => generateAgentId(Infinity)).toThrow(RangeError);
      expect(() => generateAgentId(-Infinity)).toThrow(RangeError);
      expect(() => generateAgentId('12345' as unknown as number)).toThrow(RangeError);
    });

    it('should validate agent IDs correctly', () => {
      expect(isValidAgentId('agent_12345678')).toBe(true);
      expect(isValidAgentId('agent_m7k3p1_a9f8b2c4')).toBe(true);
      expect(isValidAgentId('agent_custom-worker-01')).toBe(true);

      // Invalid formats
      expect(isValidAgentId('')).toBe(false);
      expect(isValidAgentId('12345')).toBe(false);
      expect(isValidAgentId('user_12345678')).toBe(false);
      expect(isValidAgentId('agent_')).toBe(false);
      expect(isValidAgentId('agent_short')).toBe(false); // < 8 suffix chars
      expect(isValidAgentId(null)).toBe(false);
      expect(isValidAgentId(undefined)).toBe(false);
      expect(isValidAgentId(12345)).toBe(false);
      expect(isValidAgentId('agent_has.dot_123456')).toBe(false); // No dots allowed
    });
  });

  describe('Address Normalization', () => {
    it('should normalize and checksum valid EVM addresses', () => {
      const lower = '0x19e7e376e7c213b7e7e7e46cc70a5dd086daff2a';
      const normalized = normalizeOwnerAddress(lower);
      expect(normalized).toBe(validOwner);
    });

    it('should reject invalid or non-EVM addresses', () => {
      expect(() => normalizeOwnerAddress('')).toThrow(InvalidAgentInputError);
      expect(() => normalizeOwnerAddress('not-an-address')).toThrow(InvalidAgentInputError);
      expect(() => normalizeOwnerAddress('0x1234')).toThrow(InvalidAgentInputError);
      expect(() => normalizeOwnerAddress(12345)).toThrow(InvalidAgentInputError);
    });
  });

  describe('Lifecycle State Transitions', () => {
    it('should allow valid lifecycle transitions', () => {
      expect(() => assertValidStateTransition('ACTIVE', 'PAUSED')).not.toThrow();
      expect(() => assertValidStateTransition('PAUSED', 'ACTIVE')).not.toThrow();
      expect(() => assertValidStateTransition('ACTIVE', 'TERMINATED')).not.toThrow();
      expect(() => assertValidStateTransition('PAUSED', 'TERMINATED')).not.toThrow();
    });

    it('should reject transitions from terminal state (TERMINATED)', () => {
      expect(() => assertValidStateTransition('TERMINATED', 'ACTIVE')).toThrow(InvalidAgentStateError);
      expect(() => assertValidStateTransition('TERMINATED', 'PAUSED')).toThrow(InvalidAgentStateError);
      expect(() => assertValidStateTransition('TERMINATED', 'TERMINATED')).toThrow(InvalidAgentStateError);
    });

    it('should reject transitions to identical status', () => {
      expect(() => assertValidStateTransition('ACTIVE', 'ACTIVE')).toThrow(InvalidAgentStateError);
      expect(() => assertValidStateTransition('PAUSED', 'PAUSED')).toThrow(InvalidAgentStateError);
    });
  });

  describe('Policy Binding: resolveAndBindAgentPolicy', () => {
    const resolvedId = 'agent_resolved_001';

    it('should bind agentId when omitted in policy input without mutating caller object', () => {
      const policyInput: CreateAgentSpendingPolicyInput = {
        maxPerTransaction: '0.10',
        maxPerDay: '0.50',
        allowedRecipients: [validRecipient],
        autoApproveThreshold: '0.05',
        validUntil: Date.now() + 86400000,
        policyId: 'policy-v1-custom',
      };

      const bound = resolveAndBindAgentPolicy(policyInput, resolvedId);

      expect(bound.agentId).toBe(resolvedId);
      expect(bound.maxPerTransaction).toBe('0.10');
      expect(bound.policyId).toBe('policy-v1-custom');
      // Ensure caller object was NOT mutated
      expect(policyInput.agentId).toBeUndefined();
    });

    it('should accept matching agentId supplied in policy input', () => {
      const policyInput: CreateAgentSpendingPolicyInput = {
        agentId: resolvedId,
        maxPerTransaction: '0.10',
        maxPerDay: '0.50',
        allowedRecipients: [validRecipient],
        autoApproveThreshold: '0.05',
        validUntil: Date.now() + 86400000,
      };

      const bound = resolveAndBindAgentPolicy(policyInput, resolvedId);
      expect(bound.agentId).toBe(resolvedId);
    });

    it('should reject conflicting agentId supplied in policy input', () => {
      const policyInput: CreateAgentSpendingPolicyInput = {
        agentId: 'agent_other_conflict',
        maxPerTransaction: '0.10',
        maxPerDay: '0.50',
        allowedRecipients: [validRecipient],
        autoApproveThreshold: '0.05',
        validUntil: Date.now() + 86400000,
      };

      expect(() => resolveAndBindAgentPolicy(policyInput, resolvedId)).toThrow(
        'conflicts with resolved agent ID'
      );
    });

    it('should reject invalid or non-object policy input', () => {
      expect(() => resolveAndBindAgentPolicy(null as unknown as CreateAgentSpendingPolicyInput, resolvedId)).toThrow(
        InvalidAgentInputError
      );
      expect(() => resolveAndBindAgentPolicy([] as unknown as CreateAgentSpendingPolicyInput, resolvedId)).toThrow(
        InvalidAgentInputError
      );
      expect(() => resolveAndBindAgentPolicy('string' as unknown as CreateAgentSpendingPolicyInput, resolvedId)).toThrow(
        InvalidAgentInputError
      );
    });
  });

  describe('Metadata Validation: validateAgentMetadata', () => {
    it('should accept valid plain key-value string metadata', () => {
      const valid = {
        department: 'AI Research',
        version: '1.2.0',
        region: 'us-west',
      };
      expect(() => validateAgentMetadata(valid)).not.toThrow();
    });

    it('should reject non-plain object values (arrays, primitives, null)', () => {
      expect(() => validateAgentMetadata(null)).toThrow(InvalidAgentInputError);
      expect(() => validateAgentMetadata(['item'])).toThrow(InvalidAgentInputError);
      expect(() => validateAgentMetadata('string')).toThrow(InvalidAgentInputError);
      expect(() => validateAgentMetadata(123)).toThrow(InvalidAgentInputError);
    });

    it('should reject non-string metadata values', () => {
      expect(() => validateAgentMetadata({ count: 5 as unknown as string })).toThrow(InvalidAgentInputError);
      expect(() => validateAgentMetadata({ active: true as unknown as string })).toThrow(InvalidAgentInputError);
      expect(() => validateAgentMetadata({ nested: {} as unknown as string })).toThrow(InvalidAgentInputError);
      expect(() => validateAgentMetadata({ list: [] as unknown as string })).toThrow(InvalidAgentInputError);
      expect(() => validateAgentMetadata({ emptyVal: null as unknown as string })).toThrow(InvalidAgentInputError);
    });

    it('should reject empty or overly long metadata keys', () => {
      expect(() => validateAgentMetadata({ '': 'val' })).toThrow(InvalidAgentInputError);
      expect(() => validateAgentMetadata({ '   ': 'val' })).toThrow(InvalidAgentInputError);
      const longKey = 'k'.repeat(MAX_METADATA_KEY_LENGTH + 1);
      expect(() => validateAgentMetadata({ [longKey]: 'val' })).toThrow(InvalidAgentInputError);
    });

    it('should reject overly long metadata values', () => {
      const longValue = 'v'.repeat(MAX_METADATA_VALUE_LENGTH + 1);
      expect(() => validateAgentMetadata({ key1: longValue })).toThrow(InvalidAgentInputError);
    });

    it('should reject metadata exceeding maximum key limit', () => {
      const tooManyKeys: Record<string, string> = {};
      for (let i = 0; i <= MAX_METADATA_KEYS; i++) {
        tooManyKeys[`key_${i}`] = `value_${i}`;
      }
      expect(() => validateAgentMetadata(tooManyKeys)).toThrow(
        `Metadata cannot contain more than ${MAX_METADATA_KEYS} keys`
      );
    });
  });

  describe('validateCreateAgentInput', () => {
    it('should accept valid agent creation parameters and return bound policy', () => {
      const agentId = 'agent_12345678_worker';
      const input: CreateAgentInput = {
        name: 'Research Worker',
        description: 'Performs autonomous research',
        ownerAddress: validOwner,
        spendingPolicy: {
          maxPerTransaction: '0.10',
          maxPerDay: '0.50',
          allowedRecipients: [validRecipient],
          autoApproveThreshold: '0.05',
          validUntil: Date.now() + 86400000,
        },
        metadata: { department: 'AI Lab' },
      };

      const boundPolicy = validateCreateAgentInput(input, agentId);
      expect(boundPolicy.agentId).toBe(agentId);
      expect(boundPolicy.maxPerTransaction).toBe('0.10');
    });

    it('should reject invalid top-level input shapes (null, array, primitive)', () => {
      expect(() => validateCreateAgentInput(null as unknown as CreateAgentInput, 'agent_12345678')).toThrow(
        InvalidAgentInputError
      );
      expect(() => validateCreateAgentInput([] as unknown as CreateAgentInput, 'agent_12345678')).toThrow(
        InvalidAgentInputError
      );
      expect(() => validateCreateAgentInput('primitive' as unknown as CreateAgentInput, 'agent_12345678')).toThrow(
        InvalidAgentInputError
      );
    });

    it('should reject invalid agent IDs', () => {
      const input: CreateAgentInput = {
        name: 'Agent',
        ownerAddress: validOwner,
        spendingPolicy: createValidPolicy('bad'),
      };
      expect(() => validateCreateAgentInput(input, 'bad')).toThrow(InvalidAgentInputError);
    });

    it('should reject empty or overly long names', () => {
      const agentId = 'agent_12345678_worker';
      expect(() =>
        validateCreateAgentInput(
          { name: '', ownerAddress: validOwner, spendingPolicy: createValidPolicy(agentId) },
          agentId
        )
      ).toThrow(InvalidAgentInputError);

      expect(() =>
        validateCreateAgentInput(
          { name: '   ', ownerAddress: validOwner, spendingPolicy: createValidPolicy(agentId) },
          agentId
        )
      ).toThrow(InvalidAgentInputError);

      expect(() =>
        validateCreateAgentInput(
          { name: 'a'.repeat(101), ownerAddress: validOwner, spendingPolicy: createValidPolicy(agentId) },
          agentId
        )
      ).toThrow(InvalidAgentInputError);
    });

    it('should reject overly long description', () => {
      const agentId = 'agent_12345678_worker';
      expect(() =>
        validateCreateAgentInput(
          {
            name: 'Agent',
            description: 'x'.repeat(1001),
            ownerAddress: validOwner,
            spendingPolicy: createValidPolicy(agentId),
          },
          agentId
        )
      ).toThrow(InvalidAgentInputError);
    });

    it('should reject invalid ownerAddress', () => {
      const agentId = 'agent_12345678_worker';
      expect(() =>
        validateCreateAgentInput(
          { name: 'Agent', ownerAddress: '0xinvalid', spendingPolicy: createValidPolicy(agentId) },
          agentId
        )
      ).toThrow(InvalidAgentInputError);
    });

    it('should reject invalid walletAddress if provided', () => {
      const agentId = 'agent_12345678_worker';
      expect(() =>
        validateCreateAgentInput(
          {
            name: 'Agent',
            ownerAddress: validOwner,
            walletAddress: 'not-an-evm-address',
            spendingPolicy: createValidPolicy(agentId),
          },
          agentId
        )
      ).toThrow(InvalidAgentInputError);
    });

    it('should reject invalid metadata if provided', () => {
      const agentId = 'agent_12345678_worker';
      expect(() =>
        validateCreateAgentInput(
          {
            name: 'Agent',
            ownerAddress: validOwner,
            spendingPolicy: createValidPolicy(agentId),
            metadata: { count: 123 as unknown as string },
          },
          agentId
        )
      ).toThrow(InvalidAgentInputError);
    });

    it('should reject missing or malformed spending policy', () => {
      const agentId = 'agent_12345678_worker';
      expect(() =>
        validateCreateAgentInput(
          { name: 'Agent', ownerAddress: validOwner, spendingPolicy: null as unknown as AgentSpendingPolicy },
          agentId
        )
      ).toThrow(InvalidAgentInputError);

      expect(() =>
        validateCreateAgentInput(
          {
            name: 'Agent',
            ownerAddress: validOwner,
            spendingPolicy: { ...createValidPolicy(agentId), maxPerTransaction: '-0.10' },
          },
          agentId
        )
      ).toThrow(InvalidAgentInputError);
    });
  });

  describe('validateUpdateAgentInput', () => {
    const agentId = 'agent_12345678_worker';

    it('should accept valid partial updates', () => {
      expect(() => validateUpdateAgentInput({ name: 'New Name' }, agentId)).not.toThrow();
      expect(() => validateUpdateAgentInput({ description: 'New description' }, agentId)).not.toThrow();
      expect(() =>
        validateUpdateAgentInput({ metadata: { version: '2.0.0' } }, agentId)
      ).not.toThrow();
      expect(() =>
        validateUpdateAgentInput({ spendingPolicy: createValidPolicy(agentId) }, agentId)
      ).not.toThrow();
    });

    it('should reject invalid top-level update shapes (null, array, primitive)', () => {
      expect(() => validateUpdateAgentInput(null as unknown as UpdateAgentInput, agentId)).toThrow(
        InvalidAgentInputError
      );
      expect(() => validateUpdateAgentInput([] as unknown as UpdateAgentInput, agentId)).toThrow(
        InvalidAgentInputError
      );
      expect(() => validateUpdateAgentInput('string' as unknown as UpdateAgentInput, agentId)).toThrow(
        InvalidAgentInputError
      );
    });

    it('should reject invalid update fields', () => {
      expect(() => validateUpdateAgentInput({ name: '' }, agentId)).toThrow(InvalidAgentInputError);
      expect(() => validateUpdateAgentInput({ description: 'y'.repeat(1001) }, agentId)).toThrow(
        InvalidAgentInputError
      );
      expect(() => validateUpdateAgentInput({ walletAddress: '0xabc' }, agentId)).toThrow(
        InvalidAgentInputError
      );
      expect(() => validateUpdateAgentInput({ metadata: { bad: 123 as unknown as string } }, agentId)).toThrow(
        InvalidAgentInputError
      );
      expect(() =>
        validateUpdateAgentInput(
          { spendingPolicy: createValidPolicy('different-agent-id-1234') },
          agentId
        )
      ).toThrow('does not match agent ID');
    });
  });

  describe('Domain Error Classes', () => {
    it('should instantiate error classes with correct names, messages, and properties', () => {
      const notFound = new AgentNotFoundError('agent_1');
      expect(notFound.name).toBe('AgentNotFoundError');
      expect(notFound.agentId).toBe('agent_1');

      const exists = new AgentAlreadyExistsError('agent_1');
      expect(exists.name).toBe('AgentAlreadyExistsError');

      const paused = new AgentPausedError('agent_1', 'Scheduled maintenance');
      expect(paused.name).toBe('AgentPausedError');
      expect(paused.message).toContain('Scheduled maintenance');

      const terminated = new AgentTerminatedError('agent_1', 'Budget exhausted');
      expect(terminated.name).toBe('AgentTerminatedError');
      expect(terminated.message).toContain('Budget exhausted');

      const unauthorized = new UnauthorizedAgentError('agent_1', '0x123');
      expect(unauthorized.name).toBe('UnauthorizedAgentError');
      expect(unauthorized.caller).toBe('0x123');

      const stateErr = new InvalidAgentStateError('ACTIVE', 'ACTIVE');
      expect(stateErr.name).toBe('InvalidAgentStateError');

      const inputErr = new InvalidAgentInputError('Bad name');
      expect(inputErr.name).toBe('InvalidAgentInputError');
    });
  });
});
