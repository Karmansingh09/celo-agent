import { randomBytes } from 'crypto';
import { isAddress, getAddress } from 'viem';
import { AgentSpendingPolicy, validatePolicyStructure } from '../policy/types';

/**
 * Phase 7.1: Agent Domain Model & Lifecycle Types
 * 
 * Defines the core domain entities, lifecycle state machine, validation rules,
 * and error types for autonomous agent management under CeloAgent.
 */

/**
 * Operational lifecycle states for an Agent:
 * - ACTIVE: Operational; permitted to initiate payment evaluations and budget reservations.
 * - PAUSED: Temporarily halted by owner; any payment evaluation is immediately denied.
 * - TERMINATED: Permanently retired; cannot be resumed, updated, or execute payments.
 */
export type AgentStatus = 'ACTIVE' | 'PAUSED' | 'TERMINATED';

/**
 * Fully bound spending policy attached to an Agent.
 * Compatible with AgentSpendingPolicy while preserving optional policyId/id identity metadata.
 */
export type BoundAgentSpendingPolicy = AgentSpendingPolicy & {
  policyId?: string;
  id?: string;
};

/**
 * Core Agent domain model.
 */
export interface Agent {
  /** Unique stable agent identifier, e.g. "agent_1740000000_a1b2c3d4" */
  readonly id: string;
  /** Checksummed EVM address of the human owner/creator (0x...) */
  readonly ownerAddress: string;
  /** Human-readable display label (1-100 characters) */
  name: string;
  /** Optional detailed description of the agent's purpose */
  description?: string;
  /** Current operational lifecycle status */
  status: AgentStatus;
  /** Active spending policy governing this agent */
  spendingPolicy: BoundAgentSpendingPolicy;
  /** Optional dedicated wallet/delegate EVM address (defaults to backend wallet) */
  walletAddress?: string;
  /** Optional key-value metadata store */
  metadata?: Record<string, string>;
  /** Timestamp when agent was created (Unix ms) */
  readonly createdAt: number;
  /** Timestamp when agent was last modified (Unix ms) */
  updatedAt: number;
  /** Optional explanation recorded when agent status transitioned (e.g. why paused or terminated) */
  statusReason?: string;
}

/**
 * Input policy specification when creating an agent.
 * Allows omitting `agentId` when the agent ID is generated automatically by the service.
 */
export type CreateAgentSpendingPolicyInput = Omit<AgentSpendingPolicy, 'agentId'> & {
  /**
   * Optional agentId. If provided, must match the resolved agent ID.
   * If omitted, it will be automatically bound to the resolved agent ID.
   */
  agentId?: string;
  /** Optional policy identity or version tag */
  policyId?: string;
  /** Optional alternate ID representation */
  id?: string;
};

/**
 * Input parameters for creating a new Agent.
 */
export interface CreateAgentInput {
  /** Optional custom ID; if omitted, an ID is generated automatically */
  id?: string;
  /** EVM address of the human owner / creator */
  ownerAddress: string;
  /** Human-readable display label */
  name: string;
  /** Optional description */
  description?: string;
  /** Initial spending policy (agentId will be bound to resolved agent ID) */
  spendingPolicy: CreateAgentSpendingPolicyInput;
  /** Optional dedicated wallet/delegate address */
  walletAddress?: string;
  /** Optional metadata */
  metadata?: Record<string, string>;
}

/**
 * Input parameters for updating an existing Agent's mutable attributes.
 * Note: id, ownerAddress, and createdAt are strictly immutable.
 */
export interface UpdateAgentInput {
  /** Updated human-readable display label */
  name?: string;
  /** Updated description */
  description?: string;
  /** Updated spending policy (must match existing agentId) */
  spendingPolicy?: AgentSpendingPolicy;
  /** Updated wallet address */
  walletAddress?: string;
  /** Updated metadata (merges or replaces) */
  metadata?: Record<string, string>;
}

// ============================================================================
// DOMAIN ERRORS
// ============================================================================

export class AgentNotFoundError extends Error {
  constructor(public readonly agentId: string) {
    super(`Agent not found: ${agentId}`);
    this.name = 'AgentNotFoundError';
  }
}

export class AgentAlreadyExistsError extends Error {
  constructor(public readonly agentId: string) {
    super(`Agent already exists: ${agentId}`);
    this.name = 'AgentAlreadyExistsError';
  }
}

export class AgentPausedError extends Error {
  constructor(public readonly agentId: string, public readonly reason?: string) {
    super(`Agent ${agentId} is currently PAUSED${reason ? `: ${reason}` : ''}`);
    this.name = 'AgentPausedError';
  }
}

export class AgentTerminatedError extends Error {
  constructor(public readonly agentId: string, public readonly reason?: string) {
    super(`Agent ${agentId} is TERMINATED and cannot perform actions${reason ? `: ${reason}` : ''}`);
    this.name = 'AgentTerminatedError';
  }
}

export class UnauthorizedAgentError extends Error {
  constructor(public readonly agentId: string, public readonly caller: string) {
    super(`Caller ${caller} is not authorized to manage agent ${agentId}`);
    this.name = 'UnauthorizedAgentError';
  }
}

export class InvalidAgentStateError extends Error {
  constructor(public readonly current: AgentStatus, public readonly attempted: AgentStatus, message?: string) {
    super(message || `Invalid state transition from ${current} to ${attempted}`);
    this.name = 'InvalidAgentStateError';
  }
}

export class InvalidAgentInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidAgentInputError';
  }
}

// ============================================================================
// METADATA CONSTRAINTS
// ============================================================================

export const MAX_METADATA_KEYS = 50;
export const MAX_METADATA_KEY_LENGTH = 64;
export const MAX_METADATA_VALUE_LENGTH = 500;

/**
 * Validates metadata key-value store:
 * - Must be a plain, non-null, non-array object.
 * - All keys must be strings between 1 and 64 characters.
 * - All values must be strings up to 500 characters.
 * - No nested objects, arrays, numbers, booleans, or null/undefined values.
 * - Cannot exceed MAX_METADATA_KEYS (50).
 */
export function validateAgentMetadata(metadata: unknown): asserts metadata is Record<string, string> {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
    throw new InvalidAgentInputError('Metadata must be a plain key-value object');
  }

  const entries = Object.entries(metadata);
  if (entries.length > MAX_METADATA_KEYS) {
    throw new InvalidAgentInputError(`Metadata cannot contain more than ${MAX_METADATA_KEYS} keys`);
  }

  for (const [key, value] of entries) {
    if (typeof key !== 'string' || key.trim().length === 0 || key.length > MAX_METADATA_KEY_LENGTH) {
      throw new InvalidAgentInputError(
        `Metadata key must be a non-empty string up to ${MAX_METADATA_KEY_LENGTH} characters: "${key}"`
      );
    }
    if (typeof value !== 'string' || value.length > MAX_METADATA_VALUE_LENGTH) {
      throw new InvalidAgentInputError(
        `Metadata value for key "${key}" must be a string up to ${MAX_METADATA_VALUE_LENGTH} characters`
      );
    }
  }
}

// ============================================================================
// VALIDATION & LIFECYCLE HELPERS
// ============================================================================

const AGENT_ID_REGEX = /^agent_[a-zA-Z0-9_-]{8,64}$/;

/**
 * Generates a unique, URL-safe agent ID using a cryptographically secure random source.
 * Format: "agent_<base36_time>_<random_hex>"
 * 
 * - Uses Node.js crypto.randomBytes(4) for 32-bit cryptographically secure entropy.
 * - Floors nowMs to guarantee clean integer base-36 representation without decimal points.
 * - Supports deterministic timestamp injection for testing.
 * 
 * @param nowMs Unix timestamp in milliseconds (defaults to Date.now())
 */
export function generateAgentId(nowMs: number = Date.now()): string {
  if (typeof nowMs !== 'number' || !Number.isFinite(nowMs)) {
    throw new RangeError(`Invalid timestamp provided to generateAgentId: ${nowMs}`);
  }
  const flooredTime = Math.floor(nowMs);
  const timePart = flooredTime.toString(36);
  const randomHex = randomBytes(4).toString('hex');
  return `agent_${timePart}_${randomHex}`;
}

/**
 * Validates whether a string matches the required agent ID format.
 */
export function isValidAgentId(id: unknown): id is string {
  return typeof id === 'string' && AGENT_ID_REGEX.test(id.trim());
}

/**
 * Validates and normalizes an EVM address to its checksummed format.
 * 
 * TRUST BOUNDARY NOTICE:
 * This function validates syntax and checksum formatting only.
 * It DOES NOT prove that the caller owns or controls the private key for this address.
 * Caller authorization must be verified by the auth/API layer.
 * 
 * @throws InvalidAgentInputError if address is malformed
 */
export function normalizeOwnerAddress(address: unknown): string {
  if (typeof address !== 'string' || !address.trim().startsWith('0x') || !isAddress(address.trim())) {
    throw new InvalidAgentInputError(`Invalid EVM address: ${String(address)}`);
  }
  return getAddress(address.trim());
}

/**
 * Validates the state transition rules for Agent lifecycle:
 * - ACTIVE -> PAUSED: Valid
 * - PAUSED -> ACTIVE: Valid
 * - ACTIVE -> TERMINATED: Valid
 * - PAUSED -> TERMINATED: Valid
 * - Any transition from TERMINATED: Illegal (terminal state)
 * - Transition to identical state: Rejected as invalid transition
 */
export function assertValidStateTransition(current: AgentStatus, next: AgentStatus): void {
  if (current === 'TERMINATED') {
    throw new InvalidAgentStateError(current, next, `Agent is TERMINATED; no further state transitions are permitted`);
  }
  if (current === next) {
    throw new InvalidAgentStateError(current, next, `Agent is already in status ${current}`);
  }
}

/**
 * Normalizes and binds an input spending policy to a resolved agent ID.
 * 
 * - Ensures the caller's original policy object is NOT mutated.
 * - Validates policy structure using validatePolicyStructure.
 * - If policyInput.agentId is provided, asserts that it matches resolvedAgentId (rejects conflicts).
 * - Binds resolvedAgentId to the returned policy.
 * - Preserves policyId, id, and all other valid policy fields.
 * 
 * @returns Fully bound, typed AgentSpendingPolicy
 * @throws InvalidAgentInputError if policy structure is invalid or agentId conflicts
 */
export function resolveAndBindAgentPolicy(
  policyInput: CreateAgentSpendingPolicyInput,
  resolvedAgentId: string
): BoundAgentSpendingPolicy {
  if (!policyInput || typeof policyInput !== 'object' || Array.isArray(policyInput)) {
    throw new InvalidAgentInputError('spendingPolicy must be a valid non-null object');
  }

  // If agentId is explicitly supplied on policy, it must match resolvedAgentId
  if (policyInput.agentId !== undefined && policyInput.agentId.trim() !== resolvedAgentId) {
    throw new InvalidAgentInputError(
      `Spending policy agentId ("${policyInput.agentId}") conflicts with resolved agent ID ("${resolvedAgentId}")`
    );
  }

  // Create bound policy without mutating original policyInput
  const boundPolicy: AgentSpendingPolicy = {
    ...policyInput,
    agentId: resolvedAgentId,
  };

  const validation = validatePolicyStructure(boundPolicy);
  if (!validation.valid) {
    throw new InvalidAgentInputError(`Invalid spending policy: ${validation.error}`);
  }

  return boundPolicy as BoundAgentSpendingPolicy;
}

/**
 * Validates agent creation input and resolves its spending policy.
 * Returns the fully bound BoundAgentSpendingPolicy.
 * 
 * @throws InvalidAgentInputError if any input constraints are violated
 */
export function validateCreateAgentInput(input: CreateAgentInput, resolvedAgentId: string): BoundAgentSpendingPolicy {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new InvalidAgentInputError('Creation input must be a valid non-null object');
  }

  // Validate agent ID
  if (!isValidAgentId(resolvedAgentId)) {
    throw new InvalidAgentInputError(`Invalid agent ID format: ${resolvedAgentId}`);
  }

  // Validate name
  if (typeof input.name !== 'string' || input.name.trim().length === 0 || input.name.trim().length > 100) {
    throw new InvalidAgentInputError('Agent name must be a non-empty string between 1 and 100 characters');
  }

  // Validate description (optional)
  if (input.description !== undefined && (typeof input.description !== 'string' || input.description.length > 1000)) {
    throw new InvalidAgentInputError('Agent description must be a string up to 1000 characters');
  }

  // Validate ownerAddress
  normalizeOwnerAddress(input.ownerAddress);

  // Validate walletAddress (optional)
  if (input.walletAddress !== undefined) {
    normalizeOwnerAddress(input.walletAddress);
  }

  // Validate metadata (optional)
  if (input.metadata !== undefined) {
    validateAgentMetadata(input.metadata);
  }

  // Bind and validate spending policy
  return resolveAndBindAgentPolicy(input.spendingPolicy, resolvedAgentId);
}

/**
 * Validates agent update input.
 * Throws InvalidAgentInputError if any update parameters are invalid.
 */
export function validateUpdateAgentInput(input: UpdateAgentInput, agentId: string): void {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new InvalidAgentInputError('Update input must be a valid non-null object');
  }

  if (input.name !== undefined) {
    if (typeof input.name !== 'string' || input.name.trim().length === 0 || input.name.trim().length > 100) {
      throw new InvalidAgentInputError('Agent name must be a non-empty string between 1 and 100 characters');
    }
  }

  if (input.description !== undefined) {
    if (typeof input.description !== 'string' || input.description.length > 1000) {
      throw new InvalidAgentInputError('Agent description must be a string up to 1000 characters');
    }
  }

  if (input.walletAddress !== undefined) {
    normalizeOwnerAddress(input.walletAddress);
  }

  if (input.metadata !== undefined) {
    validateAgentMetadata(input.metadata);
  }

  if (input.spendingPolicy !== undefined) {
    if (!input.spendingPolicy || typeof input.spendingPolicy !== 'object' || Array.isArray(input.spendingPolicy)) {
      throw new InvalidAgentInputError('Updated spendingPolicy must be a valid non-null object');
    }
    const policyCheck = validatePolicyStructure(input.spendingPolicy);
    if (!policyCheck.valid) {
      throw new InvalidAgentInputError(`Invalid spending policy: ${policyCheck.error}`);
    }
    if (input.spendingPolicy.agentId !== agentId) {
      throw new InvalidAgentInputError(
        `Updated spending policy agentId ("${input.spendingPolicy.agentId}") does not match agent ID ("${agentId}")`
      );
    }
  }
}
