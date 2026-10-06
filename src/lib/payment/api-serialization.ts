import { PaymentOrchestrationResult } from './types';
import { BudgetReservation, AgentBudgetState } from '../policy/budget-types';

/**
 * Serializes a BudgetReservation into a plain JSON-safe object,
 * converting BigInt base units (amountWei) to string.
 */
export function serializeReservation(res?: BudgetReservation): Record<string, unknown> | undefined {
  if (!res) return undefined;
  return {
    ...res,
    amountWei: res.amountWei.toString(),
  };
}

/**
 * Serializes an AgentBudgetState into a plain JSON-safe object,
 * converting BigInt fields to strings.
 */
export function serializeBudgetState(state?: AgentBudgetState): Record<string, unknown> | undefined {
  if (!state) return undefined;
  return {
    ...state,
    dailyLimitWei: state.dailyLimitWei.toString(),
    spentWei: state.spentWei.toString(),
    reservedWei: state.reservedWei.toString(),
    availableWei: state.availableWei.toString(),
  };
}

/**
 * Serializes a PaymentOrchestrationResult into a plain JSON-safe object,
 * ensuring no BigInt values trigger JSON.stringify serialization errors.
 */
export function serializePaymentResult(result: PaymentOrchestrationResult): Record<string, unknown> {
  return {
    ...result,
    reservation: serializeReservation(result.reservation),
    budgetState: serializeBudgetState(result.budgetState),
  };
}
