import { parseUnits } from 'viem';

/**
 * Phase 5.1: Policy Data Model
 * 
 * Defines the core TypeScript types, interfaces, and validation helpers
 * for CeloAgent spending policies and evaluation decision states.
 * 
 * Initial monetary asset focus is cUSD (Celo Dollar) stablecoin values,
 * represented as arbitrary-precision decimal strings (e.g., "0.10").
 */

/**
 * Decision states for policy evaluation.
 * - ALLOW: Request is within policy boundaries and automatic approval threshold.
 * - REQUIRE_USER_APPROVAL: Request is within per-transaction & daily limits but exceeds auto-approval threshold.
 * - DENY: Request violates spending limits, recipient restrictions, or policy expiration.
 */
export type PolicyDecision = 'ALLOW' | 'REQUIRE_USER_APPROVAL' | 'DENY';

/** Maximum cUSD fractional precision supported by the policy and budget layers. */
export const MAX_CUSD_DECIMAL_PLACES = 18;

/**
 * Definition of an Agent Spending Policy.
 * Establishes the financial boundaries and recipient permissions for an autonomous AI agent.
 */
export interface AgentSpendingPolicy {
  /** Unique identifier for the AI agent */
  agentId: string;
  /** Maximum cUSD allowed for a single transaction (decimal string e.g., "0.10") */
  maxPerTransaction: string;
  /** Maximum total cUSD allowed per day/window (decimal string e.g., "0.50") */
  maxPerDay: string;
  /**
   * List of authorized recipient EVM addresses (0x... checksummed strings).
   * An empty list intentionally means that any valid recipient is permitted;
   * a non-empty list is an explicit allowlist.
   */
  allowedRecipients: string[];
  /** Amount threshold in cUSD up to which payments are auto-approved without user prompt (decimal string e.g., "0.05") */
  autoApproveThreshold: string;
  /** Policy expiration timestamp (Unix time in milliseconds e.g., 1740000000000) */
  validUntil: number;
}

/**
 * Payment request submitted for policy evaluation.
 */
export interface PolicyPaymentRequest {
  /** Unique identifier of the agent requesting the payment */
  agentId: string;
  /** Requested payment amount in cUSD (decimal string e.g., "0.03") */
  amount: string;
  /** Recipient EVM address (0x...) */
  recipient: string;
}

/**
 * Structured evaluation result returned by the Policy Engine.
 */
export interface PolicyEvaluationResult {
  /** Policy decision outcome: ALLOW | REQUIRE_USER_APPROVAL | DENY */
  decision: PolicyDecision;
  /** Human-readable explanation for the decision (displayed in dashboard/logs) */
  reason: string;
  /** Remaining daily budget in cUSD after evaluation (if allowed or pending approval) */
  remainingDailyBudget?: string;
  /** ID of the agent evaluated */
  agentId?: string;
  /** Timestamp when the evaluation occurred (Unix ms) */
  evaluatedAt: number;
}

/**
 * Validates a strictly positive, fixed-point decimal amount for cUSD policy fields.
 * Values must contain no exponent/sign notation and no more than 18 fractional digits.
 */
export function isValidPositiveCusdAmount(value: unknown): value is string {
  if (typeof value !== 'string') {
    return false;
  }

  const trimmed = value.trim();
  const match = /^(\d+)(?:\.(\d+))?$/.exec(trimmed);
  if (!match) {
    return false;
  }

  const fractionalPart = match[2] || '';
  if (fractionalPart.length > MAX_CUSD_DECIMAL_PLACES) {
    return false;
  }

  // Avoid Number/parseFloat so policy validation cannot lose monetary precision.
  return /[1-9]/.test(match[1]) || /[1-9]/.test(fractionalPart);
}

/**
 * Validates the basic structural validity of an AgentSpendingPolicy object.
 *
 * @param policy Object to validate
 * @returns Object with valid boolean flag and optional error description
 */
export function validatePolicyStructure(policy: unknown): { valid: boolean; error?: string } {
  if (!policy || typeof policy !== 'object') {
    return { valid: false, error: 'Policy must be a valid non-null object' };
  }

  const p = policy as Record<string, unknown>;

  if (typeof p.agentId !== 'string' || p.agentId.trim() === '') {
    return { valid: false, error: 'agentId must be a non-empty string' };
  }

  if (!isValidPositiveCusdAmount(p.maxPerTransaction)) {
    return { valid: false, error: 'maxPerTransaction must be a positive decimal string' };
  }

  if (!isValidPositiveCusdAmount(p.maxPerDay)) {
    return { valid: false, error: 'maxPerDay must be a positive decimal string' };
  }

  if (!isValidPositiveCusdAmount(p.autoApproveThreshold)) {
    return { valid: false, error: 'autoApproveThreshold must be a positive decimal string' };
  }

  if (!Array.isArray(p.allowedRecipients)) {
    return { valid: false, error: 'allowedRecipients must be an array' };
  }

  for (const addr of p.allowedRecipients) {
    if (typeof addr !== 'string' || !/^0x[a-fA-F0-9]{40}$/.test(addr.trim())) {
      return { valid: false, error: `Invalid EVM address in allowedRecipients: ${String(addr)}` };
    }
  }

  if (
    typeof p.validUntil !== 'number' ||
    !Number.isSafeInteger(p.validUntil) ||
    p.validUntil <= 0
  ) {
    return {
      valid: false,
      error: 'validUntil must be a positive integer Unix timestamp in milliseconds',
    };
  }

  return { valid: true };
}

/**
 * Validates policy values at a trusted server/storage boundary.
 * Unlike structural validation, this rejects expired policies and enforces
 * the relationships used by the create-agent UI.
 */
export function validatePolicyForStorage(
  policy: unknown,
  trustedNow: number = Date.now()
): { valid: boolean; error?: string } {
  const structuralValidation = validatePolicyStructure(policy);
  if (!structuralValidation.valid) {
    return structuralValidation;
  }

  if (!Number.isSafeInteger(trustedNow) || trustedNow < 0) {
    return { valid: false, error: 'trustedNow must be a non-negative safe integer timestamp' };
  }

  const p = policy as AgentSpendingPolicy;
  if (p.validUntil <= trustedNow) {
    return { valid: false, error: 'validUntil must be in the future' };
  }

  const relationshipValidation = validatePolicyRelationships(policy);
  if (!relationshipValidation.valid) {
    return relationshipValidation;
  }

  return { valid: true };
}

/**
 * Validates policy relationships without applying a time-expiration decision.
 * Runtime evaluators use this so expired policies retain their domain-level
 * "Policy has expired" decision while still failing closed on malformed limits.
 */
export function validatePolicyRelationships(
  policy: unknown
): { valid: boolean; error?: string } {
  const structuralValidation = validatePolicyStructure(policy);
  if (!structuralValidation.valid) {
    return structuralValidation;
  }

  const p = policy as AgentSpendingPolicy;
  let maxPerTransactionWei: bigint;
  let maxPerDayWei: bigint;
  let autoApproveThresholdWei: bigint;
  try {
    maxPerTransactionWei = parseUnits(p.maxPerTransaction.trim(), MAX_CUSD_DECIMAL_PLACES);
    maxPerDayWei = parseUnits(p.maxPerDay.trim(), MAX_CUSD_DECIMAL_PLACES);
    autoApproveThresholdWei = parseUnits(
      p.autoApproveThreshold.trim(),
      MAX_CUSD_DECIMAL_PLACES
    );
  } catch {
    return { valid: false, error: 'Policy monetary values could not be parsed' };
  }

  if (maxPerTransactionWei > maxPerDayWei) {
    return { valid: false, error: 'maxPerTransaction cannot exceed maxPerDay' };
  }

  if (autoApproveThresholdWei > maxPerTransactionWei) {
    return {
      valid: false,
      error: 'autoApproveThreshold cannot exceed maxPerTransaction',
    };
  }

  return { valid: true };
}
