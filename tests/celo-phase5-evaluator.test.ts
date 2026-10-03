import { describe, it, expect } from 'vitest';
import { AgentSpendingPolicy, PolicyPaymentRequest } from '../src/lib/policy/types';
import { evaluatePolicy, parseMonetaryAmountToBigInt } from '../src/lib/policy/evaluator';

describe('Phase 5.2: Policy Evaluation Logic', () => {
  const baseTimestamp = 1750000000000; // Fixed timestamp for deterministic testing

  const standardPolicy: AgentSpendingPolicy = {
    agentId: 'agent-research-01',
    maxPerTransaction: '0.10',
    maxPerDay: '0.50',
    allowedRecipients: [
      '0x19E7E376E7C213B7E7e7e46cc70A5dD086DAff2A',
      '0x7E5F4552091A69125d5DfCb7b8C2659029395Bdf',
    ],
    autoApproveThreshold: '0.05',
    validUntil: baseTimestamp + 3600000, // 1 hour in the future
  };

  const validRecipient = '0x19E7E376E7C213B7E7e7e46cc70A5dD086DAff2A';

  it('1. should return ALLOW for a valid request below or equal to autoApproveThreshold', () => {
    const request: PolicyPaymentRequest = {
      agentId: 'agent-research-01',
      amount: '0.03',
      recipient: validRecipient,
    };

    const result = evaluatePolicy(standardPolicy, request, baseTimestamp);
    expect(result.decision).toBe('ALLOW');
    expect(result.reason).toBe('Amount is within automatic approval threshold');
    expect(result.agentId).toBe('agent-research-01');
  });

  it('2. should return ALLOW when amount exactly equals autoApproveThreshold', () => {
    const request: PolicyPaymentRequest = {
      agentId: 'agent-research-01',
      amount: '0.05',
      recipient: validRecipient,
    };

    const result = evaluatePolicy(standardPolicy, request, baseTimestamp);
    expect(result.decision).toBe('ALLOW');
    expect(result.reason).toBe('Amount is within automatic approval threshold');
  });

  it('3. should return REQUIRE_USER_APPROVAL for amount above autoApproveThreshold but within maxPerTransaction', () => {
    const request: PolicyPaymentRequest = {
      agentId: 'agent-research-01',
      amount: '0.08',
      recipient: validRecipient,
    };

    const result = evaluatePolicy(standardPolicy, request, baseTimestamp);
    expect(result.decision).toBe('REQUIRE_USER_APPROVAL');
    expect(result.reason).toBe('User approval required above automatic approval threshold');
    expect(result.agentId).toBe('agent-research-01');
  });

  it('4. should return DENY when amount exceeds maxPerTransaction', () => {
    const request: PolicyPaymentRequest = {
      agentId: 'agent-research-01',
      amount: '0.12',
      recipient: validRecipient,
    };

    const result = evaluatePolicy(standardPolicy, request, baseTimestamp);
    expect(result.decision).toBe('DENY');
    expect(result.reason).toBe('Amount exceeds per-transaction limit');
  });

  it('5. should return DENY when policy has expired (currentTime > validUntil)', () => {
    const expiredTime = standardPolicy.validUntil + 1000;
    const request: PolicyPaymentRequest = {
      agentId: 'agent-research-01',
      amount: '0.03',
      recipient: validRecipient,
    };

    const result = evaluatePolicy(standardPolicy, request, expiredTime);
    expect(result.decision).toBe('DENY');
    expect(result.reason).toBe('Policy has expired');
  });

  it('6. should return DENY when agentId does not match policy.agentId', () => {
    const request: PolicyPaymentRequest = {
      agentId: 'rogue-agent-99',
      amount: '0.03',
      recipient: validRecipient,
    };

    const result = evaluatePolicy(standardPolicy, request, baseTimestamp);
    expect(result.decision).toBe('DENY');
    expect(result.reason).toBe('Agent identity does not match policy');
  });

  it('7. should return DENY for unauthorized recipient', () => {
    const request: PolicyPaymentRequest = {
      agentId: 'agent-research-01',
      amount: '0.03',
      recipient: '0x0000000000000000000000000000000000000001',
    };

    const result = evaluatePolicy(standardPolicy, request, baseTimestamp);
    expect(result.decision).toBe('DENY');
    expect(result.reason).toBe('Recipient is not authorized');
  });

  it('8. should perform case-insensitive comparison for authorized recipients', () => {
    const mixedCaseRecipient = '0x19e7E376E7c213b7e7E7E46CC70a5DD086daff2a';
    const request: PolicyPaymentRequest = {
      agentId: 'agent-research-01',
      amount: '0.03',
      recipient: mixedCaseRecipient,
    };

    const result = evaluatePolicy(standardPolicy, request, baseTimestamp);
    expect(result.decision).toBe('ALLOW');
    expect(result.reason).toBe('Amount is within automatic approval threshold');
  });

  it('9. should allow any recipient if allowedRecipients is empty array', () => {
    const openPolicy: AgentSpendingPolicy = {
      ...standardPolicy,
      allowedRecipients: [],
    };
    const request: PolicyPaymentRequest = {
      agentId: 'agent-research-01',
      amount: '0.03',
      recipient: '0x9999999999999999999999999999999999999999',
    };

    const result = evaluatePolicy(openPolicy, request, baseTimestamp);
    expect(result.decision).toBe('ALLOW');
  });

  it('10. should return DENY for invalid amount strings (letters / malformed / NaN)', () => {
    const badAmounts = ['abc', 'NaN', 'undefined', '0.0.1', '10,00', '1e5'];

    for (const bad of badAmounts) {
      const request: PolicyPaymentRequest = {
        agentId: 'agent-research-01',
        amount: bad,
        recipient: validRecipient,
      };

      const result = evaluatePolicy(standardPolicy, request, baseTimestamp);
      expect(result.decision).toBe('DENY');
      expect(result.reason).toBe('Invalid payment amount');
    }
  });

  it('11. should return DENY for zero amount ("0" or "0.00")', () => {
    const zeroAmounts = ['0', '0.0', '0.0000'];

    for (const zero of zeroAmounts) {
      const request: PolicyPaymentRequest = {
        agentId: 'agent-research-01',
        amount: zero,
        recipient: validRecipient,
      };

      const result = evaluatePolicy(standardPolicy, request, baseTimestamp);
      expect(result.decision).toBe('DENY');
      expect(result.reason).toBe('Invalid payment amount');
    }
  });

  it('12. should return DENY for negative amounts ("-0.05")', () => {
    const negativeAmounts = ['-0.05', '-1', '-0.001'];

    for (const neg of negativeAmounts) {
      const request: PolicyPaymentRequest = {
        agentId: 'agent-research-01',
        amount: neg,
        recipient: validRecipient,
      };

      const result = evaluatePolicy(standardPolicy, request, baseTimestamp);
      expect(result.decision).toBe('DENY');
      expect(result.reason).toBe('Invalid payment amount');
    }
  });

  it('13. should verify that maxPerDay is NOT enforced in Phase 5.2 evaluator', () => {
    // Standard policy has maxPerDay: "0.50", maxPerTransaction: "0.80"
    const policyWithHigherPerTx: AgentSpendingPolicy = {
      ...standardPolicy,
      maxPerTransaction: '0.80',
      maxPerDay: '0.50',
      autoApproveThreshold: '0.10',
    };

    // Amount 0.60 is > maxPerDay ("0.50"), but <= maxPerTransaction ("0.80")
    // Because daily budget state tracking belongs to Phase 6, Phase 5.2 must NOT block on maxPerDay.
    const request: PolicyPaymentRequest = {
      agentId: 'agent-research-01',
      amount: '0.60',
      recipient: validRecipient,
    };

    const result = evaluatePolicy(policyWithHigherPerTx, request, baseTimestamp);
    // It should trigger REQUIRE_USER_APPROVAL (since 0.60 > 0.10 autoApproveThreshold), not DENY for maxPerDay
    expect(result.decision).toBe('REQUIRE_USER_APPROVAL');
    expect(result.reason).toBe('User approval required above automatic approval threshold');
  });

  it('14. should safely parse decimal amounts to BigInt with zero floating-point math', () => {
    expect(parseMonetaryAmountToBigInt('0.05')).toBe(50000000000000000n);
    expect(parseMonetaryAmountToBigInt('1.0')).toBe(1000000000000000000n);
    expect(parseMonetaryAmountToBigInt('0.000000000000000001')).toBe(1n); // 18 decimals wei precision
    expect(parseMonetaryAmountToBigInt('0')).toBeNull();
    expect(parseMonetaryAmountToBigInt('-0.5')).toBeNull();
    expect(parseMonetaryAmountToBigInt('abc')).toBeNull();
  });
});
