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
  /** List of authorized recipient EVM addresses (0x... checksummed strings) */
  allowedRecipients: string[];
  /** Amount threshold in cUSD up to which payments are auto-approved without user prompt (decimal string e.g., "0.05") */
  autoApproveThreshold: string;
  /** Policy expiration timestamp (Unix time in milliseconds e.g., 1740000000000) */
  validUntil: number;
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

  const isDecimalStr = (val: unknown) => typeof val === 'string' && /^\d+(\.\d+)?$/.test(val.trim());

  if (!isDecimalStr(p.maxPerTransaction)) {
    return { valid: false, error: 'maxPerTransaction must be a positive decimal string' };
  }

  if (!isDecimalStr(p.maxPerDay)) {
    return { valid: false, error: 'maxPerDay must be a positive decimal string' };
  }

  if (!isDecimalStr(p.autoApproveThreshold)) {
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

  if (typeof p.validUntil !== 'number' || isNaN(p.validUntil) || p.validUntil <= 0) {
    return { valid: false, error: 'validUntil must be a positive numeric Unix timestamp in milliseconds' };
  }

  return { valid: true };
}
