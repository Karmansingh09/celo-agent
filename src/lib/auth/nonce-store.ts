import { generateSiweNonce } from 'viem/siwe';
import { INonceStore, NonceRecord } from './types';

/**
 * Phase 7.4: In-Memory Nonce Storage
 * 
 * Provides atomic generation, storage, and one-time consumption of SIWE nonces.
 * 
 * ARCHITECTURE & DEPLOYMENT LIMITATIONS:
 * 1. Process-Local & Non-Durable:
 *    - Nonces are held ephemerally in a JavaScript Map collection.
 *    - Server restarts or crashes wipe active nonces; in-flight verifications will fail.
 * 2. Multi-Instance / Serverless Limitation:
 *    - Memory is NOT shared across multiple server containers or serverless instances (e.g. Vercel Lambdas).
 *    - If a client requests a nonce from Instance A and sends verification to Instance B, Instance B
 *      will not have the nonce and will reject the request.
 * 3. Production Requirement:
 *    - Multi-instance deployments MUST back INonceStore with a shared low-latency cache
 *      (e.g. Redis SET key val EX 300 NX) to ensure atomic cross-instance nonce consumption.
 */
export class InMemoryNonceStore implements INonceStore {
  private readonly nonces: Map<string, NonceRecord> = new Map();

  constructor(
    private readonly defaultTtlMs: number = 300_000, // 5 minutes
    private readonly clock: () => number = () => Date.now(),
    private readonly maxCapacity: number = 10_000
  ) {}

  /**
   * Returns current count of stored nonces.
   */
  public get size(): number {
    return this.nonces.size;
  }

  /**
   * Generates, stores, and returns an EIP-4361 compliant cryptographically secure nonce.
   * Opportunistically prunes expired nonces and enforces max capacity with safe deterministic eviction.
   */
  public async issueNonce(ttlMs?: number): Promise<string> {
    // Opportunistic cleanup of expired nonces before issuing new ones
    await this.cleanup();

    // Enforce hard maximum capacity: if still at or above capacity, evict oldest entries by createdAt
    if (this.nonces.size >= this.maxCapacity) {
      const excess = this.nonces.size - this.maxCapacity + 1;
      const sorted = Array.from(this.nonces.entries()).sort(
        (a, b) => a[1].createdAt - b[1].createdAt
      );
      for (let i = 0; i < excess && i < sorted.length; i++) {
        this.nonces.delete(sorted[i][0]);
      }
    }

    const nonce = generateSiweNonce();
    const now = this.clock();
    const ttl = ttlMs !== undefined && ttlMs > 0 ? ttlMs : this.defaultTtlMs;

    this.nonces.set(nonce, {
      nonce,
      createdAt: now,
      expiresAt: now + ttl,
    });

    return nonce;
  }

  /**
   * Atomically verifies and consumes a nonce.
   * Single-turn synchronous deletion on the Node.js event loop guarantees that concurrent
   * verification attempts using the same challenge cannot both succeed.
   */
  public async consumeNonce(nonce: string): Promise<boolean> {
    if (!nonce || typeof nonce !== 'string') {
      return false;
    }

    const trimmed = nonce.trim();
    const entry = this.nonces.get(trimmed);
    if (!entry) {
      return false;
    }

    // Atomic consumption: immediately delete prior to any other evaluation
    this.nonces.delete(trimmed);

    const now = this.clock();
    if (now > entry.expiresAt) {
      return false;
    }

    return true;
  }

  /**
   * Prunes expired nonces from memory.
   */
  public async cleanup(): Promise<number> {
    const now = this.clock();
    let pruned = 0;
    for (const [nonce, record] of this.nonces.entries()) {
      if (now > record.expiresAt) {
        this.nonces.delete(nonce);
        pruned++;
      }
    }
    return pruned;
  }

  /**
   * Clears all stored nonces (test suite isolation).
   */
  public clear(): void {
    this.nonces.clear();
  }
}
