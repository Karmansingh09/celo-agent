import {
  Agent,
  AgentStatus,
  CreateAgentSpendingPolicyInput,
  AgentNotFoundError,
  AgentTerminatedError,
  UnauthorizedAgentError,
  InvalidAgentInputError,
  assertValidStateTransition,
  generateAgentId,
  isValidAgentId,
  normalizeOwnerAddress,
  resolveAndBindAgentPolicy,
  validateAgentMetadata,
} from './types';
import { IAgentStore, ListAgentsFilter, UpdateAgentStorePatch } from './store';

/**
 * Phase 7.3: Agent Management Service
 * 
 * Provides domain-level orchestration and owner-authorization enforcement for autonomous agents.
 * 
 * TRUST BOUNDARY & AUTHORIZATION CONTRACT:
 * 1. Every public service operation requires an explicit `authenticatedOwnerAddress`.
 * 2. IMPORTANT: This service assumes `authenticatedOwnerAddress` has already been verified
 *    by a secure upstream authentication layer (e.g. Sign-In with Ethereum / SIWE cryptographic
 *    signature verification or authenticated session cookies).
 * 3. An address supplied arbitrarily in an untrusted request body is NEVER proof of identity.
 * 4. The service independently checks that the caller's verified address matches the stored agent's
 *    `ownerAddress` before permitting any retrieval, update, or lifecycle mutation.
 * 5. Repository query filters alone are not authorization; the service strictly verifies records.
 */

/**
 * Input parameters for creating an agent via AgentService.
 */
export interface CreateAgentServiceInput {
  /** Optional custom ID. If omitted, a unique ID is securely generated automatically */
  id?: string;
  /** Human-readable display label (1-100 characters) */
  name: string;
  /** Optional description (up to 1000 characters) */
  description?: string;
  /** Initial spending policy specification (agentId will be bound to resolved agent ID) */
  spendingPolicy: CreateAgentSpendingPolicyInput;
  /** Optional dedicated wallet/delegate EVM address */
  walletAddress?: string;
  /** Optional metadata (max 50 plain string key-value pairs) */
  metadata?: Record<string, string>;
}

/**
 * Input parameters for updating an agent's mutable attributes via AgentService.
 * Rejects empty updates or attempts to pass unknown/immutable fields.
 */
export interface UpdateAgentServiceInput {
  /** Updated human-readable display label (1-100 characters) */
  name?: string;
  /** Updated description (up to 1000 characters) */
  description?: string;
  /** Updated spending policy specification (agentId must match or be omitted) */
  spendingPolicy?: CreateAgentSpendingPolicyInput;
  /** Updated wallet EVM address */
  walletAddress?: string;
  /** Updated metadata (replaces stored metadata) */
  metadata?: Record<string, string>;
}

/**
 * Filter options for listing agents belonging to an authenticated owner.
 */
export interface ListAgentsServiceFilter {
  /** Filter by operational lifecycle status */
  status?: AgentStatus;
  /** Maximum number of records to return (0-1000) */
  limit?: number;
  /** Number of matching records to skip (>= 0) */
  offset?: number;
}

export class AgentService {
  constructor(
    private readonly store: IAgentStore,
    private readonly clock: () => number = () => Date.now()
  ) {}

  /**
   * Retrieves a trusted timestamp from the injected clock provider.
   * Strictly validates that the clock produces positive, finite numeric values.
   * If minTimestamp is provided, asserts that the clock has not regressed.
   */
  private getTrustedTimestamp(minTimestamp?: number): number {
    const ts = this.clock();
    if (typeof ts !== 'number' || !Number.isFinite(ts) || ts <= 0) {
      throw new RangeError(`Trusted clock returned invalid timestamp: ${ts}`);
    }
    const floored = Math.floor(ts);
    if (minTimestamp !== undefined && floored < minTimestamp) {
      throw new RangeError(
        `Clock regression detected: clock timestamp (${floored} ms) cannot be earlier than current updatedAt (${minTimestamp} ms)`
      );
    }
    return floored;
  }

  /**
   * Asserts that the authenticated caller owns the specified agent.
   * Throws UnauthorizedAgentError if caller address does not match agent.ownerAddress.
   */
  private assertOwnership(agent: Agent, normalizedCaller: string): void {
    if (agent.ownerAddress !== normalizedCaller) {
      throw new UnauthorizedAgentError(agent.id, normalizedCaller);
    }
  }

  /**
   * Validates optional lifecycle statusReason parameters.
   */
  private validateStatusReason(reason?: string): string | undefined {
    if (reason === undefined) {
      return undefined;
    }
    if (typeof reason !== 'string' || reason.trim().length === 0 || reason.length > 500) {
      throw new InvalidAgentInputError('statusReason must be a non-empty string up to 500 characters');
    }
    return reason.trim();
  }

  /**
   * Creates a new agent owned by authenticatedOwnerAddress.
   * Resolves or generates the agent ID, binds the spending policy, and initializes status to ACTIVE.
   */
  public async createAgent(
    authenticatedOwnerAddress: string,
    input: CreateAgentServiceInput
  ): Promise<Agent> {
    const normalizedOwner = normalizeOwnerAddress(authenticatedOwnerAddress);

    if (!input || typeof input !== 'object' || Array.isArray(input)) {
      throw new InvalidAgentInputError('Creation input must be a valid non-null object');
    }

    const nowMs = this.getTrustedTimestamp();

    // Resolve or generate unique agent ID
    let resolvedAgentId: string;
    if (input.id !== undefined) {
      if (typeof input.id !== 'string' || !isValidAgentId(input.id.trim())) {
        throw new InvalidAgentInputError(`Invalid agent ID format: ${input.id}`);
      }
      resolvedAgentId = input.id.trim();
    } else {
      resolvedAgentId = generateAgentId(nowMs);
    }

    // Validate name
    if (typeof input.name !== 'string' || input.name.trim().length === 0 || input.name.trim().length > 100) {
      throw new InvalidAgentInputError('Agent name must be a non-empty string between 1 and 100 characters');
    }

    // Validate description (optional)
    if (input.description !== undefined && (typeof input.description !== 'string' || input.description.length > 1000)) {
      throw new InvalidAgentInputError('Agent description must be a string up to 1000 characters');
    }

    // Validate walletAddress (optional)
    let normalizedWallet: string | undefined = undefined;
    if (input.walletAddress !== undefined) {
      normalizedWallet = normalizeOwnerAddress(input.walletAddress);
    }

    // Validate metadata (optional)
    if (input.metadata !== undefined) {
      validateAgentMetadata(input.metadata);
    }

    // Bind and validate spending policy
    const boundPolicy = resolveAndBindAgentPolicy(input.spendingPolicy, resolvedAgentId);

    // Prepare complete Agent domain record
    const agentRecord: Agent = {
      id: resolvedAgentId,
      ownerAddress: normalizedOwner,
      name: input.name.trim(),
      description: input.description,
      status: 'ACTIVE',
      spendingPolicy: boundPolicy,
      walletAddress: normalizedWallet,
      metadata: input.metadata ? { ...input.metadata } : undefined,
      createdAt: nowMs,
      updatedAt: nowMs,
    };

    return this.store.createAgent(agentRecord);
  }

  /**
   * Retrieves an agent by ID after strictly verifying caller ownership.
   */
  public async getAgentById(
    authenticatedOwnerAddress: string,
    agentId: string
  ): Promise<Agent> {
    const normalizedOwner = normalizeOwnerAddress(authenticatedOwnerAddress);

    if (typeof agentId !== 'string' || agentId.trim() === '') {
      throw new InvalidAgentInputError('agentId must be a non-empty string');
    }

    const agent = await this.store.getAgentById(agentId.trim());
    if (!agent) {
      throw new AgentNotFoundError(agentId.trim());
    }

    this.assertOwnership(agent, normalizedOwner);
    return agent;
  }

  /**
   * Lists agents owned strictly by authenticatedOwnerAddress, applying optional status and pagination filters.
   * Enforces caller scoping: repository filter.ownerAddress is strictly overridden with authenticatedOwnerAddress.
   */
  public async listAgents(
    authenticatedOwnerAddress: string,
    filter?: ListAgentsServiceFilter
  ): Promise<Agent[]> {
    const normalizedOwner = normalizeOwnerAddress(authenticatedOwnerAddress);

    if (filter !== undefined && (!filter || typeof filter !== 'object' || Array.isArray(filter))) {
      throw new InvalidAgentInputError('Filter must be a valid object');
    }

    const repoFilter: ListAgentsFilter = {
      ownerAddress: normalizedOwner,
      status: filter?.status,
      limit: filter?.limit,
      offset: filter?.offset,
    };

    return this.store.listAgents(repoFilter);
  }

  /**
   * Updates mutable fields of an agent after asserting owner authorization.
   * Rejects empty updates, attempts to modify immutable fields, or modifications to terminated agents.
   */
  public async updateAgent(
    authenticatedOwnerAddress: string,
    agentId: string,
    input: UpdateAgentServiceInput
  ): Promise<Agent> {
    const normalizedOwner = normalizeOwnerAddress(authenticatedOwnerAddress);

    if (typeof agentId !== 'string' || agentId.trim() === '') {
      throw new InvalidAgentInputError('agentId must be a non-empty string');
    }

    if (!input || typeof input !== 'object' || Array.isArray(input)) {
      throw new InvalidAgentInputError('Update input must be a valid non-null object');
    }

    const keys = Object.keys(input);
    if (keys.length === 0) {
      throw new InvalidAgentInputError('Update request cannot be empty: must supply at least one mutable field to update');
    }

    const hasDefinedField = keys.some((k) => (input as Record<string, unknown>)[k] !== undefined);
    if (!hasDefinedField) {
      throw new InvalidAgentInputError('Update request cannot be empty: must supply at least one mutable field to update');
    }

    const allowedKeys = new Set(['name', 'description', 'spendingPolicy', 'walletAddress', 'metadata']);
    for (const key of keys) {
      if (!allowedKeys.has(key)) {
        throw new InvalidAgentInputError(`Cannot update unknown or immutable field: ${key}`);
      }
    }

    const existing = await this.store.getAgentById(agentId.trim());
    if (!existing) {
      throw new AgentNotFoundError(agentId.trim());
    }

    this.assertOwnership(existing, normalizedOwner);

    if (existing.status === 'TERMINATED') {
      throw new AgentTerminatedError(existing.id, 'Cannot update a terminated agent');
    }

    // Validate fields before building patch
    if (input.name !== undefined) {
      if (typeof input.name !== 'string' || input.name.trim().length === 0 || input.name.trim().length > 100) {
        throw new InvalidAgentInputError('Agent name must be a non-empty string between 1 and 100 characters');
      }
    }

    if (input.description !== undefined && (typeof input.description !== 'string' || input.description.length > 1000)) {
      throw new InvalidAgentInputError('Agent description must be a string up to 1000 characters');
    }

    let normalizedWallet: string | undefined = undefined;
    if (input.walletAddress !== undefined) {
      normalizedWallet = normalizeOwnerAddress(input.walletAddress);
    }

    if (input.metadata !== undefined) {
      validateAgentMetadata(input.metadata);
    }

    let boundPolicy = undefined;
    if (input.spendingPolicy !== undefined) {
      boundPolicy = resolveAndBindAgentPolicy(input.spendingPolicy, existing.id);
    }

    // Ensure clock time is valid and non-decreasing
    this.getTrustedTimestamp(existing.updatedAt);

    const patch: UpdateAgentStorePatch = {
      name: input.name !== undefined ? input.name.trim() : undefined,
      description: input.description,
      walletAddress: normalizedWallet,
      metadata: input.metadata ? { ...input.metadata } : undefined,
      spendingPolicy: boundPolicy,
    };

    return this.store.updateAgent(existing.id, patch);
  }

  /**
   * Pauses an active agent, preventing payment evaluations and budget reservations.
   */
  public async pauseAgent(
    authenticatedOwnerAddress: string,
    agentId: string,
    reason?: string
  ): Promise<Agent> {
    const normalizedOwner = normalizeOwnerAddress(authenticatedOwnerAddress);

    if (typeof agentId !== 'string' || agentId.trim() === '') {
      throw new InvalidAgentInputError('agentId must be a non-empty string');
    }

    const validatedReason = this.validateStatusReason(reason);

    const existing = await this.store.getAgentById(agentId.trim());
    if (!existing) {
      throw new AgentNotFoundError(agentId.trim());
    }

    this.assertOwnership(existing, normalizedOwner);
    assertValidStateTransition(existing.status, 'PAUSED');

    this.getTrustedTimestamp(existing.updatedAt);

    return this.store.updateAgent(existing.id, {
      status: 'PAUSED',
      statusReason: validatedReason,
    });
  }

  /**
   * Resumes a paused agent back to ACTIVE status.
   * Clears previous pause reason unless a new reason is explicitly provided.
   */
  public async resumeAgent(
    authenticatedOwnerAddress: string,
    agentId: string,
    reason?: string
  ): Promise<Agent> {
    const normalizedOwner = normalizeOwnerAddress(authenticatedOwnerAddress);

    if (typeof agentId !== 'string' || agentId.trim() === '') {
      throw new InvalidAgentInputError('agentId must be a non-empty string');
    }

    const validatedReason = this.validateStatusReason(reason);

    const existing = await this.store.getAgentById(agentId.trim());
    if (!existing) {
      throw new AgentNotFoundError(agentId.trim());
    }

    this.assertOwnership(existing, normalizedOwner);
    assertValidStateTransition(existing.status, 'ACTIVE');

    this.getTrustedTimestamp(existing.updatedAt);

    return this.store.updateAgent(existing.id, {
      status: 'ACTIVE',
      statusReason: validatedReason,
    });
  }

  /**
   * Permanently terminates an agent.
   * Terminal state: cannot be unpaused or resumed.
   */
  public async terminateAgent(
    authenticatedOwnerAddress: string,
    agentId: string,
    reason?: string
  ): Promise<Agent> {
    const normalizedOwner = normalizeOwnerAddress(authenticatedOwnerAddress);

    if (typeof agentId !== 'string' || agentId.trim() === '') {
      throw new InvalidAgentInputError('agentId must be a non-empty string');
    }

    const validatedReason = this.validateStatusReason(reason);

    const existing = await this.store.getAgentById(agentId.trim());
    if (!existing) {
      throw new AgentNotFoundError(agentId.trim());
    }

    this.assertOwnership(existing, normalizedOwner);
    assertValidStateTransition(existing.status, 'TERMINATED');

    this.getTrustedTimestamp(existing.updatedAt);

    return this.store.updateAgent(existing.id, {
      status: 'TERMINATED',
      statusReason: validatedReason,
    });
  }
}
