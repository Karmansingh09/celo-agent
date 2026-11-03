import 'server-only';

import { createHash, randomBytes } from 'node:crypto';
import { Pool } from 'pg';
import { generateSiweNonce } from 'viem/siwe';
import { normalizeOwnerAddress } from '../agent/types';
import { getDatabasePool, withDatabaseTransaction } from '../db/postgres';
import { AuthSession, INonceStore, ISessionStore, NonceRecord } from './types';

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** Durable one-time SIWE nonce store. Consumption is a single SQL DELETE. */
export class PostgresNonceStore implements INonceStore {
  constructor(
    private readonly db: Pool = getDatabasePool(),
    private readonly defaultTtlMs = 300_000,
    private readonly clock: () => number = () => Date.now(),
    private readonly maxCapacity = 10_000
  ) {}

  public async issueNonce(ttlMs?: number): Promise<string> {
    const nonce = generateSiweNonce();
    const now = this.clock();
    const ttl = ttlMs !== undefined && ttlMs > 0 ? ttlMs : this.defaultTtlMs;
    await withDatabaseTransaction(async (client) => {
      await client.query(`DELETE FROM auth_nonces WHERE expires_at < $1`, [String(now)]);
      await client.query(
        `DELETE FROM auth_nonces WHERE nonce IN (
           SELECT nonce FROM auth_nonces ORDER BY created_at ASC LIMIT GREATEST((SELECT COUNT(*) FROM auth_nonces) - $1 + 1, 0)
         )`,
        [this.maxCapacity]
      );
      await client.query(`INSERT INTO auth_nonces (nonce, created_at, expires_at) VALUES ($1, $2, $3)`, [nonce, String(now), String(now + ttl)]);
    });
    return nonce;
  }

  public async consumeNonce(nonce: string): Promise<boolean> {
    if (!nonce?.trim()) return false;
    const result = await this.db.query(`DELETE FROM auth_nonces WHERE nonce = $1 AND expires_at >= $2`, [nonce.trim(), String(this.clock())]);
    return (result.rowCount || 0) === 1;
  }

  public async cleanup(): Promise<number> {
    const result = await this.db.query(`DELETE FROM auth_nonces WHERE expires_at < $1`, [String(this.clock())]);
    return result.rowCount || 0;
  }

  public clear(): void {
    // Durable auth state is intentionally not cleared through the application API.
  }
}

/** Durable session store. Only SHA-256 token digests are persisted. */
export class PostgresSessionStore implements ISessionStore {
  constructor(
    private readonly db: Pool = getDatabasePool(),
    private readonly defaultTtlMs = 86_400_000,
    private readonly clock: () => number = () => Date.now(),
    private readonly maxCapacity = 10_000
  ) {}

  private mapSession(row: { token_hash: string; owner_address: string; created_at: string; expires_at: string }): AuthSession {
    return {
      tokenHash: row.token_hash,
      ownerAddress: normalizeOwnerAddress(row.owner_address),
      createdAt: Number(row.created_at),
      expiresAt: Number(row.expires_at),
    };
  }

  public async createSession(ownerAddress: string, ttlMs?: number): Promise<{ session: AuthSession; rawSessionToken: string }> {
    const normalizedOwner = normalizeOwnerAddress(ownerAddress);
    const rawSessionToken = randomBytes(32).toString('hex');
    const tokenHash = hashToken(rawSessionToken);
    const now = this.clock();
    const ttl = ttlMs !== undefined && ttlMs > 0 ? ttlMs : this.defaultTtlMs;
    const session = await withDatabaseTransaction(async (client) => {
      await client.query(`DELETE FROM auth_sessions WHERE expires_at < $1`, [String(now)]);
      await client.query(
        `DELETE FROM auth_sessions WHERE token_hash IN (
           SELECT token_hash FROM auth_sessions ORDER BY created_at ASC LIMIT GREATEST((SELECT COUNT(*) FROM auth_sessions) - $1 + 1, 0)
         )`,
        [this.maxCapacity]
      );
      const result = await client.query<{ token_hash: string; owner_address: string; created_at: string; expires_at: string }>(
        `INSERT INTO auth_sessions (token_hash, owner_address, created_at, expires_at)
         VALUES ($1, $2, $3, $4)
         RETURNING token_hash, owner_address, created_at::text, expires_at::text`,
        [tokenHash, normalizedOwner, String(now), String(now + ttl)]
      );
      return this.mapSession(result.rows[0]);
    });
    return { session, rawSessionToken };
  }

  public async getSession(rawSessionToken: string): Promise<AuthSession | null> {
    if (!rawSessionToken?.trim()) return null;
    const result = await this.db.query<{ token_hash: string; owner_address: string; created_at: string; expires_at: string }>(
      `SELECT token_hash, owner_address, created_at::text, expires_at::text
       FROM auth_sessions WHERE token_hash = $1 AND expires_at >= $2`,
      [hashToken(rawSessionToken.trim()), String(this.clock())]
    );
    return result.rows[0] ? this.mapSession(result.rows[0]) : null;
  }

  public async deleteSession(rawSessionToken: string): Promise<boolean> {
    if (!rawSessionToken?.trim()) return false;
    const result = await this.db.query(`DELETE FROM auth_sessions WHERE token_hash = $1`, [hashToken(rawSessionToken.trim())]);
    return (result.rowCount || 0) === 1;
  }

  public async cleanup(): Promise<number> {
    const result = await this.db.query(`DELETE FROM auth_sessions WHERE expires_at < $1`, [String(this.clock())]);
    return result.rowCount || 0;
  }

  public clear(): void {
    // Durable auth state is intentionally not cleared through the application API.
  }
}

export type DurableNonceRecord = NonceRecord;
