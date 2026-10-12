import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getSessionStore } from '../src/lib/auth';
import { getAgentStore, getAgentService } from '../src/lib/agent';
import { getBudgetStore } from '../src/lib/policy';
import { getPendingApprovalStore } from '../src/lib/payment';
import { POST as createPaymentRoute } from '../src/app/api/agents/[id]/payments/route';
import { POST as pauseAgentRoute } from '../src/app/api/agents/[id]/pause/route';
import { POST as terminateAgentRoute } from '../src/app/api/agents/[id]/terminate/route';
import * as fs from 'fs';
import * as path from 'path';

describe('Phase 9.6: Controlled Spending Request & Payment Simulation UI Invariants', () => {
  const ownerA = '0x1111111111111111111111111111111111111111';
  const ownerB = '0x2222222222222222222222222222222222222222';
  const validRecipient = '0x3333333333333333333333333333333333333333';
  const unauthorizedRecipient = '0x4444444444444444444444444444444444444444';
  const expectedOrigin = 'http://localhost:3000';

  let cookieA: string;
  let cookieB: string;
  let agentAId: string;

  const validPolicy = {
    maxPerTransaction: '10.00',
    maxPerDay: '25.00',
    autoApproveThreshold: '2.00', // <= 2.00 auto-approved (RESERVED), > 2.00 triggers REQUIRE_USER_APPROVAL
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
      name: 'Simulation Target Agent',
      spendingPolicy: validPolicy,
    });
    agentAId = agentA.id;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('1. POST /api/agents/[id]/payments returns RESERVED when within auto-approve threshold', async () => {
    const payReq = new Request(`http://localhost:3000/api/agents/${agentAId}/payments`, {
      method: 'POST',
      headers: {
        origin: expectedOrigin,
        cookie: cookieA,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        amountCusd: '1.50', // <= autoApproveThreshold (2.00)
        recipient: validRecipient,
        idempotencyKey: 'sim-test-reserved-1',
      }),
    });
    const payRes = await createPaymentRoute(payReq, { params: { id: agentAId } });
    expect(payRes.status).toBe(200);
    const payData = await payRes.json();
    expect(payData.success).toBe(true);
    expect(payData.data.outcome).toBe('RESERVED');
    expect(payData.data.allowedToExecute).toBe(true);
    expect(payData.data.reservation).toBeDefined();
    expect(payData.data.reservation.amountCusd).toBe('1.50');
  });

  it('2. POST /api/agents/[id]/payments returns REQUIRE_USER_APPROVAL when above auto-approve threshold', async () => {
    const payReq = new Request(`http://localhost:3000/api/agents/${agentAId}/payments`, {
      method: 'POST',
      headers: {
        origin: expectedOrigin,
        cookie: cookieA,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        amountCusd: '5.00', // > 2.00, but <= 10.00 maxPerTx
        recipient: validRecipient,
        idempotencyKey: 'sim-test-approval-1',
      }),
    });
    const payRes = await createPaymentRoute(payReq, { params: { id: agentAId } });
    expect(payRes.status).toBe(202);
    const payData = await payRes.json();
    expect(payData.data.outcome).toBe('REQUIRE_USER_APPROVAL');
    expect(payData.data.allowedToExecute).toBe(false);
    expect(payData.data.pendingApproval).toBeDefined();
    expect(payData.data.pendingApproval.amountCusd).toBe('5.00');
  });

  it('3. POST /api/agents/[id]/payments returns POLICY_DENIED when violating recipient or maxPerTransaction', async () => {
    // 1. Unauthorized recipient
    const payReq1 = new Request(`http://localhost:3000/api/agents/${agentAId}/payments`, {
      method: 'POST',
      headers: {
        origin: expectedOrigin,
        cookie: cookieA,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        amountCusd: '1.00',
        recipient: unauthorizedRecipient,
        idempotencyKey: 'sim-test-denied-recip',
      }),
    });
    const payRes1 = await createPaymentRoute(payReq1, { params: { id: agentAId } });
    expect(payRes1.status).toBe(422);
    const data1 = await payRes1.json();
    expect(data1.data.outcome).toBe('POLICY_DENIED');
    expect(data1.data.allowedToExecute).toBe(false);

    // 2. Exceeding maxPerTransaction (15.00 > 10.00)
    const payReq2 = new Request(`http://localhost:3000/api/agents/${agentAId}/payments`, {
      method: 'POST',
      headers: {
        origin: expectedOrigin,
        cookie: cookieA,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        amountCusd: '15.00',
        recipient: validRecipient,
        idempotencyKey: 'sim-test-denied-max',
      }),
    });
    const payRes2 = await createPaymentRoute(payReq2, { params: { id: agentAId } });
    expect(payRes2.status).toBe(422);
    const data2 = await payRes2.json();
    expect(data2.data.outcome).toBe('POLICY_DENIED');
  });

  it('4. POST /api/agents/[id]/payments returns BUDGET_DENIED when daily budget is exhausted', async () => {
    // Agent with autoApproveThreshold = 25.00, maxPerTx = 25.00, maxPerDay = 25.00
    const budgetAgent = await getAgentService().createAgent(ownerA, {
      name: 'Budget Test Agent',
      spendingPolicy: {
        maxPerTransaction: '25.00',
        maxPerDay: '25.00',
        autoApproveThreshold: '25.00',
        validUntil: Date.now() + 86400000,
        allowedRecipients: [validRecipient],
      },
    });

    // Reserve 2 payments of 10.00 (Total 20.00 / 25.00 limit)
    for (let i = 1; i <= 2; i++) {
      const fillRes = await createPaymentRoute(
        new Request(`http://localhost:3000/api/agents/${budgetAgent.id}/payments`, {
          method: 'POST',
          headers: { origin: expectedOrigin, cookie: cookieA, 'content-type': 'application/json' },
          body: JSON.stringify({
            amountCusd: '10.00',
            recipient: validRecipient,
            idempotencyKey: `fill-budget-${i}`,
          }),
        }),
        { params: { id: budgetAgent.id } }
      );
      expect(fillRes.status).toBe(200);
    }

    // Attempt spending 8.00 (20.00 + 8.00 = 28.00 > 25.00 daily limit!)
    const payReq = new Request(`http://localhost:3000/api/agents/${budgetAgent.id}/payments`, {
      method: 'POST',
      headers: {
        origin: expectedOrigin,
        cookie: cookieA,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        amountCusd: '8.00',
        recipient: validRecipient,
        idempotencyKey: 'sim-test-budget-denied',
      }),
    });
    const payRes = await createPaymentRoute(payReq, { params: { id: budgetAgent.id } });
    expect(payRes.status).toBe(422);
    const data = await payRes.json();
    expect(data.data.outcome).toBe('BUDGET_DENIED');
    expect(data.data.allowedToExecute).toBe(false);
  });

  it('5. Lifecycle enforcement: PAUSED and TERMINATED agents reject spending requests with 409', async () => {
    // 1. Pause agent
    await pauseAgentRoute(
      new Request(`http://localhost:3000/api/agents/${agentAId}/pause`, {
        method: 'POST',
        headers: { origin: expectedOrigin, cookie: cookieA, 'content-type': 'application/json' },
        body: JSON.stringify({ reason: 'Maintenance' }),
      }),
      { params: { id: agentAId } }
    );

    const payReqPaused = new Request(`http://localhost:3000/api/agents/${agentAId}/payments`, {
      method: 'POST',
      headers: { origin: expectedOrigin, cookie: cookieA, 'content-type': 'application/json' },
      body: JSON.stringify({
        amountCusd: '1.00',
        recipient: validRecipient,
        idempotencyKey: 'sim-paused-1',
      }),
    });
    const payResPaused = await createPaymentRoute(payReqPaused, { params: { id: agentAId } });
    expect(payResPaused.status).toBe(409);
    expect((await payResPaused.json()).error).toMatch(/paused/i);

    // 2. Terminate agent
    await terminateAgentRoute(
      new Request(`http://localhost:3000/api/agents/${agentAId}/terminate`, {
        method: 'POST',
        headers: { origin: expectedOrigin, cookie: cookieA, 'content-type': 'application/json' },
        body: JSON.stringify({ reason: 'Decommissioned' }),
      }),
      { params: { id: agentAId } }
    );

    const payReqTerm = new Request(`http://localhost:3000/api/agents/${agentAId}/payments`, {
      method: 'POST',
      headers: { origin: expectedOrigin, cookie: cookieA, 'content-type': 'application/json' },
      body: JSON.stringify({
        amountCusd: '1.00',
        recipient: validRecipient,
        idempotencyKey: 'sim-term-1',
      }),
    });
    const payResTerm = await createPaymentRoute(payReqTerm, { params: { id: agentAId } });
    expect(payResTerm.status).toBe(409);
    expect((await payResTerm.json()).error).toMatch(/terminated/i);
  });

  it('6. Frontend inspection: SpendingRequestDrawer component implements two-step review, zero float math, and outcome mapping', () => {
    const drawerPath = path.resolve(__dirname, '../src/components/dashboard/SpendingRequestDrawer.tsx');
    const content = fs.readFileSync(drawerPath, 'utf-8');

    // Two-step review flow
    expect(content).toContain('Review request →');
    expect(content).toContain('Submit request');
    expect(content).toContain('← Back');

    // Zero float math
    expect(content).toContain('formatCusdString');
    expect(content).not.toMatch(/parseFloat\(/);
    expect(content).not.toMatch(/Number\(amount/);

    // Outcome states
    expect(content).toContain('Spending request reserved');
    expect(content).toContain('Approval required');
    expect(content).toContain('Request denied');
    expect(content).toContain('Budget unavailable');
    expect(content).toContain('Request already in progress');
    expect(content).toContain('Request already processed');
    expect(content).toContain('Request conflict');

    // Navigates to approvals queue when approval is required
    expect(content).toContain('href="/dashboard/approvals"');

    // Retry and double-submission protection
    expect(content).toContain('Retry');
    expect(content).toContain('isSubmitting');

    // Strict security boundaries: no wallet signature or deprecated routes
    expect(content).not.toContain('window.ethereum');
    expect(content).not.toContain('sendTransaction');
    expect(content).not.toContain('AGENT_PRIVATE_KEY');
    expect(content).not.toContain('/api/payments/send');
  });

  it('7. Frontend inspection: Agent Detail page integrates Request Spending button and lifecycle constraints', () => {
    const detailPagePath = path.resolve(__dirname, '../src/app/dashboard/agents/[id]/page.tsx');
    const content = fs.readFileSync(detailPagePath, 'utf-8');

    // Request spending button
    expect(content).toContain('Request spending');
    expect(content).toContain('Request Spending');
    expect(content).toContain('<SpendingRequestDrawer');

    // Only active agents can request spending; paused shows explanatory notice
    expect(content).toContain('Spending paused');
    expect(content).toContain('Spending requests are unavailable while this agent is paused.');
    expect(content).toContain('This agent has been terminated and cannot submit new spending requests.');
  });

  it('8. Unit tests: validateSpendingForm enforces financial string precision and address checks', async () => {
    const { validateSpendingForm } = await import('../src/lib/payment/spending-request-utils');

    // Valid inputs
    expect(validateSpendingForm('8.50', validRecipient, '').valid).toBe(true);
    expect(validateSpendingForm('0.01', validRecipient, 'Valid purpose').valid).toBe(true);
    expect(validateSpendingForm('100', validRecipient, '').valid).toBe(true);
    expect(validateSpendingForm('0.123456789012345678', validRecipient, '').valid).toBe(true);

    // Invalid amounts: empty, non-numeric, negative, zero, >18 decimals
    expect(validateSpendingForm('', validRecipient, '').valid).toBe(false);
    expect(validateSpendingForm('abc', validRecipient, '').valid).toBe(false);
    expect(validateSpendingForm('-5.00', validRecipient, '').valid).toBe(false);
    expect(validateSpendingForm('0', validRecipient, '').valid).toBe(false);
    expect(validateSpendingForm('0.00', validRecipient, '').valid).toBe(false);
    expect(validateSpendingForm('0.000000000000000000', validRecipient, '').valid).toBe(false);
    expect(validateSpendingForm('1.1234567890123456789', validRecipient, '').error).toMatch(/18 decimal/i);

    // Invalid recipient: empty, non-hex, invalid length
    expect(validateSpendingForm('1.00', '', '').error).toMatch(/recipient address is required/i);
    expect(validateSpendingForm('1.00', '0x123', '').error).toMatch(/valid 40-character hex EVM address/i);
    expect(validateSpendingForm('1.00', 'not-an-address', '').error).toMatch(/valid 40-character hex EVM address/i);

    // Purpose length > 500
    const longPurpose = 'a'.repeat(501);
    expect(validateSpendingForm('1.00', validRecipient, longPurpose).error).toMatch(/500 characters/i);
  });

  it('9. Unit tests: formatCusdString formats decimal string values without floating-point arithmetic', async () => {
    const { formatCusdString } = await import('../src/lib/payment/spending-request-utils');

    expect(formatCusdString('')).toBe('$0.00 cUSD');
    expect(formatCusdString('10')).toBe('$10.00 cUSD');
    expect(formatCusdString('10.5')).toBe('$10.50 cUSD');
    expect(formatCusdString('10.25')).toBe('$10.25 cUSD');
    expect(formatCusdString('10.1234')).toBe('$10.1234 cUSD');
  });

  it('10. Unit tests: generateIdempotencyKey generates unique prefixed keys', async () => {
    const { generateIdempotencyKey } = await import('../src/lib/payment/spending-request-utils');

    const key1 = generateIdempotencyKey();
    const key2 = generateIdempotencyKey();
    expect(key1).toMatch(/^sim_\d+_[a-z0-9]+$/);
    expect(key2).toMatch(/^sim_\d+_[a-z0-9]+$/);
    expect(key1).not.toBe(key2);
  });

  it('11. API contract: client-supplied ownerAddress is strictly forbidden', async () => {
    const forbiddenReq = new Request(`http://localhost:3000/api/agents/${agentAId}/payments`, {
      method: 'POST',
      headers: {
        origin: expectedOrigin,
        cookie: cookieA,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        amountCusd: '1.00',
        recipient: validRecipient,
        idempotencyKey: 'sim-test-forbidden-owner',
        ownerAddress: ownerA, // FORBIDDEN: must be rejected!
      }),
    });
    const res = await createPaymentRoute(forbiddenReq, { params: { id: agentAId } });
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.success).toBe(false);
    expect(json.error).toMatch(/forbidden field.*ownerAddress/i);
  });

  it('12. API contract: handles IDEMPOTENCY_CONFLICT when same key is submitted with differing parameters', async () => {
    const key = 'sim-test-conflict-key';
    // 1. Submit request requiring approval
    const payReq1 = new Request(`http://localhost:3000/api/agents/${agentAId}/payments`, {
      method: 'POST',
      headers: { origin: expectedOrigin, cookie: cookieA, 'content-type': 'application/json' },
      body: JSON.stringify({
        amountCusd: '5.00',
        recipient: validRecipient,
        idempotencyKey: key,
      }),
    });
    const res1 = await createPaymentRoute(payReq1, { params: { id: agentAId } });
    expect(res1.status).toBe(202);

    // 2. Submit conflicting request with same idempotencyKey but different amount
    const payReq2 = new Request(`http://localhost:3000/api/agents/${agentAId}/payments`, {
      method: 'POST',
      headers: { origin: expectedOrigin, cookie: cookieA, 'content-type': 'application/json' },
      body: JSON.stringify({
        amountCusd: '6.00', // Different amount!
        recipient: validRecipient,
        idempotencyKey: key,
      }),
    });
    const res2 = await createPaymentRoute(payReq2, { params: { id: agentAId } });
    expect(res2.status).toBe(409);
    const data2 = await res2.json();
    expect(data2.data.outcome).toBe('IDEMPOTENCY_CONFLICT');
  });

  it('13. Drawer lifecycle guard prevents submission when agent is PAUSED or TERMINATED', () => {
    const drawerPath = path.resolve(__dirname, '../src/components/dashboard/SpendingRequestDrawer.tsx');
    const content = fs.readFileSync(drawerPath, 'utf-8');

    // Lifecycle check
    expect(content).toContain("agent.status !== 'ACTIVE'");
    expect(content).toContain('Spending requests unavailable');
    expect(content).toContain('Spending requests are unavailable while this agent is paused.');
    expect(content).toContain('This agent has been terminated and cannot submit new spending requests.');
  });

  it('14. Phase 9.7: Modal accessibility (role="dialog", aria-modal, Escape listeners, max-h safeguards)', () => {
    const modalFiles = [
      '../src/components/dashboard/CreateAgentModal.tsx',
      '../src/components/dashboard/LifecycleModal.tsx',
      '../src/components/dashboard/ApprovalConfirmationModal.tsx',
      '../src/components/dashboard/ApprovalRejectModal.tsx',
      '../src/components/dashboard/SpendingRequestDrawer.tsx',
    ];

    for (const relPath of modalFiles) {
      const fullPath = path.resolve(__dirname, relPath);
      const content = fs.readFileSync(fullPath, 'utf-8');

      // Verify modal role and modal attribute
      expect(content).toContain('role="dialog"');
      expect(content).toContain('aria-modal="true"');

      // Verify Escape key handling
      expect(content).toContain("'Escape'");
      expect(content).toContain("addEventListener('keydown'");

      // Verify scroll / max-h safeguard
      expect(content).toContain('max-h-[90vh]');
      expect(content).toContain('overflow-y-auto');

      // Verify backdrop dismissal
      expect(content).toContain('e.target === e.currentTarget');
    }
  });

  it('15. Phase 9.7: Responsive header and navigation wrapping safeguards', () => {
    const shellPath = path.resolve(__dirname, '../src/components/dashboard/DashboardShell.tsx');
    const shellContent = fs.readFileSync(shellPath, 'utf-8');
    expect(shellContent).toContain('aria-label="Dashboard navigation"');
    expect(shellContent).toContain('flex-wrap');

    const walletPath = path.resolve(__dirname, '../src/components/dashboard/WalletStatus.tsx');
    const walletContent = fs.readFileSync(walletPath, 'utf-8');
    expect(walletContent).toContain('hidden sm:inline');
    expect(walletContent).toContain('sm:hidden');

    const agentCardPath = path.resolve(__dirname, '../src/components/dashboard/AgentCard.tsx');
    const agentCardContent = fs.readFileSync(agentCardPath, 'utf-8');
    expect(agentCardContent).toContain('flex-wrap');

    const agentDetailPath = path.resolve(__dirname, '../src/app/dashboard/agents/[id]/page.tsx');
    const agentDetailContent = fs.readFileSync(agentDetailPath, 'utf-8');
    expect(agentDetailContent).toContain('flex-wrap');
  });
});
