import { describe, it, expect, beforeEach } from 'vitest';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { createSiweMessage } from 'viem/siwe';
import {
  AuthService,
  InMemoryNonceStore,
  InMemorySessionStore,
  AuthenticationError,
  InvalidNonceError,
  CsrfError,
  AuthConfig,
  getNonceStore,
  getSessionStore,
} from '../src/lib/auth';
import { GET as getNonceRoute } from '../src/app/api/auth/nonce/route';
import { POST as verifyRoute } from '../src/app/api/auth/verify/route';
import { GET as sessionRoute } from '../src/app/api/auth/session/route';
import { POST as logoutRoute } from '../src/app/api/auth/logout/route';

describe('Phase 7.4: SIWE Wallet Authentication & Session Management', () => {
  let nonceStore: InMemoryNonceStore;
  let sessionStore: InMemorySessionStore;
  let authService: AuthService;
  let currentTime: number;

  const baseTime = Date.parse('2026-10-04T12:00:00.000Z');
  const expectedOrigin = 'http://localhost:3000';
  const expectedDomain = 'localhost:3000';
  const expectedChainId = 11142220; // Celo Sepolia Testnet

  const testConfig: AuthConfig = {
    expectedOrigin,
    expectedDomain,
    expectedChainId,
    nonceTtlMs: 300_000, // 5 minutes
    sessionTtlMs: 86_400_000, // 24 hours
    clockToleranceMs: 60_000, // 1 minute
  };

  // Test wallet accounts (offline, in-memory)
  const walletAccount1 = privateKeyToAccount(generatePrivateKey());
  const walletAccount2 = privateKeyToAccount(generatePrivateKey());

  beforeEach(() => {
    currentTime = baseTime;
    nonceStore = new InMemoryNonceStore(300_000, () => currentTime);
    sessionStore = new InMemorySessionStore(86_400_000, () => currentTime);
    authService = new AuthService(nonceStore, sessionStore, testConfig, () => currentTime);

    // Clear singleton stores used by route tests
    getNonceStore().clear();
    getSessionStore().clear();
  });

  describe('1. Nonce Storage, Expiration, and Atomic Consumption', () => {
    it('issues cryptographically random, short-lived nonces', async () => {
      const nonce1 = await nonceStore.issueNonce();
      const nonce2 = await nonceStore.issueNonce();

      expect(typeof nonce1).toBe('string');
      expect(nonce1.length).toBeGreaterThanOrEqual(8);
      expect(nonce1).not.toBe(nonce2);
    });

    it('consumes a valid nonce successfully on the first attempt', async () => {
      const nonce = await nonceStore.issueNonce();
      const consumed = await nonceStore.consumeNonce(nonce);
      expect(consumed).toBe(true);
    });

    it('rejects previously consumed nonces (replay protection)', async () => {
      const nonce = await nonceStore.issueNonce();
      const first = await nonceStore.consumeNonce(nonce);
      expect(first).toBe(true);

      // Second attempt to consume same nonce must fail
      const second = await nonceStore.consumeNonce(nonce);
      expect(second).toBe(false);
    });

    it('rejects expired nonces', async () => {
      const nonce = await nonceStore.issueNonce(60_000); // 1 minute TTL
      currentTime = baseTime + 60_001; // Advance past TTL

      const consumed = await nonceStore.consumeNonce(nonce);
      expect(consumed).toBe(false);
    });

    it('rejects unknown or invalid nonces', async () => {
      expect(await nonceStore.consumeNonce('unknown_nonce_123')).toBe(false);
      expect(await nonceStore.consumeNonce('')).toBe(false);
      expect(await nonceStore.consumeNonce('   ')).toBe(false);
    });

    it('ensures simultaneous concurrent verification attempts cannot both succeed (atomic race safety)', async () => {
      const nonce = await nonceStore.issueNonce();

      // Launch 5 simultaneous parallel consumption attempts
      const results = await Promise.all([
        nonceStore.consumeNonce(nonce),
        nonceStore.consumeNonce(nonce),
        nonceStore.consumeNonce(nonce),
        nonceStore.consumeNonce(nonce),
        nonceStore.consumeNonce(nonce),
      ]);

      const successful = results.filter((r) => r === true);
      const failed = results.filter((r) => r === false);

      expect(successful).toHaveLength(1);
      expect(failed).toHaveLength(4);
    });

    it('cleans up expired nonces', async () => {
      await nonceStore.issueNonce(10_000);
      await nonceStore.issueNonce(10_000);
      currentTime = baseTime + 20_000;

      const pruned = await nonceStore.cleanup();
      expect(pruned).toBe(2);
    });

    it('opportunistically cleans up expired nonces during issueNonce', async () => {
      // Issue nonces with 10s TTL
      await nonceStore.issueNonce(10_000);
      await nonceStore.issueNonce(10_000);
      expect(nonceStore.size).toBe(2);

      // Advance time past expiration
      currentTime = baseTime + 20_000;

      // Issuing a new nonce triggers opportunistic cleanup of expired ones
      await nonceStore.issueNonce(10_000);
      expect(nonceStore.size).toBe(1);
    });

    it('enforces hard maximum capacity by pruning expired nonces first and evicting oldest remaining', async () => {
      const boundedStore = new InMemoryNonceStore(300_000, () => currentTime, 3);

      // Insert 3 nonces at t = 0, 1000, 2000
      currentTime = baseTime;
      const n1 = await boundedStore.issueNonce(10_000); // expires at baseTime + 10_000
      currentTime = baseTime + 1_000;
      const n2 = await boundedStore.issueNonce(100_000); // expires at baseTime + 101_000
      currentTime = baseTime + 2_000;
      const n3 = await boundedStore.issueNonce(100_000); // expires at baseTime + 102_000

      expect(boundedStore.size).toBe(3);

      // Advance past n1 expiration (t = baseTime + 15_000)
      currentTime = baseTime + 15_000;

      // Issuing 4th nonce: n1 is expired and should be cleaned up first, preserving n2 and n3
      await boundedStore.issueNonce(100_000);
      expect(boundedStore.size).toBe(3);
      expect(await boundedStore.consumeNonce(n1)).toBe(false); // was expired and pruned
      expect(await boundedStore.consumeNonce(n2)).toBe(true); // preserved

      // Now re-fill: size is 2 (n3 and the 4th nonce). Issue 5th nonce.
      currentTime = baseTime + 20_000;
      const n5 = await boundedStore.issueNonce(100_000);
      expect(boundedStore.size).toBe(3); // n3, n4, n5

      // All 3 (n3, n4, n5) are unexpired. Issuing n6 must evict the oldest remaining (n3, createdAt baseTime + 2_000)
      currentTime = baseTime + 25_000;
      const n6 = await boundedStore.issueNonce(100_000);
      expect(boundedStore.size).toBe(3);
      expect(await boundedStore.consumeNonce(n3)).toBe(false); // evicted as oldest
      expect(await boundedStore.consumeNonce(n5)).toBe(true); // preserved
      expect(await boundedStore.consumeNonce(n6)).toBe(true); // preserved
    });
  });

  describe('2. Session Storage & Token Hashing', () => {
    it('creates an authenticated session and hashes token for storage', async () => {
      const { session, rawSessionToken } = await sessionStore.createSession(walletAccount1.address);

      expect(session.ownerAddress).toBe(walletAccount1.address);
      expect(session.tokenHash).not.toBe(rawSessionToken);
      expect(session.expiresAt).toBe(baseTime + 86_400_000);

      // Verify retrieval with raw token
      const retrieved = await sessionStore.getSession(rawSessionToken);
      expect(retrieved).not.toBeNull();
      expect(retrieved?.ownerAddress).toBe(walletAccount1.address);
      expect(retrieved?.tokenHash).toBe(session.tokenHash);
    });

    it('returns null when retrieving non-existent or invalid session token', async () => {
      expect(await sessionStore.getSession('non_existent_token')).toBeNull();
      expect(await sessionStore.getSession('')).toBeNull();
    });

    it('expires sessions after 24 hours', async () => {
      const { rawSessionToken } = await sessionStore.createSession(walletAccount1.address);
      currentTime = baseTime + 86_400_001; // Advance past 24h

      const retrieved = await sessionStore.getSession(rawSessionToken);
      expect(retrieved).toBeNull();
    });

    it('deletes active session explicitly upon logout', async () => {
      const { rawSessionToken } = await sessionStore.createSession(walletAccount1.address);

      const deleted = await sessionStore.deleteSession(rawSessionToken);
      expect(deleted).toBe(true);

      const retrieved = await sessionStore.getSession(rawSessionToken);
      expect(retrieved).toBeNull();
    });

    it('opportunistically cleans up expired sessions during createSession', async () => {
      await sessionStore.createSession(walletAccount1.address, 10_000);
      await sessionStore.createSession(walletAccount2.address, 10_000);
      expect(sessionStore.size).toBe(2);

      // Advance time past expiration
      currentTime = baseTime + 20_000;

      // Creating a new session triggers opportunistic cleanup
      await sessionStore.createSession(walletAccount1.address, 10_000);
      expect(sessionStore.size).toBe(1);
    });

    it('enforces hard maximum capacity by pruning expired sessions first and evicting oldest remaining', async () => {
      const boundedStore = new InMemorySessionStore(86_400_000, () => currentTime, 3);

      currentTime = baseTime;
      const s1 = await boundedStore.createSession(walletAccount1.address, 10_000);
      currentTime = baseTime + 1_000;
      const s2 = await boundedStore.createSession(walletAccount1.address, 100_000);
      currentTime = baseTime + 2_000;
      const s3 = await boundedStore.createSession(walletAccount2.address, 100_000);

      expect(boundedStore.size).toBe(3);

      // Advance past s1 expiration
      currentTime = baseTime + 15_000;

      // Creating s4: s1 expired, pruned first without evicting s2 or s3
      const s4 = await boundedStore.createSession(walletAccount1.address, 100_000);
      expect(boundedStore.size).toBe(3);
      expect(await boundedStore.getSession(s1.rawSessionToken)).toBeNull();
      expect(await boundedStore.getSession(s2.rawSessionToken)).not.toBeNull();
      expect(await boundedStore.getSession(s3.rawSessionToken)).not.toBeNull();

      // Now explicit delete of s2 so size is 2 (s3, s4)
      await boundedStore.deleteSession(s2.rawSessionToken);
      expect(boundedStore.size).toBe(2);

      currentTime = baseTime + 20_000;
      const s5 = await boundedStore.createSession(walletAccount2.address, 100_000);
      expect(boundedStore.size).toBe(3); // s3, s4, s5

      // All 3 unexpired. Creating s6 should evict oldest (s3, createdAt baseTime + 2_000)
      currentTime = baseTime + 25_000;
      const s6 = await boundedStore.createSession(walletAccount1.address, 100_000);
      expect(boundedStore.size).toBe(3);
      expect(await boundedStore.getSession(s3.rawSessionToken)).toBeNull(); // evicted
      expect(await boundedStore.getSession(s4.rawSessionToken)).not.toBeNull();
      expect(await boundedStore.getSession(s5.rawSessionToken)).not.toBeNull();
      expect(await boundedStore.getSession(s6.rawSessionToken)).not.toBeNull();
    });
  });

  describe('3. SIWE Verification & Cryptographic Signature Checks', () => {
    async function createSignedSiweMessage(account = walletAccount1, overrides: Record<string, unknown> = {}) {
      const nonce = await authService.issueNonce();
      const messageParams = {
        domain: expectedDomain,
        address: account.address,
        statement: 'Sign in to CeloAgent',
        uri: expectedOrigin,
        version: '1',
        chainId: expectedChainId,
        nonce,
        issuedAt: new Date(currentTime),
        ...overrides,
      };

      const message = createSiweMessage(messageParams as any);
      const signature = await account.signMessage({ message });

      return { message, signature, nonce };
    }

    it('verifies a valid SIWE message and signature and creates a session', async () => {
      const { message, signature } = await createSignedSiweMessage();

      const result = await authService.verifySiwe({ message, signature });
      expect(result.session.ownerAddress).toBe(walletAccount1.address);
      expect(result.rawSessionToken).toBeTruthy();

      // Verify session exists in store
      const retrieved = await sessionStore.getSession(result.rawSessionToken);
      expect(retrieved?.ownerAddress).toBe(walletAccount1.address);
    });

    it('rejects replay attack when submitting the exact same message and signature twice', async () => {
      const { message, signature } = await createSignedSiweMessage();

      // First verification succeeds
      const first = await authService.verifySiwe({ message, signature });
      expect(first.session.ownerAddress).toBe(walletAccount1.address);

      // Replay must be rejected with InvalidNonceError
      await expect(
        authService.verifySiwe({ message, signature })
      ).rejects.toThrow(InvalidNonceError);
    });

    it('rejects concurrent verification attempts with the same challenge (race condition)', async () => {
      const { message, signature } = await createSignedSiweMessage();

      const results = await Promise.allSettled([
        authService.verifySiwe({ message, signature }),
        authService.verifySiwe({ message, signature }),
      ]);

      const fulfilled = results.filter((r) => r.status === 'fulfilled');
      const rejected = results.filter((r) => r.status === 'rejected');

      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(1);
    });

    it('rejects SIWE message with domain mismatch (anti-phishing)', async () => {
      const { message, signature } = await createSignedSiweMessage(walletAccount1, {
        domain: 'malicious-phishing.com',
      });

      await expect(
        authService.verifySiwe({ message, signature })
      ).rejects.toThrow('SIWE domain mismatch');
    });

    it('rejects SIWE message with URI origin mismatch', async () => {
      const { message, signature } = await createSignedSiweMessage(walletAccount1, {
        uri: 'http://other-site.com',
      });

      await expect(
        authService.verifySiwe({ message, signature })
      ).rejects.toThrow('SIWE URI mismatch');
    });

    it('rejects SIWE message with wrong chain ID', async () => {
      const { message, signature } = await createSignedSiweMessage(walletAccount1, {
        chainId: 1, // Ethereum mainnet instead of Celo Sepolia
      });

      await expect(
        authService.verifySiwe({ message, signature })
      ).rejects.toThrow('SIWE chain ID mismatch');
    });

    it('rejects SIWE message with future issuedAt (beyond clock tolerance)', async () => {
      const { message, signature } = await createSignedSiweMessage(walletAccount1, {
        issuedAt: new Date(currentTime + 120_000), // 2 minutes in future
      });

      await expect(
        authService.verifySiwe({ message, signature })
      ).rejects.toThrow('issuedAt cannot be in the future');
    });

    it('rejects SIWE message with expired expirationTime', async () => {
      const { message, signature } = await createSignedSiweMessage(walletAccount1, {
        expirationTime: new Date(currentTime - 10_000), // Expired 10s ago
      });

      await expect(
        authService.verifySiwe({ message, signature })
      ).rejects.toThrow('SIWE message has expired');
    });

    it('rejects tampered message signature', async () => {
      const { message } = await createSignedSiweMessage();
      // Generate signature from a DIFFERENT wallet
      const forgedSignature = await walletAccount2.signMessage({ message });

      await expect(
        authService.verifySiwe({ message, signature: forgedSignature })
      ).rejects.toThrow('Cryptographic signature does not match claimed address');
    });

    it('rejects malformed payload or invalid message text', async () => {
      await expect(
        authService.verifySiwe(null as any)
      ).rejects.toThrow(AuthenticationError);

      await expect(
        authService.verifySiwe({ message: 'not a siwe message', signature: '0x123' })
      ).rejects.toThrow(AuthenticationError);
    });
  });

  describe('4. Cookie Extraction, Session Derivation & Logout', () => {
    it('extracts authenticated owner address from session cookie', async () => {
      const { rawSessionToken } = await sessionStore.createSession(walletAccount1.address);

      const req = new Request('http://localhost:3000/api/auth/session', {
        headers: {
          cookie: `celo_agent_session=${rawSessionToken}`,
        },
      });

      const owner = await authService.getAuthenticatedOwnerAddress(req);
      expect(owner).toBe(walletAccount1.address);
    });

    it('throws AuthenticationError when session cookie is missing', async () => {
      const req = new Request('http://localhost:3000/api/auth/session');
      await expect(
        authService.getAuthenticatedOwnerAddress(req)
      ).rejects.toThrow('missing session credentials');
    });

    it('throws AuthenticationError when session cookie is invalid or expired', async () => {
      const req = new Request('http://localhost:3000/api/auth/session', {
        headers: {
          cookie: 'celo_agent_session=invalid_fake_token',
        },
      });
      await expect(
        authService.getAuthenticatedOwnerAddress(req)
      ).rejects.toThrow('invalid or expired session');
    });

    it('destroys session on logout', async () => {
      const { rawSessionToken } = await sessionStore.createSession(walletAccount1.address);

      const req = new Request('http://localhost:3000/api/auth/logout', {
        headers: {
          cookie: `celo_agent_session=${rawSessionToken}`,
        },
      });

      const loggedOut = await authService.logout(req);
      expect(loggedOut).toBe(true);

      // Verify session is no longer valid
      expect(await sessionStore.getSession(rawSessionToken)).toBeNull();
    });

    it('creates appropriate Set-Cookie and Clear-Cookie headers', () => {
      const sessionHeader = authService.createSessionCookieHeader('test_token', false);
      expect(sessionHeader).toContain('celo_agent_session=test_token');
      expect(sessionHeader).toContain('HttpOnly');
      expect(sessionHeader).toContain('SameSite=Lax');
      expect(sessionHeader).toContain('Path=/');

      const clearHeader = authService.createClearCookieHeader(false);
      expect(clearHeader).toContain('celo_agent_session=');
      expect(clearHeader).toContain('Max-Age=0');
    });
  });

  describe('5. CSRF & Origin Validation', () => {
    it('allows safe read methods without Origin header', () => {
      const req = new Request('http://localhost:3000/api/auth/session', { method: 'GET' });
      expect(() => authService.assertValidOrigin(req)).not.toThrow();
    });

    it('allows mutating requests with matching Origin header', () => {
      const req = new Request('http://localhost:3000/api/auth/verify', {
        method: 'POST',
        headers: {
          origin: expectedOrigin,
        },
      });
      expect(() => authService.assertValidOrigin(req)).not.toThrow();
    });

    it('allows mutating requests with matching Referer header when Origin is omitted', () => {
      const req = new Request('http://localhost:3000/api/auth/verify', {
        method: 'POST',
        headers: {
          referer: `${expectedOrigin}/login`,
        },
      });
      expect(() => authService.assertValidOrigin(req)).not.toThrow();
    });

    it('fails closed when Origin and Referer are both missing on state-changing request', () => {
      const req = new Request('http://localhost:3000/api/auth/verify', {
        method: 'POST',
      });
      expect(() => authService.assertValidOrigin(req)).toThrow(CsrfError);
    });

    it('rejects mutating requests with untrusted or cross-site Origin', () => {
      const req = new Request('http://localhost:3000/api/auth/verify', {
        method: 'POST',
        headers: {
          origin: 'http://malicious-attacker.com',
        },
      });
      expect(() => authService.assertValidOrigin(req)).toThrow(CsrfError);
    });
  });

  describe('6. HTTP Route Handlers Integration', () => {
    it('GET /api/auth/nonce returns a valid nonce with no-store headers', async () => {
      const res = await getNonceRoute();
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.success).toBe(true);
      expect(typeof json.nonce).toBe('string');
      expect(json.nonce.length).toBeGreaterThanOrEqual(8);
      expect(res.headers.get('cache-control')).toContain('no-store');
    });

    it('POST /api/auth/verify verifies SIWE, sets session cookie, and returns ownerAddress', async () => {
      // 1. Get nonce
      const nonceRes = await getNonceRoute();
      const { nonce } = await nonceRes.json();

      // 2. Sign message
      const message = createSiweMessage({
        domain: expectedDomain,
        address: walletAccount1.address,
        statement: 'Sign in to CeloAgent',
        uri: expectedOrigin,
        version: '1',
        chainId: expectedChainId,
        nonce,
        issuedAt: new Date(),
      });
      const signature = await walletAccount1.signMessage({ message });

      // 3. Verify
      const verifyReq = new Request('http://localhost:3000/api/auth/verify', {
        method: 'POST',
        headers: {
          origin: expectedOrigin,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ message, signature }),
      });

      const res = await verifyRoute(verifyReq);
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.ownerAddress).toBe(walletAccount1.address);

      const setCookie = res.headers.get('set-cookie');
      expect(setCookie).toContain('celo_agent_session=');
      expect(setCookie).toContain('HttpOnly');
    });

    it('POST /api/auth/verify rejects CSRF when Origin is missing', async () => {
      const verifyReq = new Request('http://localhost:3000/api/auth/verify', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({ message: 'msg', signature: '0x123' }),
      });

      const res = await verifyRoute(verifyReq);
      expect(res.status).toBe(403);
      const json = await res.json();
      expect(json.error).toContain('CSRF');
    });

    it('GET /api/auth/session returns authenticated status', async () => {
      // Unauthenticated
      const unauthReq = new Request('http://localhost:3000/api/auth/session');
      const unauthRes = await sessionRoute(unauthReq);
      expect(unauthRes.status).toBe(200);
      expect(await unauthRes.json()).toEqual({ authenticated: false });
    });

    it('POST /api/auth/logout clears cookie and returns success', async () => {
      const logoutReq = new Request('http://localhost:3000/api/auth/logout', {
        method: 'POST',
        headers: {
          origin: expectedOrigin,
        },
      });

      const res = await logoutRoute(logoutReq);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);

      const setCookie = res.headers.get('set-cookie');
      expect(setCookie).toContain('Max-Age=0');
    });

    it('executes full route lifecycle: nonce -> verify -> session (authenticated) -> logout -> session (unauthenticated)', async () => {
      // 1. GET /api/auth/nonce
      const nonceRes = await getNonceRoute();
      expect(nonceRes.status).toBe(200);
      expect(nonceRes.headers.get('cache-control')).toContain('no-store');
      const { nonce } = await nonceRes.json();
      expect(typeof nonce).toBe('string');

      // 2. Sign SIWE message
      const message = createSiweMessage({
        domain: expectedDomain,
        address: walletAccount1.address,
        statement: 'Sign in to CeloAgent',
        uri: expectedOrigin,
        version: '1',
        chainId: expectedChainId,
        nonce,
        issuedAt: new Date(),
      });
      const signature = await walletAccount1.signMessage({ message });

      // 3. POST /api/auth/verify
      const verifyReq = new Request('http://localhost:3000/api/auth/verify', {
        method: 'POST',
        headers: {
          origin: expectedOrigin,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ message, signature }),
      });
      const verifyRes = await verifyRoute(verifyReq);
      expect(verifyRes.status).toBe(200);
      expect(verifyRes.headers.get('cache-control')).toContain('no-store');
      const verifyJson = await verifyRes.json();
      expect(verifyJson.success).toBe(true);
      expect(verifyJson.ownerAddress).toBe(walletAccount1.address);

      const setCookie = verifyRes.headers.get('set-cookie');
      expect(setCookie).toBeTruthy();
      const cookieHeaderVal = setCookie!.split(';')[0]; // celo_agent_session=<rawToken>

      // 4. GET /api/auth/session with session cookie -> authenticated true
      const authSessionReq = new Request('http://localhost:3000/api/auth/session', {
        headers: {
          cookie: cookieHeaderVal,
        },
      });
      const authSessionRes = await sessionRoute(authSessionReq);
      expect(authSessionRes.status).toBe(200);
      expect(authSessionRes.headers.get('cache-control')).toContain('no-store');
      const sessionJson = await authSessionRes.json();
      expect(sessionJson.authenticated).toBe(true);
      expect(sessionJson.ownerAddress).toBe(walletAccount1.address);

      // 5. POST /api/auth/logout with session cookie -> clears cookie
      const logoutReq = new Request('http://localhost:3000/api/auth/logout', {
        method: 'POST',
        headers: {
          origin: expectedOrigin,
          cookie: cookieHeaderVal,
        },
      });
      const logoutRes = await logoutRoute(logoutReq);
      expect(logoutRes.status).toBe(200);
      expect(logoutRes.headers.get('cache-control')).toContain('no-store');
      expect(logoutRes.headers.get('set-cookie')).toContain('Max-Age=0');

      // 6. GET /api/auth/session with old cookie -> authenticated false
      const postLogoutReq = new Request('http://localhost:3000/api/auth/session', {
        headers: {
          cookie: cookieHeaderVal,
        },
      });
      const postLogoutRes = await sessionRoute(postLogoutReq);
      expect(postLogoutRes.status).toBe(200);
      expect(postLogoutRes.headers.get('cache-control')).toContain('no-store');
      const postLogoutJson = await postLogoutRes.json();
      expect(postLogoutJson.authenticated).toBe(false);
      expect(postLogoutJson.ownerAddress).toBeUndefined();
    });

    it('rejects duplicate verification replay attack at HTTP route level with 401', async () => {
      // 1. Get nonce
      const nonceRes = await getNonceRoute();
      const { nonce } = await nonceRes.json();

      // 2. Sign SIWE message
      const message = createSiweMessage({
        domain: expectedDomain,
        address: walletAccount1.address,
        statement: 'Sign in to CeloAgent',
        uri: expectedOrigin,
        version: '1',
        chainId: expectedChainId,
        nonce,
        issuedAt: new Date(),
      });
      const signature = await walletAccount1.signMessage({ message });

      // 3. First POST /api/auth/verify succeeds
      const verifyReq1 = new Request('http://localhost:3000/api/auth/verify', {
        method: 'POST',
        headers: {
          origin: expectedOrigin,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ message, signature }),
      });
      const res1 = await verifyRoute(verifyReq1);
      expect(res1.status).toBe(200);
      const json1 = await res1.json();
      expect(json1.success).toBe(true);

      // 4. Second POST /api/auth/verify with identical challenge and signature fails with 401
      const verifyReq2 = new Request('http://localhost:3000/api/auth/verify', {
        method: 'POST',
        headers: {
          origin: expectedOrigin,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ message, signature }),
      });
      const res2 = await verifyRoute(verifyReq2);
      expect(res2.status).toBe(401);
      expect(res2.headers.get('cache-control')).toContain('no-store');
      const json2 = await res2.json();
      expect(json2.success).toBe(false);
      expect(json2.error).toContain('previously consumed');
    });

    it('attaches no-store cache headers to error responses on all auth routes', async () => {
      // Error on verify: bad JSON body (400)
      const badReq = new Request('http://localhost:3000/api/auth/verify', {
        method: 'POST',
        headers: { origin: expectedOrigin, 'content-type': 'application/json' },
        body: 'invalid-json',
      });
      const badRes = await verifyRoute(badReq);
      expect(badRes.status).toBe(400);
      expect(badRes.headers.get('cache-control')).toContain('no-store');

      // Error on verify: CSRF origin mismatch (403)
      const csrfReq = new Request('http://localhost:3000/api/auth/verify', {
        method: 'POST',
        headers: { origin: 'http://malicious.com' },
      });
      const csrfRes = await verifyRoute(csrfReq);
      expect(csrfRes.status).toBe(403);
      expect(csrfRes.headers.get('cache-control')).toContain('no-store');

      // Error on logout: CSRF origin mismatch (403)
      const logoutCsrfReq = new Request('http://localhost:3000/api/auth/logout', {
        method: 'POST',
        headers: { origin: 'http://malicious.com' },
      });
      const logoutCsrfRes = await logoutRoute(logoutCsrfReq);
      expect(logoutCsrfRes.status).toBe(403);
      expect(logoutCsrfRes.headers.get('cache-control')).toContain('no-store');
    });
  });
});
