import { describe, it, expect } from 'vitest';
import {
  AgentSpendingPolicy,
  PolicyDecision,
  PolicyEvaluationResult,
  validatePolicyStructure,
} from '../src/lib/policy/types';

describe('Phase 5.1: Policy Data Model & Structure Validation', () => {
  const validPolicy: AgentSpendingPolicy = {
    agentId: 'research-agent-01',
    maxPerTransaction: '0.10',
    maxPerDay: '0.50',
    allowedRecipients: [
      '0x19E7E376E7C213B7E7e7e46cc70A5dD086DAff2A',
      '0x7E5F4552091A69125d5DfCb7b8C2659029395Bdf',
    ],
    autoApproveThreshold: '0.05',
    validUntil: Date.now() + 86400000, // 24h from now (Unix ms timestamp)
  };

  it('1. should validate a correctly structured AgentSpendingPolicy with cUSD values and numeric validUntil', () => {
    const result = validatePolicyStructure(validPolicy);
    expect(result.valid).toBe(true);
    expect(result.error).toBeUndefined();
  });

  it('2. should reject non-object or null policy inputs', () => {
    expect(validatePolicyStructure(null).valid).toBe(false);
    expect(validatePolicyStructure(undefined).valid).toBe(false);
    expect(validatePolicyStructure('string').valid).toBe(false);
  });

  it('3. should reject policy with missing or empty agentId', () => {
    const invalid = { ...validPolicy, agentId: '' };
    const res = validatePolicyStructure(invalid);
    expect(res.valid).toBe(false);
    expect(res.error).toContain('agentId');
  });

  it('4. should reject invalid maxPerTransaction decimal strings', () => {
    const invalid = { ...validPolicy, maxPerTransaction: 'invalid' };
    const res = validatePolicyStructure(invalid);
    expect(res.valid).toBe(false);
    expect(res.error).toContain('maxPerTransaction');
  });

  it('5. should reject invalid maxPerDay decimal strings', () => {
    const invalid = { ...validPolicy, maxPerDay: 'abc' };
    const res = validatePolicyStructure(invalid);
    expect(res.valid).toBe(false);
    expect(res.error).toContain('maxPerDay');
  });

  it('6. should reject invalid autoApproveThreshold strings', () => {
    const invalid = { ...validPolicy, autoApproveThreshold: '-0.05' };
    const res = validatePolicyStructure(invalid);
    expect(res.valid).toBe(false);
    expect(res.error).toContain('autoApproveThreshold');
  });

  it('7. should reject allowedRecipients containing malformed EVM addresses', () => {
    const invalid = {
      ...validPolicy,
      allowedRecipients: ['0x19E7E376E7C213B7E7e7e46cc70A5dD086DAff2A', 'not-an-address'],
    };
    const res = validatePolicyStructure(invalid);
    expect(res.valid).toBe(false);
    expect(res.error).toContain('allowedRecipients');
  });

  it('8. should reject non-numeric or non-positive validUntil timestamps', () => {
    const invalidTimestamp = { ...validPolicy, validUntil: -500 };
    const resTimestamp = validatePolicyStructure(invalidTimestamp);
    expect(resTimestamp.valid).toBe(false);
    expect(resTimestamp.error).toContain('validUntil');

    const invalidType = { ...validPolicy, validUntil: '2026-12-31' };
    const resType = validatePolicyStructure(invalidType);
    expect(resType.valid).toBe(false);
    expect(resType.error).toContain('validUntil');
  });

  it('9. should correctly model PolicyDecision states ALLOW, REQUIRE_USER_APPROVAL, and DENY', () => {
    const allowState: PolicyDecision = 'ALLOW';
    const requireApprovalState: PolicyDecision = 'REQUIRE_USER_APPROVAL';
    const denyState: PolicyDecision = 'DENY';

    expect(allowState).toBe('ALLOW');
    expect(requireApprovalState).toBe('REQUIRE_USER_APPROVAL');
    expect(denyState).toBe('DENY');
  });

  it('10. should construct a valid PolicyEvaluationResult payload with cUSD remaining budget', () => {
    const evalResult: PolicyEvaluationResult = {
      decision: 'ALLOW',
      reason: 'Within policy transaction limit and daily budget',
      remainingDailyBudget: '0.45',
      agentId: 'research-agent-01',
      evaluatedAt: Date.now(),
    };

    expect(evalResult.decision).toBe('ALLOW');
    expect(evalResult.reason).toContain('Within policy');
    expect(evalResult.remainingDailyBudget).toBe('0.45');
    expect(evalResult.evaluatedAt).toBeGreaterThan(0);
  });
});
