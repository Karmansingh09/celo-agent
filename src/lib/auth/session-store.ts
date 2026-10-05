import { randomBytes, createHash } from 'node:crypto';
import { normalizeOwnerAddress } from '../agent/types';
import { ISessionStore, AuthSession } from './types';

/**
 * Phase 7.4: In-Memory Session Storage
 * 
 * Manages authenticated user sessions using SHA-256 hashed lookup tokens.
 * 
 * SECURITY CONTRACT:
 * 1. Opaque Random Tokens:
 *    - Session tokens are generated with 256 bits of cryptographic entropy (`randomBytes(32)`).
 * 2. Token Hashing at Rest:
 *    - To protect against in-memory dumps or heap inspection, raw session tokens are NEVER
 *      stored in the session store. Only their SHA-256 digests (`tokenHash`) are stored.
 *    - The raw token is returned to the caller once to set in the `HttpOnly` cookie.
 * 3. Never Returned in JSON:
 *    - Session tokens are strictly restricted to HTTP cookies and never returned in response payloads.
 * 
 * DEPLOYMENT & CONCURRENCY LIMITATIONS:
 * 1. Process-Local & Non-Durable:
 *    - Sessions reside ephemerally in a JavaScript Map.
 *    - Server restarts or deployments invalidate all active sessions, requiring users to log in again.
 * 2. Multi-Instance / Serverless Limitation:
 *    - Sessions are NOT synchronized across independent serverless instances (e.g. Vercel Lambdas).
 * 3. Production Requirement:
 *    - Multi-instance deployments MUST back ISessionStore with a persistent, shared session store
 *      (e.g. Redis or database) with strict TTL eviction.
 */
export class InMemorySessionStore implements ISessionStore {
  /** Map storing active sessions keyed by SHA-256 token hash */
  private readonly sessions: Map<string, AuthSession> = new Map();

  constructor(
    private readonly defaultTtlMs: number = 86_400_000, // 24 hours
    private readonly clock: () => number = () => Date.now(),
    private readonly maxCapacity: number = 10_000
  ) {}

  /**
   * Returns current count of stored sessions.
   */
  public get size(): number {
    return this.sessions.size;
  }

  /**
   * Hashes a raw session token using SHA-256.
   */
  private hashToken(rawToken: string): string {
    return createHash('sha256').update(rawToken).digest('hex');
  }

  /**
   * Creates and stores an authenticated session for an owner address.
   * Opportunistically prunes expired sessions and enforces max capacity with safe deterministic eviction.
   * Generates a 256-bit random token, hashes it for storage, and returns both the session entity and raw token.
   */
  public async createSession(
    ownerAddress: string,
    ttlMs?: number
  ): Promise<{ session: AuthSession; rawSessionToken: string }> {
    // Opportunistic cleanup of expired sessions before creating new one
    await this.cleanup();

    // Enforce hard maximum capacity: if still at or above capacity, evict oldest entries by createdAt
    if (this.sessions.size >= this.maxCapacity) {
      const excess = this.sessions.size - this.maxCapacity + 1;
      const sorted = Array.from(this.sessions.entries()).sort(
        (a, b) => a[1].createdAt - b[1].createdAt
      );
      for (let i = 0; i < excess && i < sorted.length; i++) {
        this.sessions.delete(sorted[i][0]);
      }
    }

    const normalizedOwner = normalizeOwnerAddress(ownerAddress);
    const rawSessionToken = randomBytes(32).toString('hex');
    const tokenHash = this.hashToken(rawSessionToken);

    const now = this.clock();
    const ttl = ttlMs !== undefined && ttlMs > 0 ? ttlMs : this.defaultTtlMs;

    const session: AuthSession = {
      tokenHash,
      ownerAddress: normalizedOwner,
      createdAt: now,
      expiresAt: now + ttl,
    };

    this.sessions.set(tokenHash, session);

    return {
      session: { ...session },
      rawSessionToken,
    };
  }

  /**
   * Retrieves an active session by raw session token.
   * Hashes the raw token before lookup. Returns null if missing or expired.
   */
  public async getSession(rawSessionToken: string): Promise<AuthSession | null> {
    if (!rawSessionToken || typeof rawSessionToken !== 'string') {
      return null;
    }

    const trimmed = rawSessionToken.trim();
    if (trimmed.length === 0) {
      return null;
    }

    const tokenHash = this.hashToken(trimmed);
    const session = this.sessions.get(tokenHash);
    if (!session) {
      return null;
    }

    const now = this.clock();
    if (now > session.expiresAt) {
      this.sessions.delete(tokenHash);
      return null;
    }

    return { ...session };
  }

  /**
   * Explicitly deletes an active session by raw session token (used during logout).
   */
  public async deleteSession(rawSessionToken: string): Promise<boolean> {
    if (!rawSessionToken || typeof rawSessionToken !== 'string') {
      return false;
    }

    const trimmed = rawSessionToken.trim();
    if (trimmed.length === 0) {
      return false;
    }

    const tokenHash = this.hashToken(trimmed);
    return this.sessions.delete(tokenHash);
  }

  /**
   * Prunes expired sessions from memory.
   */
  public async cleanup(): Promise<number> {
    const now = this.clock();
    let pruned = 0;
    for (const [hash, session] of this.sessions.entries()) {
      if (now > session.expiresAt) {
        this.sessions.delete(hash);
        pruned++;
      }
    }
    return pruned;
  }

  /**
   * Clears all stored sessions (test suite isolation).
   */
  public clear(): void {
    this.sessions.clear();
  }
}
