import {
  Agent,
  AgentStatus,
  BoundAgentSpendingPolicy,
} from './types';

/**
 * Phase 7.2: Agent Repository Abstraction
 * 
 * Defines the contract and filter parameters for persisting, querying, and updating
 * autonomous Agent records under CeloAgent.
 * 
 * TRUST BOUNDARY & AUTHORIZATION NOTICE:
 * 1. Filtering by `ownerAddress` in `listAgents` is purely a query predicate.
 *    It DOES NOT authenticate or prove that the caller is authorized to view or manage the agents.
 * 2. Caller authorization (e.g. cryptographic wallet signature or authenticated session)
 *    must be verified by the service/API layer prior to repository operations.
 */

/**
 * Filter and pagination options for querying agents from the repository.
 */
export interface ListAgentsFilter {
  /** Filter by owner EVM address (case-insensitive checksum comparison) */
  ownerAddress?: string;
  /** Filter by operational lifecycle status */
  status?: AgentStatus;
  /** Maximum number of records to return (must be an integer >= 0 and <= 1000) */
  limit?: number;
  /** Number of matching records to skip (must be an integer >= 0) */
  offset?: number;
}

/**
 * Permitted update patch for mutable agent attributes.
 * 
 * IMMUTABILITY GUARANTEE:
 * Immutable fields (`id`, `ownerAddress`, `createdAt`) are strictly forbidden and rejected at runtime.
 */
export interface UpdateAgentStorePatch {
  /** Updated human-readable display label (1-100 characters) */
  name?: string;
  /** Updated description (up to 1000 characters) */
  description?: string;
  /** Updated spending policy (must match the agent's ID) */
  spendingPolicy?: BoundAgentSpendingPolicy;
  /** Updated wallet EVM address */
  walletAddress?: string;
  /** Updated metadata (replaces stored metadata) */
  metadata?: Record<string, string>;
  /** Updated operational lifecycle status (enforces lifecycle transition rules) */
  status?: AgentStatus;
  /** Optional explanation for status transition (e.g. reason paused or terminated) */
  statusReason?: string;
}

/**
 * Repository interface for Agent persistence and lifecycle management.
 */
export interface IAgentStore {
  /**
   * Persists a new agent record.
   * 
   * @param agent The fully initialized Agent domain record
   * @returns Deep-cloned copy of the persisted agent
   * @throws AgentAlreadyExistsError if an agent with agent.id already exists
   * @throws InvalidAgentInputError if agent constraints are violated
   */
  createAgent(agent: Agent): Promise<Agent>;

  /**
   * Retrieves an agent record by unique ID.
   * 
   * @param id Unique agent identifier
   * @returns Deep-cloned Agent record if found, or null if not found
   */
  getAgentById(id: string): Promise<Agent | null>;

  /**
   * Updates mutable fields and/or lifecycle status of an existing agent.
   * Guarantees all-or-nothing atomicity: failed updates leave stored state unchanged.
   * 
   * @param id Target agent identifier
   * @param patch Mutable fields to update
   * @returns Deep-cloned copy of the updated agent
   * @throws AgentNotFoundError if agent does not exist
   * @throws InvalidAgentStateError if status transition is illegal
   * @throws InvalidAgentInputError if input validation fails or immutable fields are present
   */
  updateAgent(id: string, patch: UpdateAgentStorePatch): Promise<Agent>;

  /**
   * Queries agents matching optional filter criteria with deterministic ordering.
   * 
   * @param filter Query criteria and pagination options
   * @returns Array of deep-cloned Agent records
   * @throws InvalidAgentInputError if pagination or filter values are invalid
   */
  listAgents(filter?: ListAgentsFilter): Promise<Agent[]>;

  /**
   * Low-level repository deletion for testing or administrative purging.
   * Normal business deactivation uses status: 'TERMINATED'.
   * 
   * @param id Unique agent identifier
   * @returns true if an agent was deleted, false if not found
   */
  deleteAgent(id: string): Promise<boolean>;
}
