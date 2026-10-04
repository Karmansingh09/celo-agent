import {
  Agent,
  AgentStatus,
  AgentAlreadyExistsError,
  AgentNotFoundError,
  InvalidAgentInputError,
  assertValidStateTransition,
  isValidAgentId,
  normalizeOwnerAddress,
  validateAgentMetadata,
} from './types';
import { validatePolicyStructure } from '../policy/types';
import { IAgentStore, ListAgentsFilter, UpdateAgentStorePatch } from './store';

/**
 * Phase 7.2: In-Memory Agent Repository
 * 
 * Implements IAgentStore for single-process Node.js execution.
 * 
 * ARCHITECTURE & CONCURRENCY CHARACTERISTICS:
 * 1. Single-Process Concurrency Safety:
 *    - All lookups, constraint validations, and Map state mutations execute synchronously
 *      within a single turn of the Node.js event loop without intervening async yields or `await`.
 *    - This guarantees atomic read-modify-write transitions within a single Node.js process.
 * 2. Process-Local & Non-Durable (LIMITATIONS):
 *    - State is held ephemerally in a JavaScript Map collection.
 *    - Data is lost on server restart, crash, or deployment.
 *    - Does NOT provide cross-process locking or persistence.
 *    - Does NOT synchronize across multiple server instances, worker threads, or serverless functions.
 *    - Production multi-instance deployments require an ACID-compliant database implementation of IAgentStore.
 * 3. Strict Boundary Reference Isolation:
 *    - Every stored record and nested mutable structure (such as `allowedRecipients` array or `metadata` object)
 *      is deep-cloned on both input (write) and output (read).
 *    - Callers mutating returned records cannot corrupt or tamper with internal repository state.
 * 4. All-or-Nothing Atomicity:
 *    - All updates and status transitions are validated and prepared in a local copy before the map is mutated.
 *    - If any validation or invariant check fails, an error is thrown and stored state remains completely unchanged.
 */
export class InMemoryAgentStore implements IAgentStore {
  /** Internal map storing agents keyed by unique agent ID */
  private readonly agents: Map<string, Agent> = new Map();

  constructor(private readonly clock: () => number = () => Date.now()) {}

  /**
   * Clears all in-memory agent records. Used primarily for test suite isolation.
   */
  public clear(): void {
    this.agents.clear();
  }

  /**
   * Deep-clones an Agent record to eliminate shared reference vulnerabilities.
   */
  private cloneAgent(agent: Agent): Agent {
    return {
      id: agent.id,
      ownerAddress: agent.ownerAddress,
      name: agent.name,
      description: agent.description,
      status: agent.status,
      spendingPolicy: {
        ...agent.spendingPolicy,
        allowedRecipients: [...agent.spendingPolicy.allowedRecipients],
      },
      walletAddress: agent.walletAddress,
      metadata: agent.metadata ? { ...agent.metadata } : undefined,
      createdAt: agent.createdAt,
      updatedAt: agent.updatedAt,
      statusReason: agent.statusReason,
    };
  }

  /**
   * Persists a new agent record.
   * Validates all fields, checks uniqueness, and deep-clones on insertion.
   */
  public async createAgent(agent: Agent): Promise<Agent> {
    if (!agent || typeof agent !== 'object' || Array.isArray(agent)) {
      throw new InvalidAgentInputError('Agent must be a valid non-null object');
    }

    if (!isValidAgentId(agent.id)) {
      throw new InvalidAgentInputError(`Invalid agent ID format: ${agent.id}`);
    }

    if (this.agents.has(agent.id)) {
      throw new AgentAlreadyExistsError(agent.id);
    }

    if (typeof agent.name !== 'string' || agent.name.trim().length === 0 || agent.name.trim().length > 100) {
      throw new InvalidAgentInputError('Agent name must be a non-empty string between 1 and 100 characters');
    }

    if (agent.description !== undefined && (typeof agent.description !== 'string' || agent.description.length > 1000)) {
      throw new InvalidAgentInputError('Agent description must be a string up to 1000 characters');
    }

    const normalizedOwner = normalizeOwnerAddress(agent.ownerAddress);

    let normalizedWallet: string | undefined = undefined;
    if (agent.walletAddress !== undefined) {
      normalizedWallet = normalizeOwnerAddress(agent.walletAddress);
    }

    if (!agent.spendingPolicy || typeof agent.spendingPolicy !== 'object' || Array.isArray(agent.spendingPolicy)) {
      throw new InvalidAgentInputError('Agent must have a valid spending policy');
    }

    const policyValidation = validatePolicyStructure(agent.spendingPolicy);
    if (!policyValidation.valid) {
      throw new InvalidAgentInputError(`Invalid spending policy: ${policyValidation.error}`);
    }

    if (agent.spendingPolicy.agentId !== agent.id) {
      throw new InvalidAgentInputError(
        `Spending policy agentId ("${agent.spendingPolicy.agentId}") does not match agent ID ("${agent.id}")`
      );
    }

    if (agent.status !== 'ACTIVE' && agent.status !== 'PAUSED' && agent.status !== 'TERMINATED') {
      throw new InvalidAgentInputError(`Invalid agent status: ${agent.status}`);
    }

    if (agent.metadata !== undefined) {
      validateAgentMetadata(agent.metadata);
    }

    if (typeof agent.createdAt !== 'number' || !Number.isFinite(agent.createdAt) || agent.createdAt <= 0) {
      throw new InvalidAgentInputError('createdAt must be a positive finite Unix timestamp in milliseconds');
    }

    if (typeof agent.updatedAt !== 'number' || !Number.isFinite(agent.updatedAt) || agent.updatedAt <= 0) {
      throw new InvalidAgentInputError('updatedAt must be a positive finite Unix timestamp in milliseconds');
    }

    if (agent.statusReason !== undefined && (typeof agent.statusReason !== 'string' || agent.statusReason.length > 500)) {
      throw new InvalidAgentInputError('statusReason must be a string up to 500 characters');
    }

    // Assemble validated agent record with normalized addresses
    const preparedAgent: Agent = {
      id: agent.id,
      ownerAddress: normalizedOwner,
      name: agent.name.trim(),
      description: agent.description,
      status: agent.status,
      spendingPolicy: {
        ...agent.spendingPolicy,
        allowedRecipients: [...agent.spendingPolicy.allowedRecipients],
      },
      walletAddress: normalizedWallet,
      metadata: agent.metadata ? { ...agent.metadata } : undefined,
      createdAt: agent.createdAt,
      updatedAt: agent.updatedAt,
      statusReason: agent.statusReason,
    };

    // Synchronous atomic write on event loop
    this.agents.set(preparedAgent.id, preparedAgent);
    return this.cloneAgent(preparedAgent);
  }

  /**
   * Retrieves an agent record by ID. Returns a deep clone or null if not found.
   */
  public async getAgentById(id: string): Promise<Agent | null> {
    if (typeof id !== 'string' || id.trim() === '') {
      return null;
    }
    const agent = this.agents.get(id);
    return agent ? this.cloneAgent(agent) : null;
  }

  /**
   * Updates mutable fields and/or lifecycle status of an existing agent.
   * Guarantees all-or-nothing atomicity.
   */
  public async updateAgent(id: string, patch: UpdateAgentStorePatch): Promise<Agent> {
    const existing = this.agents.get(id);
    if (!existing) {
      throw new AgentNotFoundError(id);
    }

    if (!patch || typeof patch !== 'object' || Array.isArray(patch)) {
      throw new InvalidAgentInputError('Update patch must be a valid non-null object');
    }

    // Strictly reject any attempts to modify immutable fields
    const rawPatch = patch as Record<string, unknown>;
    if ('id' in rawPatch) {
      throw new InvalidAgentInputError('Cannot modify immutable field: id');
    }
    if ('ownerAddress' in rawPatch) {
      throw new InvalidAgentInputError('Cannot modify immutable field: ownerAddress');
    }
    if ('createdAt' in rawPatch) {
      throw new InvalidAgentInputError('Cannot modify immutable field: createdAt');
    }

    // Validate mutable fields
    if (patch.name !== undefined) {
      if (typeof patch.name !== 'string' || patch.name.trim().length === 0 || patch.name.trim().length > 100) {
        throw new InvalidAgentInputError('Agent name must be a non-empty string between 1 and 100 characters');
      }
    }

    if (patch.description !== undefined) {
      if (typeof patch.description !== 'string' || patch.description.length > 1000) {
        throw new InvalidAgentInputError('Agent description must be a string up to 1000 characters');
      }
    }

    let updatedWalletAddress = existing.walletAddress;
    if (patch.walletAddress !== undefined) {
      updatedWalletAddress = normalizeOwnerAddress(patch.walletAddress);
    }

    if (patch.metadata !== undefined) {
      validateAgentMetadata(patch.metadata);
    }

    let updatedPolicy = existing.spendingPolicy;
    if (patch.spendingPolicy !== undefined) {
      if (!patch.spendingPolicy || typeof patch.spendingPolicy !== 'object' || Array.isArray(patch.spendingPolicy)) {
        throw new InvalidAgentInputError('spendingPolicy must be a valid non-null object');
      }
      const policyValidation = validatePolicyStructure(patch.spendingPolicy);
      if (!policyValidation.valid) {
        throw new InvalidAgentInputError(`Invalid spending policy: ${policyValidation.error}`);
      }
      if (patch.spendingPolicy.agentId !== existing.id) {
        throw new InvalidAgentInputError(
          `Updated spending policy agentId ("${patch.spendingPolicy.agentId}") does not match agent ID ("${existing.id}")`
        );
      }
      updatedPolicy = {
        ...patch.spendingPolicy,
        allowedRecipients: [...patch.spendingPolicy.allowedRecipients],
      };
    }

    if (patch.statusReason !== undefined && (typeof patch.statusReason !== 'string' || patch.statusReason.length > 500)) {
      throw new InvalidAgentInputError('statusReason must be a string up to 500 characters');
    }

    // Lifecycle status transition & statusReason semantics
    let nextStatus = existing.status;
    let nextStatusReason = existing.statusReason;

    if (patch.status !== undefined) {
      assertValidStateTransition(existing.status, patch.status);
      nextStatus = patch.status;

      if (patch.status === 'PAUSED') {
        nextStatusReason = patch.statusReason !== undefined ? patch.statusReason : existing.statusReason;
      } else if (patch.status === 'ACTIVE') {
        // When resuming, clear statusReason unless explicitly supplied for resume
        nextStatusReason = patch.statusReason !== undefined ? patch.statusReason : undefined;
      } else if (patch.status === 'TERMINATED') {
        nextStatusReason = patch.statusReason !== undefined ? patch.statusReason : existing.statusReason;
      }
    } else if (patch.statusReason !== undefined) {
      // Status did not change, but statusReason was updated
      nextStatusReason = patch.statusReason;
    }

    const nowMs = this.clock();

    // Prepare complete updated record before modifying map (all-or-nothing atomicity)
    const updatedAgent: Agent = {
      id: existing.id,
      ownerAddress: existing.ownerAddress,
      name: patch.name !== undefined ? patch.name.trim() : existing.name,
      description: patch.description !== undefined ? patch.description : existing.description,
      status: nextStatus,
      spendingPolicy: updatedPolicy,
      walletAddress: updatedWalletAddress,
      metadata: patch.metadata !== undefined ? { ...patch.metadata } : (existing.metadata ? { ...existing.metadata } : undefined),
      createdAt: existing.createdAt,
      updatedAt: nowMs,
      statusReason: nextStatusReason,
    };

    // Synchronous atomic write on event loop
    this.agents.set(existing.id, updatedAgent);
    return this.cloneAgent(updatedAgent);
  }

  /**
   * Queries agents matching filter criteria with deterministic ordering.
   * Sorts deterministically by `createdAt` ascending, tie-broken by `id` ascending.
   */
  public async listAgents(filter?: ListAgentsFilter): Promise<Agent[]> {
    if (filter?.limit !== undefined) {
      if (typeof filter.limit !== 'number' || !Number.isInteger(filter.limit) || filter.limit < 0 || filter.limit > 1000) {
        throw new InvalidAgentInputError('limit must be an integer between 0 and 1000');
      }
    }

    if (filter?.offset !== undefined) {
      if (typeof filter.offset !== 'number' || !Number.isInteger(filter.offset) || filter.offset < 0) {
        throw new InvalidAgentInputError('offset must be a non-negative integer');
      }
    }

    const normalizedOwner = filter?.ownerAddress ? normalizeOwnerAddress(filter.ownerAddress) : undefined;

    let matches: Agent[] = [];
    for (const agent of this.agents.values()) {
      if (normalizedOwner && agent.ownerAddress !== normalizedOwner) {
        continue;
      }
      if (filter?.status && agent.status !== filter.status) {
        continue;
      }
      matches.push(this.cloneAgent(agent));
    }

    // Deterministic sort: createdAt ascending, tie-broken by id ascending
    matches.sort((a, b) => {
      if (a.createdAt !== b.createdAt) {
        return a.createdAt - b.createdAt;
      }
      return a.id.localeCompare(b.id);
    });

    const offset = filter?.offset ?? 0;
    if (offset > 0) {
      matches = matches.slice(offset);
    }

    if (filter?.limit !== undefined) {
      matches = matches.slice(0, filter.limit);
    }

    return matches;
  }

  /**
   * Low-level repository deletion for testing or administrative purging.
   * Returns true if an agent was deleted, false if not found.
   */
  public async deleteAgent(id: string): Promise<boolean> {
    return this.agents.delete(id);
  }
}
