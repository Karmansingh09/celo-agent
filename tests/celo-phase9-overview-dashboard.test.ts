import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GET as getAgentsRoute, POST as createAgentRoute } from '../src/app/api/agents/route';
import { GET as getApprovalsRoute } from '../src/app/api/agents/[id]/approvals/route';
import { getNonceStore, getSessionStore } from '../src/lib/auth';
import { getAgentStore } from '../src/lib/agent';
import { getPendingApprovalStore } from '../src/lib/payment';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { createSiweMessage } from 'viem/siwe';
import { POST as verifyRoute } from '../src/app/api/auth/verify/route';
import { GET as nonceRoute } from '../src/app/api/auth/nonce/route';

describe('Phase 9.2: Overview Dashboard Backend Data & Security Invariants', () => {
  const account = privateKeyToAccount(generatePrivateKey());
  const origin = 'http://localhost:3000';
  const domain = 'localhost:3000';
  const chainId = 11142220;
  let sessionCookie: string = '';

  beforeEach(async () => {
    getNonceStore().clear();
    getSessionStore().clear();
    getAgentStore().clear();
    getPendingApprovalStore().clear();

    // Establish authenticated SIWE session
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
    sessionCookie = cookieHeader.split(';')[0];
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('1. GET /api/agents returns empty list for new user (Overview handles zero agents correctly)', async () => {
    const req = new Request('http://localhost:3000/api/agents', {
      method: 'GET',
      headers: { Cookie: sessionCookie },
    });
    const res = await getAgentsRoute(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.data).toEqual([]);
    expect(data.count).toBe(0);
  });

  it('2. GET /api/agents populates agents count and status breakdown for Overview', async () => {
    // Create an agent for the authenticated user
    const createReq = new Request('http://localhost:3000/api/agents', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: origin,
        Cookie: sessionCookie,
      },
      body: JSON.stringify({
        name: 'Treasury Bot',
        description: 'Automated treasury operations',
        spendingPolicy: {
          maxPerTransaction: '25.00',
          maxPerDay: '100.00',
          autoApproveThreshold: '10.00',
          allowedRecipients: [],
          validUntil: Date.now() + 86400000,
        },
      }),
    });
    const createRes = await createAgentRoute(createReq);
    expect(createRes.status).toBe(201);
    const createdAgent = (await createRes.json()).data;

    // List agents
    const listReq = new Request('http://localhost:3000/api/agents', {
      method: 'GET',
      headers: { Cookie: sessionCookie },
    });
    const listRes = await getAgentsRoute(listReq);
    const listData = await listRes.json();
    expect(listData.count).toBe(1);
    expect(listData.data[0].id).toBe(createdAgent.id);
    expect(listData.data[0].status).toBe('ACTIVE');
    expect(listData.data[0].spendingPolicy.maxPerDay).toBe('100.00');
  });

  it('3. GET /api/agents/[id]/approvals returns pending count for Overview approvals card', async () => {
    // Create agent
    const createReq = new Request('http://localhost:3000/api/agents', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: origin,
        Cookie: sessionCookie,
      },
      body: JSON.stringify({
        name: 'Payout Agent',
        spendingPolicy: {
          maxPerTransaction: '50.00',
          maxPerDay: '150.00',
          autoApproveThreshold: '25.00',
          allowedRecipients: [],
          validUntil: Date.now() + 86400000,
        },
      }),
    });
    const createRes = await createAgentRoute(createReq);
    expect(createRes.status).toBe(201);
    const agent = (await createRes.json()).data;

    // Check approvals
    const apprReq = new Request(`http://localhost:3000/api/agents/${agent.id}/approvals?status=PENDING`, {
      method: 'GET',
      headers: { Cookie: sessionCookie },
    });
    const apprRes = await getApprovalsRoute(apprReq, { params: { id: agent.id } });
    expect(apprRes.status).toBe(200);
    const apprData = await apprRes.json();
    expect(apprData.success).toBe(true);
    expect(apprData.count).toBe(0);
    expect(apprData.data).toEqual([]);
  });

  it('4. Unauthenticated requests to /api/agents reject with 401', async () => {
    const req = new Request('http://localhost:3000/api/agents', {
      method: 'GET',
    });
    const res = await getAgentsRoute(req);
    expect(res.status).toBe(401);
  });

  it('5. Confirms no deprecated payment endpoints or secrets are referenced in frontend components', async () => {
    const fs = await import('fs');
    const path = await import('path');

    const filesToCheck = [
      'src/app/dashboard/page.tsx',
      'src/components/dashboard/OverviewHeader.tsx',
      'src/components/dashboard/OverviewStatCard.tsx',
      'src/components/dashboard/AgentSummary.tsx',
      'src/components/dashboard/SpendingOverview.tsx',
      'src/components/dashboard/ApprovalSummary.tsx',
      'src/components/dashboard/RecentActivity.tsx',
      'src/components/dashboard/QuickActions.tsx',
    ];

    for (const relPath of filesToCheck) {
      const fullPath = path.resolve(process.cwd(), relPath);
      const content = fs.readFileSync(fullPath, 'utf8');

      expect(content).not.toContain('AGENT_PRIVATE_KEY');
      expect(content).not.toContain('/api/payments/send');
      expect(content).not.toContain('parseFloat');
    }
  });
});
