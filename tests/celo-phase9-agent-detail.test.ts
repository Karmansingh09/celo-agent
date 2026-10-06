import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GET as getAgentByIdRoute } from '../src/app/api/agents/[id]/route';
import { POST as createAgentRoute } from '../src/app/api/agents/route';
import { POST as pauseAgentRoute } from '../src/app/api/agents/[id]/pause/route';
import { POST as resumeAgentRoute } from '../src/app/api/agents/[id]/resume/route';
import { POST as terminateAgentRoute } from '../src/app/api/agents/[id]/terminate/route';
import { getNonceStore, getSessionStore } from '../src/lib/auth';
import { getAgentStore } from '../src/lib/agent';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { createSiweMessage } from 'viem/siwe';
import { POST as verifyRoute } from '../src/app/api/auth/verify/route';
import { GET as nonceRoute } from '../src/app/api/auth/nonce/route';
import * as fs from 'fs';
import * as path from 'path';

describe('Phase 9.4: Agent Detail + Control Room Backend & Frontend Invariants', () => {
  const accountA = privateKeyToAccount(generatePrivateKey());
  const accountB = privateKeyToAccount(generatePrivateKey());
  const origin = 'http://localhost:3000';
  const domain = 'localhost:3000';
  const chainId = 11142220;

  let sessionCookieA: string = '';
  let sessionCookieB: string = '';

  const authenticate = async (acc: typeof accountA): Promise<string> => {
    const nonceRes = await nonceRoute();
    const { nonce } = await nonceRes.json();
    const message = createSiweMessage({
      domain,
      address: acc.address,
      statement: 'Sign in to CeloAgent Control Plane',
      uri: origin,
      version: '1',
      chainId,
      nonce,
      issuedAt: new Date(),
    });
    const signature = await acc.signMessage({ message });
    const verifyReq = new Request('http://localhost:3000/api/auth/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: origin },
      body: JSON.stringify({ message, signature }),
    });
    const verifyRes = await verifyRoute(verifyReq);
    const cookieHeader = verifyRes.headers.get('set-cookie') || '';
    return cookieHeader.split(';')[0];
  };

  beforeEach(async () => {
    getNonceStore().clear();
    getSessionStore().clear();
    getAgentStore().clear();

    sessionCookieA = await authenticate(accountA);
    sessionCookieB = await authenticate(accountB);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('1. Authenticated user can fetch their agent detail via GET /api/agents/[id]', async () => {
    // 1. Create agent for User A
    const createReq = new Request('http://localhost:3000/api/agents', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: origin,
        Cookie: sessionCookieA,
      },
      body: JSON.stringify({
        name: 'Research Bot',
        description: 'Analyzes market sentiment and logs research.',
        spendingPolicy: {
          maxPerTransaction: '5.00',
          maxPerDay: '25.00',
          autoApproveThreshold: '2.00',
          allowedRecipients: [],
          validUntil: 1775000000000,
        },
      }),
    });
    const createRes = await createAgentRoute(createReq);
    expect(createRes.status).toBe(201);
    const createdAgent = (await createRes.json()).data;

    // 2. Fetch agent detail
    const getReq = new Request(`http://localhost:3000/api/agents/${createdAgent.id}`, {
      method: 'GET',
      headers: { Cookie: sessionCookieA },
    });
    const getRes = await getAgentByIdRoute(getReq, { params: { id: createdAgent.id } });
    expect(getRes.status).toBe(200);
    const fetchedData = await getRes.json();
    expect(fetchedData.success).toBe(true);
    expect(fetchedData.data.id).toBe(createdAgent.id);
    expect(fetchedData.data.name).toBe('Research Bot');
    expect(fetchedData.data.spendingPolicy.maxPerTransaction).toBe('5.00');
    expect(fetchedData.data.spendingPolicy.maxPerDay).toBe('25.00');
    expect(fetchedData.data.spendingPolicy.autoApproveThreshold).toBe('2.00');
    expect(fetchedData.data.status).toBe('ACTIVE');
  });

  it('2. Unauthenticated request to GET /api/agents/[id] returns 401', async () => {
    const getReq = new Request('http://localhost:3000/api/agents/agent_1700000000_12345678', {
      method: 'GET',
    });
    const getRes = await getAgentByIdRoute(getReq, { params: { id: 'agent_1700000000_12345678' } });
    expect(getRes.status).toBe(401);
  });

  it('3. Anti-enumeration: GET /api/agents/[id] returns 404 for non-owned or unknown agent', async () => {
    // Create agent for User A
    const createReq = new Request('http://localhost:3000/api/agents', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: origin,
        Cookie: sessionCookieA,
      },
      body: JSON.stringify({
        name: 'Private Agent',
        spendingPolicy: {
          maxPerTransaction: '5.00',
          maxPerDay: '25.00',
          autoApproveThreshold: '2.00',
          allowedRecipients: [],
          validUntil: Date.now() + 86400000,
        },
      }),
    });
    const createRes = await createAgentRoute(createReq);
    const createdAgent = (await createRes.json()).data;

    // User B attempts to access User A's agent -> 404 (not 403, preventing enumeration)
    const getReqB = new Request(`http://localhost:3000/api/agents/${createdAgent.id}`, {
      method: 'GET',
      headers: { Cookie: sessionCookieB },
    });
    const getResB = await getAgentByIdRoute(getReqB, { params: { id: createdAgent.id } });
    expect(getResB.status).toBe(404);
    const dataB = await getResB.json();
    expect(dataB.success).toBe(false);
  });

  it('4. Control Room Lifecycle Transitions: ACTIVE -> PAUSED -> ACTIVE -> TERMINATED', async () => {
    // Create agent for User A
    const createReq = new Request('http://localhost:3000/api/agents', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: origin,
        Cookie: sessionCookieA,
      },
      body: JSON.stringify({
        name: 'Control Room Target',
        spendingPolicy: {
          maxPerTransaction: '1.00',
          maxPerDay: '10.00',
          autoApproveThreshold: '0.50',
          allowedRecipients: [],
          validUntil: Date.now() + 86400000,
        },
      }),
    });
    const createRes = await createAgentRoute(createReq);
    const agent = (await createRes.json()).data;
    expect(agent.status).toBe('ACTIVE');

    // 1. Pause
    const pauseReq = new Request(`http://localhost:3000/api/agents/${agent.id}/pause`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: origin, Cookie: sessionCookieA },
      body: JSON.stringify({ reason: 'Audit hold' }),
    });
    const pauseRes = await pauseAgentRoute(pauseReq, { params: { id: agent.id } });
    expect(pauseRes.status).toBe(200);
    expect((await pauseRes.json()).data.status).toBe('PAUSED');

    // 2. Resume
    const resumeReq = new Request(`http://localhost:3000/api/agents/${agent.id}/resume`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: origin, Cookie: sessionCookieA },
      body: JSON.stringify({ reason: 'Audit cleared' }),
    });
    const resumeRes = await resumeAgentRoute(resumeReq, { params: { id: agent.id } });
    expect(resumeRes.status).toBe(200);
    expect((await resumeRes.json()).data.status).toBe('ACTIVE');

    // 3. Terminate
    const termReq = new Request(`http://localhost:3000/api/agents/${agent.id}/terminate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: origin, Cookie: sessionCookieA },
      body: JSON.stringify({ reason: 'Permanent decommissioning' }),
    });
    const termRes = await terminateAgentRoute(termReq, { params: { id: agent.id } });
    expect(termRes.status).toBe(200);
    expect((await termRes.json()).data.status).toBe('TERMINATED');
  });

  it('5. Frontend Inspection: /dashboard/agents/[id]/page.tsx structure, navigation and safety', () => {
    const pagePath = path.resolve(__dirname, '../src/app/dashboard/agents/[id]/page.tsx');
    const content = fs.readFileSync(pagePath, 'utf-8');

    // Breadcrumb navigation
    expect(content).toContain('href="/dashboard/agents"');
    expect(content).toContain('Agents');

    // Safe 404 / error states
    expect(content).toContain('Agent not found');
    expect(content).toContain('Back to Agents');
    expect(content).toContain('Unable to load this agent');

    // Reuses LifecycleModal
    expect(content).toContain('<LifecycleModal');

    // Danger Zone
    expect(content).toContain('Danger Zone');
    expect(content).toContain('Terminate Agent');

    // Activity empty state without fabricated events
    expect(content).toContain('No activity history yet.');
    expect(content).toContain('Payment evaluations and lifecycle audit events will appear here');

    // Anti-leak and security guarantees
    expect(content).not.toContain('AGENT_PRIVATE_KEY');
    expect(content).not.toContain('/api/payments/send');
    expect(content).not.toContain('privateKeyToAccount');
  });

  it('6. Frontend Inspection: AgentIdentity displays full identity details safely', () => {
    const identityPath = path.resolve(__dirname, '../src/components/dashboard/AgentIdentity.tsx');
    const content = fs.readFileSync(identityPath, 'utf-8');

    expect(content).toContain('agent.id');
    expect(content).toContain('agent.ownerAddress');
    expect(content).toContain('agent.walletAddress');
    expect(content).toContain('agent.createdAt');
    expect(content).toContain('agent.updatedAt');
    expect(content).toContain('copyToClipboard');

    // Zero private key exposure
    expect(content).not.toContain('privateKey');
  });

  it('7. Frontend Inspection: AgentPolicyCard displays read-only cUSD controls and zero float arithmetic', () => {
    const policyCardPath = path.resolve(__dirname, '../src/components/dashboard/AgentPolicyCard.tsx');
    const content = fs.readFileSync(policyCardPath, 'utf-8');

    // Read-only indicator
    expect(content).toContain('Read-Only');
    expect(content).not.toContain('Edit Policy');
    expect(content).not.toContain('Save Policy');

    // Spending fields
    expect(content).toContain('policy.maxPerTransaction');
    expect(content).toContain('policy.maxPerDay');
    expect(content).toContain('policy.autoApproveThreshold');

    // Recipient handling: empty means "Any recipient"
    expect(content).toContain('Any recipient');
    expect(content).toContain('allowedRecipients.length === 0');

    // Validity
    expect(content).toContain('policy.validUntil');

    // Zero float math
    expect(content).not.toMatch(/parseFloat\(/);
    expect(content).not.toMatch(/Number\(policy\./);
  });
});
