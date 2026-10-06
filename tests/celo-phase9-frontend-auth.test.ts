import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GET as sessionRoute } from '../src/app/api/auth/session/route';
import { GET as nonceRoute } from '../src/app/api/auth/nonce/route';
import { POST as verifyRoute } from '../src/app/api/auth/verify/route';
import { POST as logoutRoute } from '../src/app/api/auth/logout/route';
import { getNonceStore, getSessionStore } from '../src/lib/auth';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { createSiweMessage } from 'viem/siwe';

describe('Phase 9.1: Frontend SIWE Auth & Session Integration', () => {
  const account = privateKeyToAccount(generatePrivateKey());
  const origin = 'http://localhost:3000';
  const domain = 'localhost:3000';
  const chainId = 11142220; // Celo Sepolia

  beforeEach(() => {
    getNonceStore().clear();
    getSessionStore().clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('1. GET /api/auth/session returns unauthenticated state when no cookie is present', async () => {
    const req = new Request('http://localhost:3000/api/auth/session', {
      method: 'GET',
    });
    const res = await sessionRoute(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.authenticated).toBe(false);
  });

  it('2. GET /api/auth/nonce issues a fresh non-empty challenge nonce', async () => {
    const res = await nonceRoute();
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(typeof data.nonce).toBe('string');
    expect(data.nonce.length).toBeGreaterThanOrEqual(8);
  });

  it('3. POST /api/auth/verify handles end-to-end SIWE message verification and sets session cookie', async () => {
    // 1. Get nonce
    const nonceRes = await nonceRoute();
    const { nonce } = await nonceRes.json();

    // 2. Build standard SIWE message
    const message = createSiweMessage({
      domain,
      address: account.address,
      statement: 'Sign in to CeloAgent Control Plane',
      uri: origin,
      version: '1',
      chainId,
      nonce,
      issuedAt: new Date(),
    });

    // 3. Sign with wallet
    const signature = await account.signMessage({ message });

    // 4. Verify
    const verifyReq = new Request('http://localhost:3000/api/auth/verify', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: origin,
      },
      body: JSON.stringify({ message, signature }),
    });

    const verifyRes = await verifyRoute(verifyReq);
    expect(verifyRes.status).toBe(200);
    const verifyData = await verifyRes.json();
    expect(verifyData.success).toBe(true);
    expect(verifyData.ownerAddress.toLowerCase()).toBe(account.address.toLowerCase());

    const setCookie = verifyRes.headers.get('set-cookie');
    expect(setCookie).toBeTruthy();
    expect(setCookie).toContain('celo_agent_session=');
    expect(setCookie).toContain('HttpOnly');

    // 5. Query session using the cookie header
    const cookieVal = setCookie?.split(';')[0];
    const sessionReq = new Request('http://localhost:3000/api/auth/session', {
      method: 'GET',
      headers: {
        Cookie: cookieVal || '',
      },
    });

    const sessionRes = await sessionRoute(sessionReq);
    const sessionData = await sessionRes.json();
    expect(sessionData.authenticated).toBe(true);
    expect(sessionData.ownerAddress.toLowerCase()).toBe(account.address.toLowerCase());
  });

  it('4. POST /api/auth/logout invalidates session and clears cookie', async () => {
    // Setup authenticated session
    const nonceRes = await nonceRoute();
    const { nonce } = await nonceRes.json();
    const message = createSiweMessage({
      domain,
      address: account.address,
      statement: 'Sign in to CeloAgent Control Plane',
      uri: origin,
      version: '1',
      chainId,
      nonce,
      issuedAt: new Date(),
    });
    const signature = await account.signMessage({ message });
    const verifyReq = new Request('http://localhost:3000/api/auth/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: origin },
      body: JSON.stringify({ message, signature }),
    });
    const verifyRes = await verifyRoute(verifyReq);
    const cookieHeader = verifyRes.headers.get('set-cookie') || '';
    const cookieVal = cookieHeader.split(';')[0];

    // Call logout
    const logoutReq = new Request('http://localhost:3000/api/auth/logout', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: origin,
        Cookie: cookieVal,
      },
    });
    const logoutRes = await logoutRoute(logoutReq);
    expect(logoutRes.status).toBe(200);
    const logoutCookie = logoutRes.headers.get('set-cookie');
    expect(logoutCookie).toContain('Max-Age=0');

    // Session check now returns unauthenticated
    const sessionReq = new Request('http://localhost:3000/api/auth/session', {
      method: 'GET',
      headers: { Cookie: cookieVal },
    });
    const sessionRes = await sessionRoute(sessionReq);
    const sessionData = await sessionRes.json();
    expect(sessionData.authenticated).toBe(false);
  });

  it('5. POST /api/auth/verify rejects forged address or bad signature', async () => {
    const nonceRes = await nonceRoute();
    const { nonce } = await nonceRes.json();
    const message = createSiweMessage({
      domain,
      address: account.address,
      statement: 'Sign in to CeloAgent Control Plane',
      uri: origin,
      version: '1',
      chainId,
      nonce,
      issuedAt: new Date(),
    });
    // Sign with different account
    const wrongAccount = privateKeyToAccount(generatePrivateKey());
    const badSignature = await wrongAccount.signMessage({ message });

    const verifyReq = new Request('http://localhost:3000/api/auth/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: origin },
      body: JSON.stringify({ message, signature: badSignature }),
    });
    const verifyRes = await verifyRoute(verifyReq);
    expect(verifyRes.status).toBe(401);
    const data = await verifyRes.json();
    expect(data.success).toBe(false);
  });

  it('6. POST /api/auth/verify rejects replay of already consumed nonce', async () => {
    const nonceRes = await nonceRoute();
    const { nonce } = await nonceRes.json();
    const message = createSiweMessage({
      domain,
      address: account.address,
      statement: 'Sign in to CeloAgent Control Plane',
      uri: origin,
      version: '1',
      chainId,
      nonce,
      issuedAt: new Date(),
    });
    const signature = await account.signMessage({ message });

    // First attempt succeeds
    const req1 = new Request('http://localhost:3000/api/auth/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: origin },
      body: JSON.stringify({ message, signature }),
    });
    const res1 = await verifyRoute(req1);
    expect(res1.status).toBe(200);

    // Second attempt fails due to consumed nonce
    const req2 = new Request('http://localhost:3000/api/auth/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: origin },
      body: JSON.stringify({ message, signature }),
    });
    const res2 = await verifyRoute(req2);
    expect(res2.status).toBe(401);
  });
});
