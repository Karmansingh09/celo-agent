/**
 * Phase 7.4: SIWE Wallet Authentication & Session Management Types
 */

/**
 * Standard HTTP cache-control headers preventing caching of authentication endpoints.
 */
export const AUTH_CACHE_HEADERS = {
  'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
  Pragma: 'no-cache',
  Expires: '0',
} as const;

/**
 * Domain error representing missing, expired, or invalid authentication credentials.
 */
export class AuthenticationError extends Error {
  public override readonly name: string = 'AuthenticationError';
  constructor(message: string = 'Authentication required') {
    super(message);
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/**
 * Domain error representing missing, expired, unknown, or previously consumed nonces.
 */
export class InvalidNonceError extends AuthenticationError {
  public override readonly name: string = 'InvalidNonceError';
  constructor(message: string = 'Invalid, expired, or previously consumed nonce') {
    super(message);
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/**
 * Domain error representing Cross-Site Request Forgery (CSRF) validation failures.
 */
export class CsrfError extends Error {
  public readonly name = 'CsrfError';
  constructor(message: string = 'CSRF validation failed: untrusted or missing origin') {
    super(message);
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/**
 * Server configuration for SIWE and session verification.
 */
export interface AuthConfig {
  /** Trusted application origin (e.g. "http://localhost:3000" or "https://celo-agent.example.com") */
  expectedOrigin: string;
  /** Expected domain for SIWE messages (e.g. "localhost:3000" or "celo-agent.example.com") */
  expectedDomain: string;
  /** Expected Celo chain ID (e.g. 11142220 for Celo Sepolia Testnet, 42220 for Mainnet) */
  expectedChainId: number;
  /** Nonce time-to-live in milliseconds (default: 300,000 ms / 5 minutes) */
  nonceTtlMs?: number;
  /** Session time-to-live in milliseconds (default: 86,400,000 ms / 24 hours) */
  sessionTtlMs?: number;
  /** Maximum clock skew tolerance in milliseconds for issuedAt/expirationTime (default: 60,000 ms) */
  clockToleranceMs?: number;
}

/**
 * Authenticated session entity.
 */
export interface AuthSession {
  /** SHA-256 hash of the session token used as the internal lookup key */
  tokenHash: string;
  /** Checksummed EVM address of the authenticated wallet owner */
  ownerAddress: string;
  /** Session creation timestamp in milliseconds */
  createdAt: number;
  /** Session expiration timestamp in milliseconds */
  expiresAt: number;
}

/**
 * Input submitted to the SIWE verification endpoint.
 */
export interface VerifySiweInput {
  /** Standard EIP-4361 formatted message string */
  message: string;
  /** Hex-encoded EIP-191 personal signature */
  signature: `0x${string}` | string;
}

/**
 * Result returned upon successful SIWE verification.
 */
export interface VerifySiweResult {
  session: AuthSession;
  rawSessionToken: string;
}

/**
 * Nonce record in storage.
 */
export interface NonceRecord {
  nonce: string;
  createdAt: number;
  expiresAt: number;
}

/**
 * Interface for server-side nonce storage and atomic consumption.
 */
export interface INonceStore {
  /**
   * Generates, persists, and returns a cryptographically secure, short-lived nonce.
   */
  issueNonce(ttlMs?: number): Promise<string>;

  /**
   * Atomically verifies and consumes a nonce.
   * Returns true ONLY on the first successful consumption before expiration.
   * Returns false if the nonce is missing, expired, unknown, or already consumed.
   */
  consumeNonce(nonce: string): Promise<boolean>;

  /**
   * Prunes expired nonces from storage.
   */
  cleanup(): Promise<number>;

  /**
   * Clears all nonces (used primarily for test isolation).
   */
  clear(): void;
}

/**
 * Interface for server-side session management.
 */
export interface ISessionStore {
  /**
   * Creates and stores an authenticated session for an owner address.
   * Stores a SHA-256 hash of the session token; returns the raw token to set in the cookie.
   */
  createSession(ownerAddress: string, ttlMs?: number): Promise<{ session: AuthSession; rawSessionToken: string }>;

  /**
   * Retrieves an active session by raw session token (hashes token before lookup).
   * Returns null if missing or expired.
   */
  getSession(rawSessionToken: string): Promise<AuthSession | null>;

  /**
   * Explicitly deletes an active session by raw session token.
   */
  deleteSession(rawSessionToken: string): Promise<boolean>;

  /**
   * Prunes expired sessions from storage.
   */
  cleanup(): Promise<number>;

  /**
   * Clears all sessions (used primarily for test isolation).
   */
  clear(): void;
}
