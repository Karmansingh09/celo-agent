import { parseUnits } from 'viem';
import {
  AgentSpendingPolicy,
  PolicyPaymentRequest,
  PolicyEvaluationResult,
} from './types';

/**
 * Standard decimal precision for Celo cUSD (Celo Dollar ERC-20 token).
 * On Celo, cUSD natively uses 18 decimal places.
 * Using 18 decimals allows exact integer/fixed-point BigInt comparisons
 * without floating-point rounding errors or premature multi-token assumptions.
 */
export const CUSD_DECIMALS = 18;

/**
 * Safely parses a cUSD decimal string into an 18-decimal fixed-point BigInt without floating-point math.
 * Returns null if the value is malformed, negative, zero, or invalid.
 */
export function parseMonetaryAmountToBigInt(amount: unknown, decimals = CUSD_DECIMALS): bigint | null {
  if (typeof amount !== 'string') {
    return null;
  }

  const trimmed = amount.trim();
  // Strictly enforce positive decimal strings (digits optionally followed by .digits)
  if (!/^\d+(\.\d+)?$/.test(trimmed)) {
    return null;
  }

  try {
    const parsed = parseUnits(trimmed, decimals);
    // Must be strictly positive (> 0)
    if (parsed <= 0n) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

/**
 * Evaluates a payment request against an AgentSpendingPolicy.
 * 
 * This is a pure evaluator:
 * - Deterministic given the inputs and currentTime
 * - Zero floating-point arithmetic (uses 18-decimal fixed-point BigInt)
 * - Independent of database, network RPCs, and UI components
 * 
 * NOTE: As per Phase 5.2 specification, maxPerDay is not evaluated here,
 * as daily spend state tracking and atomic budget accounting belong to Phase 6.
 *
 * @param policy The active spending policy
 * @param request The payment request to evaluate
 * @param currentTime Injected timestamp (Unix ms) for deterministic testing (defaults to Date.now())
 * @returns PolicyEvaluationResult containing decision and deterministic reason
 */
export function evaluatePolicy(
  policy: AgentSpendingPolicy,
  request: PolicyPaymentRequest,
  currentTime: number = Date.now()
): PolicyEvaluationResult {
  const evaluatedAt = currentTime;
  const agentId = request.agentId;

  // 1. Policy Validity Checks
  // Check policy expiration
  if (currentTime > policy.validUntil) {
    return {
      decision: 'DENY',
      reason: 'Policy has expired',
      agentId,
      evaluatedAt,
    };
  }

  // Check agent identity match
  if (!request.agentId || request.agentId !== policy.agentId) {
    return {
      decision: 'DENY',
      reason: 'Agent identity does not match policy',
      agentId,
      evaluatedAt,
    };
  }

  // 2. Amount Validity Check
  const requestedAmountWei = parseMonetaryAmountToBigInt(request.amount);
  if (requestedAmountWei === null) {
    return {
      decision: 'DENY',
      reason: 'Invalid payment amount',
      agentId,
      evaluatedAt,
    };
  }

  // 3. Recipient Control (Allowlist)
  if (Array.isArray(policy.allowedRecipients) && policy.allowedRecipients.length > 0) {
    const requestedRecipient = (request.recipient || '').trim().toLowerCase();
    const isAuthorized = policy.allowedRecipients.some(
      (authorizedAddr) => authorizedAddr.trim().toLowerCase() === requestedRecipient
    );

    if (!isAuthorized) {
      return {
        decision: 'DENY',
        reason: 'Recipient is not authorized',
        agentId,
        evaluatedAt,
      };
    }
  }

  // 4. Per-Transaction Limit Check
  const maxPerTxWei = parseMonetaryAmountToBigInt(policy.maxPerTransaction);
  if (maxPerTxWei !== null && requestedAmountWei > maxPerTxWei) {
    return {
      decision: 'DENY',
      reason: 'Amount exceeds per-transaction limit',
      agentId,
      evaluatedAt,
    };
  }

  // 5. Auto-Approval Threshold Check
  const autoApproveWei = parseMonetaryAmountToBigInt(policy.autoApproveThreshold);
  if (autoApproveWei !== null && requestedAmountWei > autoApproveWei) {
    return {
      decision: 'REQUIRE_USER_APPROVAL',
      reason: 'User approval required above automatic approval threshold',
      agentId,
      evaluatedAt,
    };
  }

  // 6. Within Limits and Auto-Approve Threshold -> ALLOW
  return {
    decision: 'ALLOW',
    reason: 'Amount is within automatic approval threshold',
    agentId,
    evaluatedAt,
  };
}
