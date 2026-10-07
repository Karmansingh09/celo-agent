import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getSessionStore } from '../src/lib/auth';
import { getAgentStore, getAgentService } from '../src/lib/agent';
import { getBudgetStore } from '../src/lib/policy';
import { getPendingApprovalStore } from '../src/lib/payment';
import { POST as createPaymentRoute } from '../src/app/api/agents/[id]/payments/route';
import { GET as listApprovalsRoute } from '../src/app/api/agents/[id]/approvals/route';
import { POST as approveRoute } from '../src/app/api/agents/[id]/approvals/[requestId]/approve/route';
import { POST as rejectRoute } from '../src/app/api/agents/[id]/approvals/[requestId]/reject/route';
import * as fs from 'fs';
import * as path from 'path';

describe('Phase 9.5: Approval Queue & Human Decision UI Invariants', () => {
  const ownerA = '0x1111111111111111111111111111111111111111';
  const ownerB = '0x2222222222222222222222222222222222222222';
  const validRecipient = '0x3333333333333333333333333333333333333333';
  const expectedOrigin = 'http://localhost:3000';

  let cookieA: string;
  let cookieB: string;
  let agentAId: string;

  const validPolicy = {
    maxPerTransaction: '10.00',
    maxPerDay: '50.00',
    autoApproveThreshold: '2.00', // Requests > $2.00 trigger REQUIRE_USER_APPROVAL
    validUntil: Date.now() + 86400000 * 7,
    allowedRecipients: [validRecipient],
  };

  beforeEach(async () => {
    getSessionStore().clear();
    getAgentStore().clear();
    getBudgetStore().clear();
    getPendingApprovalStore().clear();

    const sessionA = await getSessionStore().createSession(ownerA);
    cookieA = `celo_agent_session=${sessionA.rawSessionToken}`;

    const sessionB = await getSessionStore().createSession(ownerB);
    cookieB = `celo_agent_session=${sessionB.rawSessionToken}`;

    const agentA = await getAgentService().createAgent(ownerA, {
      name: 'Operations Agent',
      spendingPolicy: validPolicy,
    });
    agentAId = agentA.id;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('1. Pending approval is generated when payment exceeds auto-approval threshold and is listable via GET', async () => {
    // 1. Submit payment of $5.00 (> autoApproveThreshold of $2.00)
    const payReq = new Request(`http://localhost:3000/api/agents/${agentAId}/payments`, {
      method: 'POST',
      headers: {
        origin: expectedOrigin,
        cookie: cookieA,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        amountCusd: '5.00',
        recipient: validRecipient,
        idempotencyKey: 'approval-test-1',
      }),
    });
    const payRes = await createPaymentRoute(payReq, { params: { id: agentAId } });
    expect(payRes.status).toBe(202);
    const payData = await payRes.json();
    expect(payData.data.outcome).toBe('REQUIRE_USER_APPROVAL');
    expect(payData.data.pendingApproval).toBeDefined();
    expect(payData.data.pendingApproval.requestId).toBeDefined();

    // 2. Query pending approvals
    const listReq = new Request(`http://localhost:3000/api/agents/${agentAId}/approvals?status=PENDING`, {
      method: 'GET',
      headers: { cookie: cookieA },
    });
    const listRes = await listApprovalsRoute(listReq, { params: { id: agentAId } });
    expect(listRes.status).toBe(200);
    const listData = await listRes.json();
    expect(listData.count).toBe(1);
    expect(listData.data[0].requestId).toBe(payData.data.pendingApproval.requestId);
    expect(listData.data[0].amountCusd).toBe('5.00');
    expect(listData.data[0].status).toBe('PENDING');
  });

  it('2. Approving request transitions outcome to RESERVED and resolves pending approval', async () => {
    // Seed pending approval
    const payReq = new Request(`http://localhost:3000/api/agents/${agentAId}/payments`, {
      method: 'POST',
      headers: {
        origin: expectedOrigin,
        cookie: cookieA,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        amountCusd: '4.50',
        recipient: validRecipient,
        idempotencyKey: 'approval-test-2',
      }),
    });
    const payRes = await createPaymentRoute(payReq, { params: { id: agentAId } });
    const payData = await payRes.json();
    const requestId = payData.data.pendingApproval.requestId;

    // Approve the request
    const approveReq = new Request(
      `http://localhost:3000/api/agents/${agentAId}/approvals/${requestId}/approve`,
      {
        method: 'POST',
        headers: {
          origin: expectedOrigin,
          cookie: cookieA,
          'content-type': 'application/json',
        },
        body: JSON.stringify({}),
      }
    );
    const approveRes = await approveRoute(approveReq, {
      params: { id: agentAId, requestId },
    });
    expect(approveRes.status).toBe(200);
    const approveData = await approveRes.json();
    expect(approveData.success).toBe(true);
    expect(approveData.data.outcome).toBe('RESERVED');

    // List pending approvals should now be empty
    const listReq = new Request(`http://localhost:3000/api/agents/${agentAId}/approvals?status=PENDING`, {
      method: 'GET',
      headers: { cookie: cookieA },
    });
    const listRes = await listApprovalsRoute(listReq, { params: { id: agentAId } });
    const listData = await listRes.json();
    expect(listData.count).toBe(0);
  });

  it('3. Rejecting request records optional reason and resolves pending approval', async () => {
    // Seed pending approval
    const payReq = new Request(`http://localhost:3000/api/agents/${agentAId}/payments`, {
      method: 'POST',
      headers: {
        origin: expectedOrigin,
        cookie: cookieA,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        amountCusd: '6.00',
        recipient: validRecipient,
        idempotencyKey: 'approval-test-3',
      }),
    });
    const payRes = await createPaymentRoute(payReq, { params: { id: agentAId } });
    const payData = await payRes.json();
    const requestId = payData.data.pendingApproval.requestId;

    // Reject the request with reason
    const rejectReq = new Request(
      `http://localhost:3000/api/agents/${agentAId}/approvals/${requestId}/reject`,
      {
        method: 'POST',
        headers: {
          origin: expectedOrigin,
          cookie: cookieA,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ reason: 'Payment exceeds expected sprint allocation' }),
      }
    );
    const rejectRes = await rejectRoute(rejectReq, {
      params: { id: agentAId, requestId },
    });
    expect(rejectRes.status).toBe(200);
    const rejectData = await rejectRes.json();
    expect(rejectData.success).toBe(true);
    expect(rejectData.data.status).toBe('REJECTED');
    expect(rejectData.data.statusReason).toBe('Payment exceeds expected sprint allocation');

    // List pending approvals should now be empty
    const listReq = new Request(`http://localhost:3000/api/agents/${agentAId}/approvals?status=PENDING`, {
      method: 'GET',
      headers: { cookie: cookieA },
    });
    const listRes = await listApprovalsRoute(listReq, { params: { id: agentAId } });
    const listData = await listRes.json();
    expect(listData.count).toBe(0);
  });

  it('4. Anti-enumeration: User B cannot access or approve User A pending approvals', async () => {
    // Seed pending approval under User A
    const payReq = new Request(`http://localhost:3000/api/agents/${agentAId}/payments`, {
      method: 'POST',
      headers: {
        origin: expectedOrigin,
        cookie: cookieA,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        amountCusd: '3.00',
        recipient: validRecipient,
        idempotencyKey: 'approval-test-4',
      }),
    });
    const payRes = await createPaymentRoute(payReq, { params: { id: agentAId } });
    const payData = await payRes.json();
    const requestId = payData.data.pendingApproval.requestId;

    // User B attempts to approve User A's pending approval -> 404
    const approveReqB = new Request(
      `http://localhost:3000/api/agents/${agentAId}/approvals/${requestId}/approve`,
      {
        method: 'POST',
        headers: {
          origin: expectedOrigin,
          cookie: cookieB,
          'content-type': 'application/json',
        },
        body: JSON.stringify({}),
      }
    );
    const approveResB = await approveRoute(approveReqB, {
      params: { id: agentAId, requestId },
    });
    expect(approveResB.status).toBe(404);
  });

  it('5. Frontend inspection: /dashboard/approvals/page.tsx maintains security and UX invariants', () => {
    const pagePath = path.resolve(__dirname, '../src/app/dashboard/approvals/page.tsx');
    const content = fs.readFileSync(pagePath, 'utf-8');

    // Endpoint usage
    expect(content).toContain('/api/agents');
    expect(content).toContain('/approvals?status=PENDING');
    expect(content).toContain('/approve');
    expect(content).toContain('/reject');

    // Empty state
    expect(content).toContain('No approvals waiting');
    expect(content).toContain('all caught up');

    // Governance notice (distinct from blockchain execution)
    expect(content).toContain('Governance Boundary');
    expect(content).toContain('distinct from blockchain settlement');

    // Zero private key or deprecated payment endpoint leakage
    expect(content).not.toContain('AGENT_PRIVATE_KEY');
    expect(content).not.toContain('/api/payments/send');
    expect(content).not.toContain('window.ethereum');
    expect(content).not.toContain('walletClient');
    expect(content).not.toContain('sendTransaction');
  });

  it('6. Frontend inspection: ApprovalCard displays zero float money, agent link, and safe actions', () => {
    const cardPath = path.resolve(__dirname, '../src/components/dashboard/ApprovalCard.tsx');
    const content = fs.readFileSync(cardPath, 'utf-8');

    // Navigation to agent
    expect(content).toContain('/dashboard/agents/${approval.agentId}');

    // Zero float formatting
    expect(content).toContain('formatCusdString');
    expect(content).not.toMatch(/parseFloat\(/);
    expect(content).not.toMatch(/Number\(approval\./);

    // Labels & context
    expect(content).toContain('Requested Amount');
    expect(content).toContain('cUSD');
    expect(content).toContain('Approve request');
    expect(content).toContain('Reject');

    // Safety checks
    expect(content).not.toContain('window.ethereum');
    expect(content).not.toContain('sendTransaction');
  });

  it('7. Frontend inspection: DashboardShell marks Approvals navigation as active', () => {
    const shellPath = path.resolve(__dirname, '../src/components/dashboard/DashboardShell.tsx');
    const content = fs.readFileSync(shellPath, 'utf-8');

    expect(content).toContain("{ label: 'Approvals', href: '/dashboard/approvals', status: 'active' }");
  });
});
