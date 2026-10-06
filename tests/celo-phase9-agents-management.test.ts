import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GET as getAgentsRoute, POST as createAgentRoute } from '../src/app/api/agents/route';
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

describe('Phase 9.3: Agents Management UI Backend & Frontend Invariants', () => {
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

  it('1. GET /api/agents lists agents owned only by authenticated user', async () => {
    // Create agent for user A
    const createReqA = new Request('http://localhost:3000/api/agents', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: origin,
        Cookie: sessionCookieA,
      },
      body: JSON.stringify({
        name: 'Agent Alpha',
        spendingPolicy: {
          maxPerTransaction: '5.00',
          maxPerDay: '20.00',
          autoApproveThreshold: '1.00',
          allowedRecipients: [],
          validUntil: Date.now() + 86400000,
        },
      }),
    });
    const createResA = await createAgentRoute(createReqA);
    expect(createResA.status).toBe(201);

    // User A should see 1 agent
    const listReqA = new Request('http://localhost:3000/api/agents', {
      method: 'GET',
      headers: { Cookie: sessionCookieA },
    });
    const listResA = await getAgentsRoute(listReqA);
    const listDataA = await listResA.json();
    expect(listDataA.count).toBe(1);
    expect(listDataA.data[0].name).toBe('Agent Alpha');
    expect(listDataA.data[0].ownerAddress.toLowerCase()).toBe(accountA.address.toLowerCase());

    // User B should see 0 agents
    const listReqB = new Request('http://localhost:3000/api/agents', {
      method: 'GET',
      headers: { Cookie: sessionCookieB },
    });
    const listResB = await getAgentsRoute(listReqB);
    const listDataB = await listResB.json();
    expect(listDataB.count).toBe(0);
    expect(listDataB.data).toEqual([]);
  });

  it('2. Lifecycle actions: Pause, Resume, and Terminate work correctly', async () => {
    // 1. Create agent
    const createReq = new Request('http://localhost:3000/api/agents', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: origin,
        Cookie: sessionCookieA,
      },
      body: JSON.stringify({
        name: 'Lifecycle Agent',
        spendingPolicy: {
          maxPerTransaction: '10.00',
          maxPerDay: '50.00',
          autoApproveThreshold: '5.00',
          allowedRecipients: [],
          validUntil: Date.now() + 86400000,
        },
      }),
    });
    const createRes = await createAgentRoute(createReq);
    const agent = (await createRes.json()).data;
    expect(agent.status).toBe('ACTIVE');

    // 2. Pause
    const pauseReq = new Request(`http://localhost:3000/api/agents/${agent.id}/pause`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: origin,
        Cookie: sessionCookieA,
      },
      body: JSON.stringify({ reason: 'Maintenance' }),
    });
    const pauseRes = await pauseAgentRoute(pauseReq, { params: { id: agent.id } });
    expect(pauseRes.status).toBe(200);
    const pausedAgent = (await pauseRes.json()).data;
    expect(pausedAgent.status).toBe('PAUSED');

    // 3. Resume
    const resumeReq = new Request(`http://localhost:3000/api/agents/${agent.id}/resume`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: origin,
        Cookie: sessionCookieA,
      },
      body: JSON.stringify({ reason: 'Maintenance completed' }),
    });
    const resumeRes = await resumeAgentRoute(resumeReq, { params: { id: agent.id } });
    expect(resumeRes.status).toBe(200);
    const resumedAgent = (await resumeRes.json()).data;
    expect(resumedAgent.status).toBe('ACTIVE');

    // 4. Terminate
    const termReq = new Request(`http://localhost:3000/api/agents/${agent.id}/terminate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: origin,
        Cookie: sessionCookieA,
      },
      body: JSON.stringify({ reason: 'Decommissioning' }),
    });
    const termRes = await terminateAgentRoute(termReq, { params: { id: agent.id } });
    expect(termRes.status).toBe(200);
    const termAgent = (await termRes.json()).data;
    expect(termAgent.status).toBe('TERMINATED');

    // 5. Subsequent pause on terminated agent fails
    const secondPauseReq = new Request(`http://localhost:3000/api/agents/${agent.id}/pause`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: origin,
        Cookie: sessionCookieA,
      },
      body: JSON.stringify({}),
    });
    const secondPauseRes = await pauseAgentRoute(secondPauseReq, { params: { id: agent.id } });
    expect(secondPauseRes.status).toBe(409);
  });

  it('3. User B cannot perform lifecycle actions on User A agent (Authorization Guard)', async () => {
    // Create agent under User A
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
    const agent = (await createRes.json()).data;

    // User B attempts to pause User A's agent
    const pauseReq = new Request(`http://localhost:3000/api/agents/${agent.id}/pause`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: origin,
        Cookie: sessionCookieB,
      },
      body: JSON.stringify({ reason: 'Malicious attempt' }),
    });
    const pauseRes = await pauseAgentRoute(pauseReq, { params: { id: agent.id } });
    expect(pauseRes.status).toBe(404);
  });

  it('4. Frontend code verification: CreateAgentModal never submits client-supplied ownerAddress', () => {
    const createModalPath = path.resolve(__dirname, '../src/components/dashboard/CreateAgentModal.tsx');
    const content = fs.readFileSync(createModalPath, 'utf-8');

    // Ensure ownerAddress is not passed in the request body
    expect(content).not.toMatch(/ownerAddress\s*:/);
    // Ensure spending policy limits are strings
    expect(content).toContain('maxPerTransaction: maxPerTransaction.trim()');
    expect(content).toContain('maxPerDay: maxPerDay.trim()');
    expect(content).toContain('autoApproveThreshold: autoApproveThreshold.trim()');
  });

  it('5. Frontend security invariants: No private keys and no deprecated payment endpoint in dashboard', () => {
    const dashboardDir = path.resolve(__dirname, '../src/components/dashboard');
    const dashboardFiles = fs.readdirSync(dashboardDir);

    for (const file of dashboardFiles) {
      const fullPath = path.join(dashboardDir, file);
      if (fs.statSync(fullPath).isFile()) {
        const text = fs.readFileSync(fullPath, 'utf-8');
        expect(text).not.toContain('AGENT_PRIVATE_KEY');
        expect(text).not.toContain('/api/payments/send');
        expect(text).not.toContain('privateKeyToAccount');
      }
    }

    const agentsPagePath = path.resolve(__dirname, '../src/app/dashboard/agents/page.tsx');
    const agentsPageContent = fs.readFileSync(agentsPagePath, 'utf-8');
    expect(agentsPageContent).not.toContain('AGENT_PRIVATE_KEY');
    expect(agentsPageContent).not.toContain('/api/payments/send');
    expect(agentsPageContent).not.toContain('privateKeyToAccount');
  });

  it('6. AgentCard component provides link to /dashboard/agents/[id] and displays policy limits', () => {
    const agentCardPath = path.resolve(__dirname, '../src/components/dashboard/AgentCard.tsx');
    const content = fs.readFileSync(agentCardPath, 'utf-8');

    expect(content).toContain('/dashboard/agents/${agent.id}');
    expect(content).toContain('agent.spendingPolicy.maxPerTransaction');
    expect(content).toContain('agent.spendingPolicy.maxPerDay');
    expect(content).toContain('agent.spendingPolicy.autoApproveThreshold');
    expect(content).toContain('agent.status === \'ACTIVE\'');
    expect(content).toContain('agent.status === \'PAUSED\'');
    expect(content).toContain('agent.status === \'TERMINATED\'');
  });

  it('7. LifecycleModal implements confirmation for termination', () => {
    const modalPath = path.resolve(__dirname, '../src/components/dashboard/LifecycleModal.tsx');
    const content = fs.readFileSync(modalPath, 'utf-8');

    expect(content).toContain('confirmName.trim().toLowerCase() !== agent.name.trim().toLowerCase()');
    expect(content).toContain('Please type');
  });
});
