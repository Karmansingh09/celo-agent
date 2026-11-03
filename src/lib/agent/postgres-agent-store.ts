import 'server-only';

import { Pool, PoolClient } from 'pg';
import {
  Agent,
  AgentAlreadyExistsError,
  AgentNotFoundError,
  InvalidAgentInputError,
  assertValidStateTransition,
  isValidAgentId,
  normalizeOwnerAddress,
  validateAgentMetadata,
} from './types';
import { IAgentStore, ListAgentsFilter, UpdateAgentStorePatch } from './store';
import { validatePolicyForStorage } from '../policy/types';
import { getDatabasePool, isUniqueViolation, withDatabaseTransaction } from '../db/postgres';

interface AgentRow {
  id: string;
  owner_address: string;
  name: string;
  description: string | null;
  status: Agent['status'];
  active_policy_id: string;
  wallet_address: string | null;
  metadata: Record<string, string> | null;
  created_at: string;
  updated_at: string;
  status_reason: string | null;
  policy: Agent['spendingPolicy'];
}

function cloneAgent(agent: Agent): Agent {
  return {
    ...agent,
    spendingPolicy: {
      ...agent.spendingPolicy,
      allowedRecipients: [...agent.spendingPolicy.allowedRecipients],
    },
    metadata: agent.metadata ? { ...agent.metadata } : undefined,
  };
}

/** PostgreSQL implementation of the agent repository. */
export class PostgresAgentStore implements IAgentStore {
  constructor(private readonly db: Pool = getDatabasePool()) {}

  private async selectAgent(client: Pool | PoolClient, id: string, forUpdate = false): Promise<AgentRow | null> {
    const result = await client.query<AgentRow>(
      `SELECT a.*, p.policy
       FROM agents a
       JOIN agent_policy_versions p ON p.policy_id = a.active_policy_id
       WHERE a.id = $1${forUpdate ? ' FOR UPDATE' : ''}`,
      [id]
    );
    return result.rows[0] || null;
  }

  private mapAgent(row: AgentRow): Agent {
    const policy = row.policy;
    if (!policy || policy.agentId !== row.id || policy.policyId !== row.active_policy_id) {
      throw new Error(`Stored policy is not bound to agent ${row.id}`);
    }

    return cloneAgent({
      id: row.id,
      ownerAddress: normalizeOwnerAddress(row.owner_address),
      name: row.name,
      description: row.description === null ? undefined : row.description,
      status: row.status,
      spendingPolicy: policy,
      walletAddress: row.wallet_address ? normalizeOwnerAddress(row.wallet_address) : undefined,
      metadata: row.metadata || undefined,
      createdAt: Number(row.created_at),
      updatedAt: Number(row.updated_at),
      statusReason: row.status_reason || undefined,
    });
  }

  public async createAgent(agent: Agent): Promise<Agent> {
    if (!agent || typeof agent !== 'object' || Array.isArray(agent)) {
      throw new InvalidAgentInputError('Agent must be a valid non-null object');
    }
    if (!isValidAgentId(agent.id)) {
      throw new InvalidAgentInputError(`Invalid agent ID format: ${agent.id}`);
    }
    const policyValidation = validatePolicyForStorage(agent.spendingPolicy, Date.now());
    if (!policyValidation.valid) {
      throw new InvalidAgentInputError(`Invalid spending policy: ${policyValidation.error}`);
    }
    if (agent.spendingPolicy.agentId !== agent.id) {
      throw new InvalidAgentInputError('Spending policy agentId does not match agent ID');
    }
    if (agent.metadata !== undefined) validateAgentMetadata(agent.metadata);

    const ownerAddress = normalizeOwnerAddress(agent.ownerAddress);
    const walletAddress = agent.walletAddress ? normalizeOwnerAddress(agent.walletAddress) : null;

    try {
      return await withDatabaseTransaction(async (client) => {
        await client.query(
          `INSERT INTO agents
             (id, owner_address, name, description, status, active_policy_id, wallet_address, metadata, created_at, updated_at, status_reason)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, $10, $11)`,
          [
            agent.id,
            ownerAddress,
            agent.name.trim(),
            agent.description ?? null,
            agent.status,
            agent.spendingPolicy.policyId,
            walletAddress,
            agent.metadata ? JSON.stringify(agent.metadata) : null,
            String(agent.createdAt),
            String(agent.updatedAt),
            agent.statusReason ?? null,
          ]
        );
        await client.query(
          `INSERT INTO agent_policy_versions (policy_id, agent_id, policy, created_at)
           VALUES ($1, $2, $3::jsonb, $4)`,
          [agent.spendingPolicy.policyId, agent.id, JSON.stringify(agent.spendingPolicy), String(agent.createdAt)]
        );
        const stored = await this.selectAgent(client, agent.id);
        if (!stored) throw new Error(`Agent creation did not return ${agent.id}`);
        return this.mapAgent(stored);
      });
    } catch (error: unknown) {
      if (isUniqueViolation(error)) throw new AgentAlreadyExistsError(agent.id);
      throw error;
    }
  }

  public async getAgentById(id: string): Promise<Agent | null> {
    if (typeof id !== 'string' || id.trim() === '') return null;
    const row = await this.selectAgent(this.db, id.trim());
    return row ? this.mapAgent(row) : null;
  }

  public async updateAgent(id: string, patch: UpdateAgentStorePatch): Promise<Agent> {
    return withDatabaseTransaction(async (client) => {
      const existingRow = await this.selectAgent(client, id, true);
      if (!existingRow) throw new AgentNotFoundError(id);
      const existing = this.mapAgent(existingRow);

      const rawPatch = patch as Record<string, unknown>;
      for (const immutable of ['id', 'ownerAddress', 'createdAt']) {
        if (immutable in rawPatch) throw new InvalidAgentInputError(`Cannot modify immutable field: ${immutable}`);
      }
      if (patch.name !== undefined && (patch.name.trim().length === 0 || patch.name.trim().length > 100)) {
        throw new InvalidAgentInputError('Agent name must be a non-empty string between 1 and 100 characters');
      }
      if (patch.description !== undefined && patch.description.length > 1000) {
        throw new InvalidAgentInputError('Agent description must be a string up to 1000 characters');
      }
      if (patch.metadata !== undefined) validateAgentMetadata(patch.metadata);

      const nextPolicy = patch.spendingPolicy || existing.spendingPolicy;
      if (patch.spendingPolicy) {
        const validation = validatePolicyForStorage(patch.spendingPolicy, Date.now());
        if (!validation.valid) throw new InvalidAgentInputError(`Invalid spending policy: ${validation.error}`);
        if (patch.spendingPolicy.agentId !== existing.id) {
          throw new InvalidAgentInputError('Updated spending policy agentId does not match agent ID');
        }
        await client.query(
          `INSERT INTO agent_policy_versions (policy_id, agent_id, policy, created_at)
           VALUES ($1, $2, $3::jsonb, $4)
           ON CONFLICT (policy_id) DO NOTHING`,
          [patch.spendingPolicy.policyId, existing.id, JSON.stringify(patch.spendingPolicy), String(Date.now())]
        );
      }

      const nextStatus = patch.status ?? existing.status;
      if (patch.status !== undefined) assertValidStateTransition(existing.status, patch.status);
      const updatedAt = Math.max(Date.now(), existing.updatedAt);
      await client.query(
        `UPDATE agents
         SET name = $2,
             description = $3,
             status = $4,
             active_policy_id = $5,
             wallet_address = $6,
             metadata = $7::jsonb,
             updated_at = $8,
             status_reason = $9
         WHERE id = $1`,
        [
          existing.id,
          patch.name !== undefined ? patch.name.trim() : existing.name,
          patch.description !== undefined ? patch.description : existing.description ?? null,
          nextStatus,
          nextPolicy.policyId,
          patch.walletAddress !== undefined
            ? normalizeOwnerAddress(patch.walletAddress)
            : existing.walletAddress ?? null,
          patch.metadata !== undefined ? JSON.stringify(patch.metadata) : existing.metadata ? JSON.stringify(existing.metadata) : null,
          String(updatedAt),
          patch.statusReason !== undefined ? patch.statusReason : existing.statusReason ?? null,
        ]
      );
      const updated = await this.selectAgent(client, existing.id);
      if (!updated) throw new AgentNotFoundError(existing.id);
      return this.mapAgent(updated);
    });
  }

  public async listAgents(filter?: ListAgentsFilter): Promise<Agent[]> {
    if (filter?.limit !== undefined && (!Number.isInteger(filter.limit) || filter.limit < 0 || filter.limit > 1000)) {
      throw new InvalidAgentInputError('limit must be an integer between 0 and 1000');
    }
    if (filter?.offset !== undefined && (!Number.isInteger(filter.offset) || filter.offset < 0)) {
      throw new InvalidAgentInputError('offset must be a non-negative integer');
    }

    const clauses: string[] = [];
    const values: unknown[] = [];
    if (filter?.ownerAddress) {
      values.push(normalizeOwnerAddress(filter.ownerAddress));
      clauses.push(`a.owner_address = $${values.length}`);
    }
    if (filter?.status) {
      values.push(filter.status);
      clauses.push(`a.status = $${values.length}`);
    }
    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    values.push(filter?.limit ?? 1000);
    const limitPlaceholder = `$${values.length}`;
    values.push(filter?.offset ?? 0);
    const offsetPlaceholder = `$${values.length}`;

    const result = await this.db.query<AgentRow>(
      `SELECT a.*, p.policy
       FROM agents a
       JOIN agent_policy_versions p ON p.policy_id = a.active_policy_id
       ${where}
       ORDER BY a.created_at ASC, a.id ASC
       LIMIT ${limitPlaceholder} OFFSET ${offsetPlaceholder}`,
      values
    );
    return result.rows.map((row) => this.mapAgent(row));
  }

  public async deleteAgent(id: string): Promise<boolean> {
    const result = await this.db.query('DELETE FROM agents WHERE id = $1', [id]);
    return (result.rowCount || 0) > 0;
  }

  /** Deliberately does not clear durable production state. Use SQL maintenance tooling explicitly. */
  public clear(): void {
    // IAgentStore historically exposes clear for in-memory test isolation.
    // A durable store must not provide an accidental destructive operation.
  }
}
