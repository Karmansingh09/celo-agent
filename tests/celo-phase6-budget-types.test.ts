import { describe, it, expect } from 'vitest';
import {
  getUtcCalendarWindowId,
  calculateAvailableBudget,
  validateBudgetAccountingInvariant,
  formatBaseUnitsToCusd,
  parseCusdToBaseUnits,
  ReservationStatus,
  AgentBudgetState,
  RECONCILIATION_THRESHOLD_MS,
} from '../src/lib/policy/budget-types';

describe('Phase 6.1: Budget Accounting Domain Types & Invariants', () => {
  describe('RECONCILIATION_THRESHOLD_MS constant', () => {
    it('1. should export RECONCILIATION_THRESHOLD_MS as exactly 300,000 ms (5 minutes)', () => {
      expect(RECONCILIATION_THRESHOLD_MS).toBe(300_000);
    });
  });

  describe('getUtcCalendarWindowId', () => {
    it('2. should generate correct UTC YYYY-MM-DD date string', () => {
      const timestamp = Date.parse('2026-10-03T18:00:00.000Z');
      expect(getUtcCalendarWindowId(timestamp)).toBe('2026-10-03');
    });

    it('3. should strictly respect UTC boundary at 23:59:59.999Z vs 00:00:00.000Z', () => {
      const beforeMidnight = Date.parse('2026-12-31T23:59:59.999Z');
      const afterMidnight = Date.parse('2027-01-01T00:00:00.000Z');

      expect(getUtcCalendarWindowId(beforeMidnight)).toBe('2026-12-31');
      expect(getUtcCalendarWindowId(afterMidnight)).toBe('2027-01-01');
    });

    it('4. should map timestamp 0 to Unix epoch 1970-01-01', () => {
      expect(getUtcCalendarWindowId(0)).toBe('1970-01-01');
    });

    it('5. should default to current time when no timestamp is passed', () => {
      const windowId = getUtcCalendarWindowId();
      expect(windowId).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    it('6. should throw RangeError for NaN, Infinity, -Infinity, and out-of-range timestamps', () => {
      expect(() => getUtcCalendarWindowId(NaN)).toThrow(RangeError);
      expect(() => getUtcCalendarWindowId(Infinity)).toThrow(RangeError);
      expect(() => getUtcCalendarWindowId(-Infinity)).toThrow(RangeError);
      expect(() => getUtcCalendarWindowId(1e17)).toThrow(RangeError);
    });
  });

  describe('Accounting invariant: calculateAvailableBudget & validateBudgetAccountingInvariant', () => {
    const parse = (val: string) => parseCusdToBaseUnits(val)!;

    it('7. should calculate available = dailyLimit - spent - reserved accurately', () => {
      const dailyLimit = parse('1.00'); // 1 cUSD
      const spent = parse('0.40');      // 0.40 cUSD
      const reserved = parse('0.20');   // 0.20 cUSD

      const available = calculateAvailableBudget(dailyLimit, spent, reserved);
      expect(available).toBe(parse('0.40'));
      expect(formatBaseUnitsToCusd(available)).toBe('0.4');
    });

    it('8. should return 0n when encumbrances exactly equal dailyLimit', () => {
      const dailyLimit = parse('0.50');
      const spent = parse('0.30');
      const reserved = parse('0.20');

      const available = calculateAvailableBudget(dailyLimit, spent, reserved);
      expect(available).toBe(0n);
      expect(formatBaseUnitsToCusd(available)).toBe('0');
    });

    it('9. should return 0n (clamped for spendability) if encumbrances exceed dailyLimit', () => {
      const dailyLimit = parse('0.50');
      const spent = parse('0.40');
      const reserved = parse('0.20'); // Total = 0.60 > 0.50

      const available = calculateAvailableBudget(dailyLimit, spent, reserved);
      expect(available).toBe(0n);
    });

    it('10. should validate healthy accounting states via validateBudgetAccountingInvariant', () => {
      const dailyLimit = parse('1.00');
      const spent = parse('0.40');
      const reserved = parse('0.20');

      const validation = validateBudgetAccountingInvariant(dailyLimit, spent, reserved);
      expect(validation.valid).toBe(true);
      expect(validation.error).toBeUndefined();
    });

    it('11. should detect over-encumbered invariant violations via validateBudgetAccountingInvariant', () => {
      const dailyLimit = parse('0.50');
      const spent = parse('0.40');
      const reserved = parse('0.20'); // Total = 0.60 > 0.50

      const validation = validateBudgetAccountingInvariant(dailyLimit, spent, reserved);
      expect(validation.valid).toBe(false);
      expect(validation.error).toContain('Accounting invariant violated');
      expect(validation.error).toContain('exceeds daily limit');
    });

    it('12. should reject negative inputs in validateBudgetAccountingInvariant', () => {
      expect(validateBudgetAccountingInvariant(-1n, 0n, 0n).valid).toBe(false);
      expect(validateBudgetAccountingInvariant(100n, -1n, 0n).valid).toBe(false);
      expect(validateBudgetAccountingInvariant(100n, 0n, -1n).valid).toBe(false);
    });
  });

  describe('Base unit formatting and parsing (zero floats)', () => {
    it('13. should parse decimal strings to 18-decimal base units exact BigInt', () => {
      expect(parseCusdToBaseUnits('0.08')).toBe(80000000000000000n);
      expect(parseCusdToBaseUnits('0.10')).toBe(100000000000000000n);
      expect(parseCusdToBaseUnits('1.00')).toBe(1000000000000000000n);
    });

    it('14. should reject over-precision amounts (> 18 decimal places) without rounding', () => {
      // 19 decimal places
      const overPrecision = '0.0000000000000000001';
      expect(parseCusdToBaseUnits(overPrecision)).toBeNull();
    });

    it('15. should reject negative, zero, and malformed strings', () => {
      expect(parseCusdToBaseUnits('0')).toBeNull();
      expect(parseCusdToBaseUnits('0.00')).toBeNull();
      expect(parseCusdToBaseUnits('-0.05')).toBeNull();
      expect(parseCusdToBaseUnits('abc')).toBeNull();
    });

    it('16. should format base units back to decimal string accurately including smallest unit', () => {
      const amountWei = 80000000000000000n;
      expect(formatBaseUnitsToCusd(amountWei)).toBe('0.08');

      // Smallest 18-decimal unit (1 wei of cUSD)
      expect(formatBaseUnitsToCusd(1n)).toBe('0.000000000000000001');

      // Zero and whole amounts
      expect(formatBaseUnitsToCusd(0n)).toBe('0');
      expect(formatBaseUnitsToCusd(1000000000000000000n)).toBe('1');
    });
  });

  describe('Domain state and lifecycle states', () => {
    it('17. should model all five explicit reservation lifecycle states', () => {
      const states: ReservationStatus[] = [
        'RESERVED',
        'SUBMITTED',
        'COMMITTED',
        'RELEASED',
        'HELD_FOR_RECONCILIATION',
      ];
      expect(states).toHaveLength(5);
    });

    it('18. should construct a valid AgentBudgetState snapshot', () => {
      const state: AgentBudgetState = {
        agentId: 'research-agent-01',
        policyId: 'policy-01',
        windowId: '2026-10-03',
        dailyLimitWei: 1000000000000000000n, // 1.0 cUSD
        dailyLimitCusd: '1.0',
        spentWei: 400000000000000000n,       // 0.4 cUSD
        spentCusd: '0.4',
        reservedWei: 200000000000000000n,    // 0.2 cUSD
        reservedCusd: '0.2',
        availableWei: 400000000000000000n,   // 0.4 cUSD
        availableCusd: '0.4',
        updatedAt: Date.now(),
      };

      expect(state.agentId).toBe('research-agent-01');
      expect(state.availableWei).toBe(
        calculateAvailableBudget(state.dailyLimitWei, state.spentWei, state.reservedWei)
      );
      expect(validateBudgetAccountingInvariant(state.dailyLimitWei, state.spentWei, state.reservedWei).valid).toBe(true);
    });
  });
});
