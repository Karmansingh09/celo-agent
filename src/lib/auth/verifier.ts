import { parseSiweMessage, validateSiweMessage, SiweMessage } from 'viem/siwe';
import { verifyMessage, isAddress, isHex } from 'viem';
import { normalizeOwnerAddress } from '../agent/types';
import {
  AuthConfig,
  AuthSession,
  INonceStore,
  ISessionStore,
  VerifySiweInput,
  VerifySiweResult,
  AuthenticationError,
  InvalidNonceError,
  CsrfError,
} from './types';

/**
 * Phase 7.4: SIWE Authentication & Verification Service
 * 
 * Provides end-to-end orchestration for EIP-4361 SIWE challenge-response verification,
 * atomic nonce consumption, CSRF protection, and session lifecycle management.
 */
export class AuthService {
  private readonly expectedOrigin: string;
  private readonly expectedDomain: string;
  private readonly expectedChainId: number;
  private readonly nonceTtlMs: number;
  private readonly sessionTtlMs: number;
  private readonly clockToleranceMs: number;

  constructor(
    private readonly nonceStore: INonceStore,
    private readonly sessionStore: ISessionStore,
    config: AuthConfig,
    private readonly clock: () => number = () => Date.now()
  ) {
    if (!config.expectedOrigin || typeof config.expectedOrigin !== 'string') {
      throw new Error('AuthConfig.expectedOrigin must be a non-empty string');
    }
    if (!config.expectedDomain || typeof config.expectedDomain !== 'string') {
      throw new Error('AuthConfig.expectedDomain must be a non-empty string');
    }
    if (!config.expectedChainId || typeof config.expectedChainId !== 'number') {
      throw new Error('AuthConfig.expectedChainId must be a valid number');
    }

    // Normalize origin to lowercase protocol + host + port
    this.expectedOrigin = new URL(config.expectedOrigin).origin.toLowerCase();
    this.expectedDomain = config.expectedDomain.trim().toLowerCase();
    this.expectedChainId = config.expectedChainId;
    this.nonceTtlMs = config.nonceTtlMs ?? 300_000; // 5 minutes
    this.sessionTtlMs = config.sessionTtlMs ?? 86_400_000; // 24 hours
    this.clockToleranceMs = config.clockToleranceMs ?? 60_000; // 1 minute
  }

  /**
   * Generates a new cryptographically random, short-lived nonce for SIWE challenge.
   */
  public async issueNonce(): Promise<string> {
    return this.nonceStore.issueNonce(this.nonceTtlMs);
  }

  /**
   * Verifies an EIP-4361 SIWE message and its EIP-191 personal signature.
   * Atomically consumes the nonce to eliminate replay vulnerabilities.
   * On success, establishes a new 24-hour authenticated session.
   */
  public async verifySiwe(input: VerifySiweInput): Promise<VerifySiweResult> {
    if (!input || typeof input !== 'object' || Array.isArray(input)) {
      throw new AuthenticationError('Invalid verification payload: must be an object');
    }

    if (typeof input.message !== 'string' || input.message.trim().length === 0) {
      throw new AuthenticationError('SIWE message must be a non-empty string');
    }

    if (typeof input.signature !== 'string' || !isHex(input.signature)) {
      throw new AuthenticationError('Signature must be a valid hex-encoded string');
    }

    // Step 1: Parse SIWE message structure
    let parsed: ReturnType<typeof parseSiweMessage>;
    try {
      parsed = parseSiweMessage(input.message);
    } catch {
      throw new AuthenticationError('Malformed EIP-4361 SIWE message format');
    }

    if (!parsed.domain || !parsed.address || !parsed.nonce || !parsed.chainId || !parsed.uri) {
      throw new AuthenticationError('SIWE message is missing required EIP-4361 fields');
    }

    // Step 2: Validate domain binding
    if (parsed.domain.toLowerCase() !== this.expectedDomain) {
      throw new AuthenticationError(
        `SIWE domain mismatch: expected "${this.expectedDomain}", received "${parsed.domain.toLowerCase()}"`
      );
    }

    // Step 3: Validate URI binding
    let messageUriOrigin: string;
    try {
      messageUriOrigin = new URL(parsed.uri).origin.toLowerCase();
    } catch {
      throw new AuthenticationError(`Invalid URI in SIWE message: ${parsed.uri}`);
    }

    if (messageUriOrigin !== this.expectedOrigin) {
      throw new AuthenticationError(
        `SIWE URI mismatch: expected origin "${this.expectedOrigin}", received "${messageUriOrigin}"`
      );
    }

    // Step 4: Validate Chain ID binding
    if (parsed.chainId !== this.expectedChainId) {
      throw new AuthenticationError(
        `SIWE chain ID mismatch: expected ${this.expectedChainId}, received ${parsed.chainId}`
      );
    }

    // Step 5: Validate Address syntax
    if (!isAddress(parsed.address)) {
      throw new AuthenticationError(`Invalid Ethereum address in SIWE message: ${parsed.address}`);
    }

    // Step 6: Atomic Nonce Consumption (Replay Protection)
    const nonceConsumed = await this.nonceStore.consumeNonce(parsed.nonce);
    if (!nonceConsumed) {
      throw new InvalidNonceError('Invalid, expired, or previously consumed nonce');
    }

    // Step 7: Temporal validation
    const now = this.clock();

    if (parsed.issuedAt) {
      const issuedAtMs = new Date(parsed.issuedAt).getTime();
      if (Number.isNaN(issuedAtMs)) {
        throw new AuthenticationError('Invalid issuedAt timestamp in SIWE message');
      }
      if (issuedAtMs > now + this.clockToleranceMs) {
        throw new AuthenticationError('SIWE message issuedAt cannot be in the future');
      }
      if (issuedAtMs < now - this.nonceTtlMs - this.clockToleranceMs) {
        throw new AuthenticationError('SIWE message issuedAt has expired');
      }
    }

    if (parsed.expirationTime) {
      const expMs = new Date(parsed.expirationTime).getTime();
      if (Number.isNaN(expMs)) {
        throw new AuthenticationError('Invalid expirationTime timestamp in SIWE message');
      }
      if (expMs <= now) {
        throw new AuthenticationError('SIWE message has expired');
      }
    }

    if (parsed.notBefore) {
      const nbMs = new Date(parsed.notBefore).getTime();
      if (Number.isNaN(nbMs)) {
        throw new AuthenticationError('Invalid notBefore timestamp in SIWE message');
      }
      if (nbMs > now + this.clockToleranceMs) {
        throw new AuthenticationError('SIWE message is not yet valid (notBefore in future)');
      }
    }

    // Step 8: Additional standard EIP-4361 validation
    const standardValid = validateSiweMessage({
      message: parsed,
      domain: this.expectedDomain,
      nonce: parsed.nonce,
      time: new Date(now),
    });

    if (!standardValid) {
      throw new AuthenticationError('SIWE message validation failed standard EIP-4361 constraints');
    }

    // Step 9: Verify cryptographic signature (local ecrecover without RPC)
    let signatureValid = false;
    try {
      signatureValid = await verifyMessage({
        address: parsed.address,
        message: input.message,
        signature: input.signature as `0x${string}`,
      });
    } catch {
      throw new AuthenticationError('Cryptographic signature verification failed');
    }

    if (!signatureValid) {
      throw new AuthenticationError('Cryptographic signature does not match claimed address');
    }

    // Step 10: Create authenticated session (storing SHA-256 hash of token)
    const normalizedOwner = normalizeOwnerAddress(parsed.address);
    const { session, rawSessionToken } = await this.sessionStore.createSession(
      normalizedOwner,
      this.sessionTtlMs
    );

    return {
      session,
      rawSessionToken,
    };
  }

  /**
   * Asserts that an incoming state-changing request originates from the trusted application origin.
   * Fails closed: rejects if Origin/Referer is missing or does not match the configured expected origin.
   */
  public assertValidOrigin(req: Request): void {
    const method = req.method.toUpperCase();
    // Safe read methods are exempt from CSRF rejection
    if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') {
      return;
    }

    const originHeader = req.headers.get('origin');
    const refererHeader = req.headers.get('referer');

    let incomingOrigin: string | null = null;
    if (originHeader) {
      try {
        incomingOrigin = new URL(originHeader).origin.toLowerCase();
      } catch {
        throw new CsrfError(`Malformed Origin header: ${originHeader}`);
      }
    } else if (refererHeader) {
      try {
        incomingOrigin = new URL(refererHeader).origin.toLowerCase();
      } catch {
        throw new CsrfError(`Malformed Referer header: ${refererHeader}`);
      }
    }

    if (!incomingOrigin) {
      throw new CsrfError('CSRF protection: missing Origin and Referer headers on state-changing request');
    }

    if (incomingOrigin !== this.expectedOrigin) {
      throw new CsrfError(
        `CSRF protection: origin mismatch (expected "${this.expectedOrigin}", received "${incomingOrigin}")`
      );
    }
  }

  /**
   * Extracts the session cookie, queries the session store, and returns the verified owner address.
   * Throws AuthenticationError if session is missing, invalid, or expired.
   * 
   * TRUST INVARIANT:
   * Identity is derived EXCLUSIVELY from the verified session. Request bodies and query parameters
   * are NEVER inspected for identity proof.
   */
  public async getAuthenticatedOwnerAddress(req: Request): Promise<string> {
    const rawSessionToken = this.extractSessionTokenFromRequest(req);
    if (!rawSessionToken) {
      throw new AuthenticationError('Authentication required: missing session credentials');
    }

    const session = await this.sessionStore.getSession(rawSessionToken);
    if (!session) {
      throw new AuthenticationError('Authentication required: invalid or expired session');
    }

    return session.ownerAddress;
  }

  /**
   * Invalidates the active session in storage upon user logout.
   */
  public async logout(req: Request): Promise<boolean> {
    const rawSessionToken = this.extractSessionTokenFromRequest(req);
    if (!rawSessionToken) {
      return false;
    }
    return this.sessionStore.deleteSession(rawSessionToken);
  }

  /**
   * Helper to parse the raw session token from the `Cookie` header.
   */
  public extractSessionTokenFromRequest(req: Request): string | null {
    const cookieHeader = req.headers.get('cookie');
    if (!cookieHeader) {
      return null;
    }

    const cookies = cookieHeader.split(';');
    for (const cookie of cookies) {
      const [name, ...rest] = cookie.trim().split('=');
      if (name === 'celo_agent_session') {
        const val = rest.join('=').trim();
        return val.length > 0 ? val : null;
      }
    }

    return null;
  }

  /**
   * Generates the Set-Cookie header value for establishing an authenticated session.
   */
  public createSessionCookieHeader(rawSessionToken: string, isProduction: boolean = process.env.NODE_ENV === 'production'): string {
    const maxAgeSeconds = Math.floor(this.sessionTtlMs / 1000);
    const parts = [
      `celo_agent_session=${rawSessionToken}`,
      'Path=/',
      `Max-Age=${maxAgeSeconds}`,
      'HttpOnly',
      'SameSite=Lax',
    ];

    if (isProduction) {
      parts.push('Secure');
    }

    return parts.join('; ');
  }

  /**
   * Generates the Set-Cookie header value for destroying an authenticated session.
   */
  public createClearCookieHeader(isProduction: boolean = process.env.NODE_ENV === 'production'): string {
    const parts = [
      'celo_agent_session=',
      'Path=/',
      'Max-Age=0',
      'Expires=Thu, 01 Jan 1970 00:00:00 GMT',
      'HttpOnly',
      'SameSite=Lax',
    ];

    if (isProduction) {
      parts.push('Secure');
    }

    return parts.join('; ');
  }
}
