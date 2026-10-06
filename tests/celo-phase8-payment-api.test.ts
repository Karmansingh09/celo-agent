import { describe, it, expect, beforeEach } from 'vitest';
import { getSessionStore } from '../src/lib/auth';
import { getAgentStore, getAgentService } from '../src/lib/agent';
import { getBudgetStore } from '../src/lib/policy';
import { getPendingApprovalStore } from '../src/lib/payment';
import { POST as createPaymentRoute } from '../src/app/api/agents/[id]/payments/route';
import { GET as listApprovalsRoute } from '../src/app/api/agents/[id]/approvals/route';
import { POST as approveRoute } from '../src/app/api/agents/[id]/approvals/[requestId]/approve/route';
import { POST as rejectRoute } from '../src/app/api/agents/[id]/approvals/[requestId]/reject/route';

describe('Phase 8.4: Controlled Payment & Approval API Layer', () => {
  const ownerA = '0x1111111111111111111111111111111111111111';
  const ownerB = '0x2222222222222222222222222222222222222222';
  const validRecipient = '0x3333333333333333333333333333333333333333';
  const otherRecipient = '0x4444444444444444444444444444444444444444';
  const expectedOrigin = 'http://localhost:3000';

  let cookieA: string;
  let cookieB: string;
  let agentAId: string;
  let agentBId: string;

  const validPolicy = {
    maxPerTransaction: '5.0',
    maxPerDay: '20.0',
    autoApproveThreshold: '1.0', // Amounts > 1.0 require user approval
    validUntil: Date.now() + 86_400_000 * 7,
    allowedRecipients: [validRecipient],
  };

  beforeEach(async () => {
    // Clear in-memory stores for clean test state
    getSessionStore().clear();
    getAgentStore().clear();
    getBudgetStore().clear();
    getPendingApprovalStore().clear();

    // Authenticated sessions
    const sessionA = await getSessionStore().createSession(ownerA);
    cookieA = `celo_agent_session=${sessionA.rawSessionToken}`;

    const sessionB = await getSessionStore().createSession(ownerB);
    cookieB = `celo_agent_session=${sessionB.rawSessionToken}`;

    // Seed agent for Owner A
    const agentA = await getAgentService().createAgent(ownerA, {
      name: 'Agent Alpha',
      spendingPolicy: validPolicy,
    });
    agentAId = agentA.id;

    // Seed agent for Owner B
    const agentB = await getAgentService().createAgent(ownerB, {
      name: 'Agent Beta',
      spendingPolicy: validPolicy,
    });
    agentBId = agentB.id;
  });

  // ============================================================================
  // 1. AUTHENTICATION ENFORCEMENT
  // ============================================================================
  describe('Authentication Enforcement', () => {
    it('1. POST payment without session → rejected with 401', async () => {
      const req = new Request(`http://localhost:3000/api/agents/${agentAId}/payments`, {
        method: 'POST',
        headers: {
          origin: expectedOrigin,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          amountCusd: '0.50',
          recipient: validRecipient,
          idempotencyKey: 'auth-test-1',
        }),
      });

      const res = await createPaymentRoute(req, { params: { id: agentAId } });
      expect(res.status).toBe(401);
      expect(res.headers.get('cache-control')).toContain('no-store');
      const json = await res.json();
      expect(json.success).toBe(false);
      expect(json.error).toMatch(/Authentication required/i);
    });

    it('2. GET approvals without session → rejected with 401', async () => {
      const req = new Request(`http://localhost:3000/api/agents/${agentAId}/approvals`);
      const res = await listApprovalsRoute(req, { params: { id: agentAId } });
      expect(res.status).toBe(401);
      expect(res.headers.get('cache-control')).toContain('no-store');
      const json = await res.json();
      expect(json.success).toBe(false);
    });

    it('3. POST approve without session → rejected with 401', async () => {
      const req = new Request(`http://localhost:3000/api/agents/${agentAId}/approvals/req_12345678_abcd/approve`, {
        method: 'POST',
        headers: {
          origin: expectedOrigin,
        },
      });
      const res = await approveRoute(req, { params: { id: agentAId, requestId: 'req_12345678_abcd' } });
      expect(res.status).toBe(401);
      expect(res.headers.get('cache-control')).toContain('no-store');
      const json = await res.json();
      expect(json.success).toBe(false);
    });

    it('4. POST reject without session → rejected with 401', async () => {
      const req = new Request(`http://localhost:3000/api/agents/${agentAId}/approvals/req_12345678_abcd/reject`, {
        method: 'POST',
        headers: {
          origin: expectedOrigin,
        },
      });
      const res = await rejectRoute(req, { params: { id: agentAId, requestId: 'req_12345678_abcd' } });
      expect(res.status).toBe(401);
      expect(res.headers.get('cache-control')).toContain('no-store');
      const json = await res.json();
      expect(json.success).toBe(false);
    });
  });

  // ============================================================================
  // 2. CSRF PROTECTION
  // ============================================================================
  describe('CSRF Protection', () => {
    it('5. POST payment with invalid origin → rejected with 403', async () => {
      const req = new Request(`http://localhost:3000/api/agents/${agentAId}/payments`, {
        method: 'POST',
        headers: {
          cookie: cookieA,
          origin: 'http://evil-attacker.com',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          amountCusd: '0.50',
          recipient: validRecipient,
          idempotencyKey: 'csrf-test-1',
        }),
      });

      const res = await createPaymentRoute(req, { params: { id: agentAId } });
      expect(res.status).toBe(403);
      expect(res.headers.get('cache-control')).toContain('no-store');
      const json = await res.json();
      expect(json.success).toBe(false);
      expect(json.error).toMatch(/CSRF protection/i);
    });

    it('6. POST approve with invalid origin → rejected with 403', async () => {
      const req = new Request(`http://localhost:3000/api/agents/${agentAId}/approvals/req_12345678_abcd/approve`, {
        method: 'POST',
        headers: {
          cookie: cookieA,
          origin: 'http://evil-attacker.com',
        },
      });

      const res = await approveRoute(req, { params: { id: agentAId, requestId: 'req_12345678_abcd' } });
      expect(res.status).toBe(403);
      expect(res.headers.get('cache-control')).toContain('no-store');
      const json = await res.json();
      expect(json.success).toBe(false);
    });

    it('7. POST reject with invalid origin → rejected with 403', async () => {
      const req = new Request(`http://localhost:3000/api/agents/${agentAId}/approvals/req_12345678_abcd/reject`, {
        method: 'POST',
        headers: {
          cookie: cookieA,
          origin: 'http://evil-attacker.com',
        },
      });

      const res = await rejectRoute(req, { params: { id: agentAId, requestId: 'req_12345678_abcd' } });
      expect(res.status).toBe(403);
      expect(res.headers.get('cache-control')).toContain('no-store');
      const json = await res.json();
      expect(json.success).toBe(false);
    });

    it('8. GET approvals does not require CSRF', async () => {
      const req = new Request(`http://localhost:3000/api/agents/${agentAId}/approvals`, {
        headers: {
          cookie: cookieA,
          // No origin header provided for GET
        },
      });

      const res = await listApprovalsRoute(req, { params: { id: agentAId } });
      expect(res.status).toBe(200);
      expect(res.headers.get('cache-control')).toContain('no-store');
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(Array.isArray(json.data)).toBe(true);
    });
  });

  // ============================================================================
  // 3. PAYMENT CREATION & VALIDATION
  // ============================================================================
  describe('Payment Creation & Validation', () => {
    it('9. Valid payment request under threshold for owned ACTIVE agent succeeds with RESERVED', async () => {
      const req = new Request(`http://localhost:3000/api/agents/${agentAId}/payments`, {
        method: 'POST',
        headers: {
          cookie: cookieA,
          origin: expectedOrigin,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          amountCusd: '0.50',
          recipient: validRecipient,
          idempotencyKey: 'pay-valid-1',
          purpose: 'Server fee',
        }),
      });

      const res = await createPaymentRoute(req, { params: { id: agentAId } });
      expect(res.status).toBe(200);
      expect(res.headers.get('cache-control')).toContain('no-store');
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.data.outcome).toBe('RESERVED');
      expect(json.data.allowedToExecute).toBe(true);
      expect(json.data.reservation).toBeDefined();
      expect(json.data.reservation.amountCusd).toBe('0.50');
    });

    it('10. Unknown request body field is rejected with 400', async () => {
      const req = new Request(`http://localhost:3000/api/agents/${agentAId}/payments`, {
        method: 'POST',
        headers: {
          cookie: cookieA,
          origin: expectedOrigin,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          amountCusd: '0.50',
          recipient: validRecipient,
          idempotencyKey: 'pay-unknown-1',
          maliciousParam: 'injected',
        }),
      });

      const res = await createPaymentRoute(req, { params: { id: agentAId } });
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.success).toBe(false);
      expect(json.error).toMatch(/Unexpected or forbidden field: "maliciousParam"/);
    });

    it('11. Client-supplied ownerAddress in body is rejected with 400', async () => {
      const req = new Request(`http://localhost:3000/api/agents/${agentAId}/payments`, {
        method: 'POST',
        headers: {
          cookie: cookieA,
          origin: expectedOrigin,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          amountCusd: '0.50',
          recipient: validRecipient,
          idempotencyKey: 'pay-owner-override-1',
          ownerAddress: ownerB,
        }),
      });

      const res = await createPaymentRoute(req, { params: { id: agentAId } });
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.success).toBe(false);
      expect(json.error).toMatch(/Unexpected or forbidden field: "ownerAddress"/);
    });

    it('12. Invalid amount format is rejected with 400', async () => {
      const req = new Request(`http://localhost:3000/api/agents/${agentAId}/payments`, {
        method: 'POST',
        headers: {
          cookie: cookieA,
          origin: expectedOrigin,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          amountCusd: 'not-a-number',
          recipient: validRecipient,
          idempotencyKey: 'pay-invalid-amt',
        }),
      });

      const res = await createPaymentRoute(req, { params: { id: agentAId } });
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.success).toBe(false);
    });

    it('13. Invalid recipient address is rejected with 400', async () => {
      const req = new Request(`http://localhost:3000/api/agents/${agentAId}/payments`, {
        method: 'POST',
        headers: {
          cookie: cookieA,
          origin: expectedOrigin,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          amountCusd: '0.50',
          recipient: '0xnotanaddress',
          idempotencyKey: 'pay-invalid-recip',
        }),
      });

      const res = await createPaymentRoute(req, { params: { id: agentAId } });
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.success).toBe(false);
    });

    it('14. Missing idempotencyKey is rejected with 400', async () => {
      const req = new Request(`http://localhost:3000/api/agents/${agentAId}/payments`, {
        method: 'POST',
        headers: {
          cookie: cookieA,
          origin: expectedOrigin,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          amountCusd: '0.50',
          recipient: validRecipient,
        }),
      });

      const res = await createPaymentRoute(req, { params: { id: agentAId } });
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.success).toBe(false);
      expect(json.error).toMatch(/idempotencyKey is required/);
    });

    it('15. Policy denial (unauthorized recipient) is mapped correctly with 422', async () => {
      const req = new Request(`http://localhost:3000/api/agents/${agentAId}/payments`, {
        method: 'POST',
        headers: {
          cookie: cookieA,
          origin: expectedOrigin,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          amountCusd: '0.50',
          recipient: otherRecipient, // not in allowedRecipients
          idempotencyKey: 'pay-policy-denied',
        }),
      });

      const res = await createPaymentRoute(req, { params: { id: agentAId } });
      expect(res.status).toBe(422);
      const json = await res.json();
      expect(json.data.outcome).toBe('POLICY_DENIED');
      expect(json.data.allowedToExecute).toBe(false);
    });

    it('16. Budget denial (exceeding daily limit) is mapped correctly with 422', async () => {
      // Create dedicated agent with autoApproveThreshold = maxPerDay = 1.00
      const budgetAgent = await getAgentService().createAgent(ownerA, {
        name: 'Budget Denial Agent',
        spendingPolicy: {
          maxPerTransaction: '1.00',
          maxPerDay: '1.00',
          autoApproveThreshold: '1.00',
          validUntil: Date.now() + 86_400_000,
          allowedRecipients: [validRecipient],
        },
      });

      // 1st request: 0.80 cUSD -> RESERVED
      const req1 = new Request(`http://localhost:3000/api/agents/${budgetAgent.id}/payments`, {
        method: 'POST',
        headers: {
          cookie: cookieA,
          origin: expectedOrigin,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          amountCusd: '0.80',
          recipient: validRecipient,
          idempotencyKey: 'budget-fill-1',
        }),
      });
      const res1 = await createPaymentRoute(req1, { params: { id: budgetAgent.id } });
      expect(res1.status).toBe(200);

      // 2nd request: 0.40 cUSD (<= maxPerTransaction, <= autoApproveThreshold, but 0.80 + 0.40 > 1.00 daily limit!)
      const req2 = new Request(`http://localhost:3000/api/agents/${budgetAgent.id}/payments`, {
        method: 'POST',
        headers: {
          cookie: cookieA,
          origin: expectedOrigin,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          amountCusd: '0.40',
          recipient: validRecipient,
          idempotencyKey: 'budget-denied-2',
        }),
      });
      const res2 = await createPaymentRoute(req2, { params: { id: budgetAgent.id } });
      expect(res2.status).toBe(422);
      const json2 = await res2.json();
      expect(json2.data.outcome).toBe('BUDGET_DENIED');
      expect(json2.data.allowedToExecute).toBe(false);
    });

    it('17. Approval-required request creates pending approval and returns 202', async () => {
      const req = new Request(`http://localhost:3000/api/agents/${agentAId}/payments`, {
        method: 'POST',
        headers: {
          cookie: cookieA,
          origin: expectedOrigin,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          amountCusd: '2.50', // > autoApproveThreshold 1.00
          recipient: validRecipient,
          idempotencyKey: 'pay-needs-approval-1',
        }),
      });

      const res = await createPaymentRoute(req, { params: { id: agentAId } });
      expect(res.status).toBe(202);
      const json = await res.json();
      expect(json.data.outcome).toBe('REQUIRE_USER_APPROVAL');
      expect(json.data.allowedToExecute).toBe(false);
      expect(json.data.pendingApproval).toBeDefined();
      expect(json.data.pendingApproval.status).toBe('PENDING');
      expect(json.data.pendingApproval.amountCusd).toBe('2.50');
    });
  });

  // ============================================================================
  // 4. OWNERSHIP & ANTI-ENUMERATION
  // ============================================================================
  describe('Ownership & Anti-Enumeration', () => {
    it('18. Non-owner cannot create payment for another agent (returns 404)', async () => {
      const req = new Request(`http://localhost:3000/api/agents/${agentBId}/payments`, {
        method: 'POST',
        headers: {
          cookie: cookieA, // Owner A targeting Owner B's agent
          origin: expectedOrigin,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          amountCusd: '0.50',
          recipient: validRecipient,
          idempotencyKey: 'cross-owner-pay',
        }),
      });

      const res = await createPaymentRoute(req, { params: { id: agentBId } });
      expect(res.status).toBe(404);
      const json = await res.json();
      expect(json.error).toBe(`Agent not found: ${agentBId}`);
    });

    it('19. Non-owner cannot list another agent\'s approvals (returns 404)', async () => {
      const req = new Request(`http://localhost:3000/api/agents/${agentBId}/approvals`, {
        headers: {
          cookie: cookieA,
        },
      });

      const res = await listApprovalsRoute(req, { params: { id: agentBId } });
      expect(res.status).toBe(404);
      const json = await res.json();
      expect(json.error).toBe(`Agent not found: ${agentBId}`);
    });

    it('20. Non-owner cannot approve another agent\'s approval (returns 404)', async () => {
      // Create pending approval under Agent B
      const reqCreate = new Request(`http://localhost:3000/api/agents/${agentBId}/payments`, {
        method: 'POST',
        headers: {
          cookie: cookieB,
          origin: expectedOrigin,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          amountCusd: '2.00',
          recipient: validRecipient,
          idempotencyKey: 'agent-b-pending-1',
        }),
      });
      const resCreate = await createPaymentRoute(reqCreate, { params: { id: agentBId } });
      const jsonCreate = await resCreate.json();
      const requestId = jsonCreate.data.pendingApproval.requestId;

      // Owner A attempts to approve Agent B's approval
      const reqApprove = new Request(`http://localhost:3000/api/agents/${agentBId}/approvals/${requestId}/approve`, {
        method: 'POST',
        headers: {
          cookie: cookieA,
          origin: expectedOrigin,
        },
      });
      const resApprove = await approveRoute(reqApprove, { params: { id: agentBId, requestId } });
      expect(resApprove.status).toBe(404);
      const jsonApprove = await resApprove.json();
      expect(jsonApprove.error).toBe(`Agent not found: ${agentBId}`);
    });

    it('21. Non-owner cannot reject another agent\'s approval (returns 404)', async () => {
      // Create pending approval under Agent B
      const reqCreate = new Request(`http://localhost:3000/api/agents/${agentBId}/payments`, {
        method: 'POST',
        headers: {
          cookie: cookieB,
          origin: expectedOrigin,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          amountCusd: '2.00',
          recipient: validRecipient,
          idempotencyKey: 'agent-b-pending-reject',
        }),
      });
      const resCreate = await createPaymentRoute(reqCreate, { params: { id: agentBId } });
      const jsonCreate = await resCreate.json();
      const requestId = jsonCreate.data.pendingApproval.requestId;

      // Owner A attempts to reject Agent B's approval
      const reqReject = new Request(`http://localhost:3000/api/agents/${agentBId}/approvals/${requestId}/reject`, {
        method: 'POST',
        headers: {
          cookie: cookieA,
          origin: expectedOrigin,
        },
      });
      const resReject = await rejectRoute(reqReject, { params: { id: agentBId, requestId } });
      expect(resReject.status).toBe(404);
      const jsonReject = await resReject.json();
      expect(jsonReject.error).toBe(`Agent not found: ${agentBId}`);
    });

    it('22. Nonexistent agent ID returns identical 404', async () => {
      const nonExistent = 'agent_nonexistent1234567890';
      const req = new Request(`http://localhost:3000/api/agents/${nonExistent}/approvals`, {
        headers: {
          cookie: cookieA,
        },
      });
      const res = await listApprovalsRoute(req, { params: { id: nonExistent } });
      expect(res.status).toBe(404);
      const json = await res.json();
      expect(json.error).toBe(`Agent not found: ${nonExistent}`);
    });
  });

  // ============================================================================
  // 5. APPROVAL WORKFLOWS
  // ============================================================================
  describe('Approval Workflows', () => {
    it('23. GET approvals returns pending approvals list for authenticated owner', async () => {
      // Create 2 pending approvals
      for (let i = 1; i <= 2; i++) {
        const req = new Request(`http://localhost:3000/api/agents/${agentAId}/payments`, {
          method: 'POST',
          headers: {
            cookie: cookieA,
            origin: expectedOrigin,
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            amountCusd: '2.00',
            recipient: validRecipient,
            idempotencyKey: `list-appr-${i}`,
          }),
        });
        await createPaymentRoute(req, { params: { id: agentAId } });
      }

      const reqList = new Request(`http://localhost:3000/api/agents/${agentAId}/approvals`, {
        headers: { cookie: cookieA },
      });
      const resList = await listApprovalsRoute(reqList, { params: { id: agentAId } });
      expect(resList.status).toBe(200);
      const jsonList = await resList.json();
      expect(jsonList.success).toBe(true);
      expect(jsonList.data.length).toBe(2);
      expect(jsonList.count).toBe(2);
    });

    it('24. Approve succeeds for valid pending approval and reserves budget', async () => {
      // 1. Submit request > autoApproveThreshold
      const reqCreate = new Request(`http://localhost:3000/api/agents/${agentAId}/payments`, {
        method: 'POST',
        headers: {
          cookie: cookieA,
          origin: expectedOrigin,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          amountCusd: '3.00',
          recipient: validRecipient,
          idempotencyKey: 'approve-flow-1',
        }),
      });
      const resCreate = await createPaymentRoute(reqCreate, { params: { id: agentAId } });
      const jsonCreate = await resCreate.json();
      const requestId = jsonCreate.data.pendingApproval.requestId;

      // 2. Approve via POST /approve
      const reqApprove = new Request(`http://localhost:3000/api/agents/${agentAId}/approvals/${requestId}/approve`, {
        method: 'POST',
        headers: {
          cookie: cookieA,
          origin: expectedOrigin,
        },
      });
      const resApprove = await approveRoute(reqApprove, { params: { id: agentAId, requestId } });
      expect(resApprove.status).toBe(200);
      const jsonApprove = await resApprove.json();
      expect(jsonApprove.success).toBe(true);
      expect(jsonApprove.data.outcome).toBe('RESERVED');
      expect(jsonApprove.data.reservation).toBeDefined();
      expect(jsonApprove.data.pendingApproval.status).toBe('APPROVED');
    });

    it('25. Approve re-evaluates current policy/budget through the service (fails if budget now exhausted)', async () => {
      // 1. Create pending approval for 4.00 cUSD (valid within 20 cUSD limit)
      const reqCreate = new Request(`http://localhost:3000/api/agents/${agentAId}/payments`, {
        method: 'POST',
        headers: {
          cookie: cookieA,
          origin: expectedOrigin,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          amountCusd: '4.00',
          recipient: validRecipient,
          idempotencyKey: 'approve-exhaust-1',
        }),
      });
      const resCreate = await createPaymentRoute(reqCreate, { params: { id: agentAId } });
      const jsonCreate = await resCreate.json();
      const requestId = jsonCreate.data.pendingApproval.requestId;

      // 2. Exhaust budget via direct payments (spend 18.00 cUSD in 0.50 increments or modify budget)
      // We directly make 4 payments of 0.50 then one larger one to fill budget:
      // Policy allows maxPerTx: 5.0, maxPerDay: 20.0
      for (let i = 1; i <= 4; i++) {
        const reqSpend = new Request(`http://localhost:3000/api/agents/${agentAId}/payments`, {
          method: 'POST',
          headers: {
            cookie: cookieA,
            origin: expectedOrigin,
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            amountCusd: '4.50',
            recipient: validRecipient,
            idempotencyKey: `exhaust-spend-${i}`,
          }),
        });
        // Requires approval because 4.50 > 1.00; so let's approve them to reserve budget
        const resSpend = await createPaymentRoute(reqSpend, { params: { id: agentAId } });
        const jsonSpend = await resSpend.json();
        const spendApprId = jsonSpend.data.pendingApproval.requestId;

        await approveRoute(new Request(`http://localhost:3000/api/agents/${agentAId}/approvals/${spendApprId}/approve`, {
          method: 'POST',
          headers: { cookie: cookieA, origin: expectedOrigin },
        }), { params: { id: agentAId, requestId: spendApprId } });
      }
      // Total reserved so far: 4 * 4.50 = 18.00 cUSD. Remaining: 2.00 cUSD.

      // 3. Attempt to approve original 4.00 cUSD request: 18 + 4 = 22 > 20 limit!
      const reqApproveOriginal = new Request(`http://localhost:3000/api/agents/${agentAId}/approvals/${requestId}/approve`, {
        method: 'POST',
        headers: {
          cookie: cookieA,
          origin: expectedOrigin,
        },
      });
      const resApproveOriginal = await approveRoute(reqApproveOriginal, { params: { id: agentAId, requestId } });
      expect(resApproveOriginal.status).toBe(422); // Re-evaluation denied by budget
      const jsonApproveOriginal = await resApproveOriginal.json();
      expect(jsonApproveOriginal.data.outcome).toBe('BUDGET_DENIED');
    });

    it('26. Reject succeeds for valid pending approval', async () => {
      const reqCreate = new Request(`http://localhost:3000/api/agents/${agentAId}/payments`, {
        method: 'POST',
        headers: {
          cookie: cookieA,
          origin: expectedOrigin,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          amountCusd: '2.00',
          recipient: validRecipient,
          idempotencyKey: 'reject-flow-1',
        }),
      });
      const resCreate = await createPaymentRoute(reqCreate, { params: { id: agentAId } });
      const jsonCreate = await resCreate.json();
      const requestId = jsonCreate.data.pendingApproval.requestId;

      const reqReject = new Request(`http://localhost:3000/api/agents/${agentAId}/approvals/${requestId}/reject`, {
        method: 'POST',
        headers: {
          cookie: cookieA,
          origin: expectedOrigin,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          reason: 'Too expensive',
        }),
      });
      const resReject = await rejectRoute(reqReject, { params: { id: agentAId, requestId } });
      expect(resReject.status).toBe(200);
      const jsonReject = await resReject.json();
      expect(jsonReject.success).toBe(true);
      expect(jsonReject.data.status).toBe('REJECTED');
      expect(jsonReject.data.statusReason).toBe('Too expensive');
    });

    it('27. Expired approval cannot be approved (returns 409)', async () => {
      const store = getPendingApprovalStore();
      const expiredAppr = await store.create({
        requestId: 'req_11111111_expired',
        agentId: agentAId,
        amountCusd: '2.00',
        recipient: validRecipient,
        idempotencyKey: 'expired-key-1',
        createdAt: Date.now() - 100_000,
        validUntil: Date.now() - 10_000, // in the past
        status: 'PENDING',
      });

      const reqApprove = new Request(`http://localhost:3000/api/agents/${agentAId}/approvals/${expiredAppr.requestId}/approve`, {
        method: 'POST',
        headers: {
          cookie: cookieA,
          origin: expectedOrigin,
        },
      });
      const resApprove = await approveRoute(reqApprove, { params: { id: agentAId, requestId: expiredAppr.requestId } });
      expect(resApprove.status).toBe(409);
    });

    it('28. Already approved approval cannot be approved or rejected again (returns 409)', async () => {
      const reqCreate = new Request(`http://localhost:3000/api/agents/${agentAId}/payments`, {
        method: 'POST',
        headers: {
          cookie: cookieA,
          origin: expectedOrigin,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          amountCusd: '2.00',
          recipient: validRecipient,
          idempotencyKey: 'already-appr-flow',
        }),
      });
      const resCreate = await createPaymentRoute(reqCreate, { params: { id: agentAId } });
      const jsonCreate = await resCreate.json();
      const requestId = jsonCreate.data.pendingApproval.requestId;

      // Approve once
      await approveRoute(new Request(`http://localhost:3000/api/agents/${agentAId}/approvals/${requestId}/approve`, {
        method: 'POST',
        headers: { cookie: cookieA, origin: expectedOrigin },
      }), { params: { id: agentAId, requestId } });

      // Approve second time
      const resSecond = await approveRoute(new Request(`http://localhost:3000/api/agents/${agentAId}/approvals/${requestId}/approve`, {
        method: 'POST',
        headers: { cookie: cookieA, origin: expectedOrigin },
      }), { params: { id: agentAId, requestId } });
      expect(resSecond.status).toBe(409);

      // Reject already approved
      const resReject = await rejectRoute(new Request(`http://localhost:3000/api/agents/${agentAId}/approvals/${requestId}/reject`, {
        method: 'POST',
        headers: { cookie: cookieA, origin: expectedOrigin },
      }), { params: { id: agentAId, requestId } });
      expect(resReject.status).toBe(409);
    });
  });

  // ============================================================================
  // 6. AGENT LIFECYCLE ENFORCEMENT
  // ============================================================================
  describe('Agent Lifecycle Enforcement', () => {
    it('29. Paused agent cannot create payment (returns 409)', async () => {
      await getAgentService().pauseAgent(ownerA, agentAId);

      const req = new Request(`http://localhost:3000/api/agents/${agentAId}/payments`, {
        method: 'POST',
        headers: {
          cookie: cookieA,
          origin: expectedOrigin,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          amountCusd: '0.50',
          recipient: validRecipient,
          idempotencyKey: 'paused-pay-1',
        }),
      });

      const res = await createPaymentRoute(req, { params: { id: agentAId } });
      expect(res.status).toBe(409);
      const json = await res.json();
      expect(json.error).toMatch(/paused agent/i);
    });

    it('30. Terminated agent cannot create payment (returns 409)', async () => {
      await getAgentService().terminateAgent(ownerA, agentAId);

      const req = new Request(`http://localhost:3000/api/agents/${agentAId}/payments`, {
        method: 'POST',
        headers: {
          cookie: cookieA,
          origin: expectedOrigin,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          amountCusd: '0.50',
          recipient: validRecipient,
          idempotencyKey: 'terminated-pay-1',
        }),
      });

      const res = await createPaymentRoute(req, { params: { id: agentAId } });
      expect(res.status).toBe(409);
      const json = await res.json();
      expect(json.error).toMatch(/terminated agent/i);
    });

    it('31. Paused agent cannot approve pending payment (returns 409)', async () => {
      // Create pending approval while ACTIVE
      const reqCreate = new Request(`http://localhost:3000/api/agents/${agentAId}/payments`, {
        method: 'POST',
        headers: {
          cookie: cookieA,
          origin: expectedOrigin,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          amountCusd: '2.00',
          recipient: validRecipient,
          idempotencyKey: 'pause-then-approve-1',
        }),
      });
      const resCreate = await createPaymentRoute(reqCreate, { params: { id: agentAId } });
      const jsonCreate = await resCreate.json();
      const requestId = jsonCreate.data.pendingApproval.requestId;

      // Pause agent
      await getAgentService().pauseAgent(ownerA, agentAId);

      // Attempt approval
      const reqApprove = new Request(`http://localhost:3000/api/agents/${agentAId}/approvals/${requestId}/approve`, {
        method: 'POST',
        headers: {
          cookie: cookieA,
          origin: expectedOrigin,
        },
      });
      const resApprove = await approveRoute(reqApprove, { params: { id: agentAId, requestId } });
      expect(resApprove.status).toBe(409);
    });

    it('32. Terminated agent cannot approve pending payment (returns 409)', async () => {
      const reqCreate = new Request(`http://localhost:3000/api/agents/${agentAId}/payments`, {
        method: 'POST',
        headers: {
          cookie: cookieA,
          origin: expectedOrigin,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          amountCusd: '2.00',
          recipient: validRecipient,
          idempotencyKey: 'term-then-approve-1',
        }),
      });
      const resCreate = await createPaymentRoute(reqCreate, { params: { id: agentAId } });
      const jsonCreate = await resCreate.json();
      const requestId = jsonCreate.data.pendingApproval.requestId;

      // Terminate agent
      await getAgentService().terminateAgent(ownerA, agentAId);

      // Attempt approval
      const reqApprove = new Request(`http://localhost:3000/api/agents/${agentAId}/approvals/${requestId}/approve`, {
        method: 'POST',
        headers: {
          cookie: cookieA,
          origin: expectedOrigin,
        },
      });
      const resApprove = await approveRoute(reqApprove, { params: { id: agentAId, requestId } });
      expect(resApprove.status).toBe(409);
    });
  });

  // ============================================================================
  // 7. IDEMPOTENCY
  // ============================================================================
  describe('Idempotency Behavior', () => {
    it('33. Duplicate payment request returns existing reservation', async () => {
      const payload = {
        amountCusd: '0.50',
        recipient: validRecipient,
        idempotencyKey: 'dup-key-1',
      };

      const req1 = new Request(`http://localhost:3000/api/agents/${agentAId}/payments`, {
        method: 'POST',
        headers: {
          cookie: cookieA,
          origin: expectedOrigin,
          'content-type': 'application/json',
        },
        body: JSON.stringify(payload),
      });
      const res1 = await createPaymentRoute(req1, { params: { id: agentAId } });
      const json1 = await res1.json();

      const req2 = new Request(`http://localhost:3000/api/agents/${agentAId}/payments`, {
        method: 'POST',
        headers: {
          cookie: cookieA,
          origin: expectedOrigin,
          'content-type': 'application/json',
        },
        body: JSON.stringify(payload),
      });
      const res2 = await createPaymentRoute(req2, { params: { id: agentAId } });
      const json2 = await res2.json();

      expect(res2.status).toBe(200);
      expect(json2.data.reservation.id).toBe(json1.data.reservation.id);
    });

    it('34. Conflicting idempotency request is rejected with 409', async () => {
      const req1 = new Request(`http://localhost:3000/api/agents/${agentAId}/payments`, {
        method: 'POST',
        headers: {
          cookie: cookieA,
          origin: expectedOrigin,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          amountCusd: '0.50',
          recipient: validRecipient,
          idempotencyKey: 'conflict-key-1',
        }),
      });
      await createPaymentRoute(req1, { params: { id: agentAId } });

      // Second request with SAME idempotencyKey but DIFFERENT amount
      const req2 = new Request(`http://localhost:3000/api/agents/${agentAId}/payments`, {
        method: 'POST',
        headers: {
          cookie: cookieA,
          origin: expectedOrigin,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          amountCusd: '0.75',
          recipient: validRecipient,
          idempotencyKey: 'conflict-key-1',
        }),
      });
      const res2 = await createPaymentRoute(req2, { params: { id: agentAId } });
      expect(res2.status).toBe(409);
      const json2 = await res2.json();
      expect(json2.data.outcome).toBe('IDEMPOTENCY_CONFLICT');
    });
  });

  // ============================================================================
  // 8. EXECUTION BOUNDARY & ASSET INVARIANTS
  // ============================================================================
  describe('Execution Boundary Invariants', () => {
    it('35. API never automatically executes a reserved payment', async () => {
      const req = new Request(`http://localhost:3000/api/agents/${agentAId}/payments`, {
        method: 'POST',
        headers: {
          cookie: cookieA,
          origin: expectedOrigin,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          amountCusd: '0.50',
          recipient: validRecipient,
          idempotencyKey: 'exec-invariant-1',
        }),
      });

      const res = await createPaymentRoute(req, { params: { id: agentAId } });
      const json = await res.json();
      expect(json.data.outcome).toBe('RESERVED');
      // The reservation status MUST be RESERVED, never SUBMITTED or COMMITTED
      expect(json.data.reservation.status).toBe('RESERVED');
      expect(json.data.reservation.txHash).toBeUndefined();
    });

    it('36. API never calls native CELO executor or produces on-chain txHash', async () => {
      const req = new Request(`http://localhost:3000/api/agents/${agentAId}/payments`, {
        method: 'POST',
        headers: {
          cookie: cookieA,
          origin: expectedOrigin,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          amountCusd: '0.50',
          recipient: validRecipient,
          idempotencyKey: 'exec-invariant-2',
        }),
      });

      const res = await createPaymentRoute(req, { params: { id: agentAId } });
      const json = await res.json();
      expect(json.data.txHash).toBeUndefined();
    });

    it('37. API never performs cUSD → CELO conversion (amounts strictly cUSD string)', async () => {
      const req = new Request(`http://localhost:3000/api/agents/${agentAId}/payments`, {
        method: 'POST',
        headers: {
          cookie: cookieA,
          origin: expectedOrigin,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          amountCusd: '0.50',
          recipient: validRecipient,
          idempotencyKey: 'exec-invariant-3',
        }),
      });

      const res = await createPaymentRoute(req, { params: { id: agentAId } });
      const json = await res.json();
      expect(json.data.amountCusd).toBe('0.50');
      expect(json.data.reservation.amountCusd).toBe('0.50');
    });
  });

  // ============================================================================
  // 9. SECURITY HEADERS & LEAK PREVENTION
  // ============================================================================
  describe('Security Headers & Data Isolation', () => {
    it('38. Authenticated responses contain cache-control no-store headers', async () => {
      const req = new Request(`http://localhost:3000/api/agents/${agentAId}/approvals`, {
        headers: { cookie: cookieA },
      });
      const res = await listApprovalsRoute(req, { params: { id: agentAId } });
      expect(res.headers.get('cache-control')).toContain('no-store');
      expect(res.headers.get('pragma')).toBe('no-cache');
    });

    it('39. Error responses contain cache-control no-store headers', async () => {
      const req = new Request(`http://localhost:3000/api/agents/${agentAId}/payments`, {
        method: 'POST',
        headers: { origin: expectedOrigin }, // no cookie
        body: JSON.stringify({}),
      });
      const res = await createPaymentRoute(req, { params: { id: agentAId } });
      expect(res.headers.get('cache-control')).toContain('no-store');
    });

    it('40. No private keys, secret tokens, or internal session stores exposed in responses', async () => {
      const req = new Request(`http://localhost:3000/api/agents/${agentAId}/payments`, {
        method: 'POST',
        headers: {
          cookie: cookieA,
          origin: expectedOrigin,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          amountCusd: '0.50',
          recipient: validRecipient,
          idempotencyKey: 'leak-check-1',
        }),
      });

      const res = await createPaymentRoute(req, { params: { id: agentAId } });
      const text = await res.text();
      expect(text).not.toContain('privateKey');
      expect(text).not.toContain('AGENT_PRIVATE_KEY');
      expect(text).not.toContain('sessionSecret');
      expect(text).not.toContain('__celo');
    });
  });
});
