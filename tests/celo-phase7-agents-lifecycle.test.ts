import { describe, it, expect, beforeEach } from 'vitest';
import { getSessionStore } from '../src/lib/auth';
import { getAgentStore, getAgentService } from '../src/lib/agent';
import { POST as pauseRoute } from '../src/app/api/agents/[id]/pause/route';
import { POST as resumeRoute } from '../src/app/api/agents/[id]/resume/route';
import { POST as terminateRoute } from '../src/app/api/agents/[id]/terminate/route';

describe('Phase 7.5.4: Agent Management Lifecycle Routes (pause, resume, terminate)', () => {
  const ownerA = '0x1111111111111111111111111111111111111111';
  const ownerB = '0x2222222222222222222222222222222222222222';
  const expectedOrigin = 'http://localhost:3000';

  let cookieA: string;
  let cookieB: string;
  let agentAId: string;
  let agentBId: string;

  const validPolicy = {
    maxPerTransaction: '5.0',
    maxPerDay: '20.0',
    autoApproveThreshold: '1.0',
    validUntil: Date.now() + 86_400_000,
    allowedRecipients: ['0x3333333333333333333333333333333333333333'],
  };

  beforeEach(async () => {
    getSessionStore().clear();
    getAgentStore().clear();

    // Authenticated sessions
    const sessionA = await getSessionStore().createSession(ownerA);
    cookieA = `celo_agent_session=${sessionA.rawSessionToken}`;

    const sessionB = await getSessionStore().createSession(ownerB);
    cookieB = `celo_agent_session=${sessionB.rawSessionToken}`;

    // Seed agent for Owner A (ACTIVE)
    const agentA = await getAgentService().createAgent(ownerA, {
      name: 'Agent Alpha',
      spendingPolicy: validPolicy,
    });
    agentAId = agentA.id;

    // Seed agent for Owner B (ACTIVE)
    const agentB = await getAgentService().createAgent(ownerB, {
      name: 'Agent Beta',
      spendingPolicy: validPolicy,
    });
    agentBId = agentB.id;
  });

  describe('1. Authentication & CSRF Protection', () => {
    const lifecycleHandlers = [
      { name: 'pause', handler: pauseRoute },
      { name: 'resume', handler: resumeRoute },
      { name: 'terminate', handler: terminateRoute },
    ];

    lifecycleHandlers.forEach(({ name, handler }) => {
      it(`${name}: returns 401 when request is unauthenticated`, async () => {
        const req = new Request(`http://localhost:3000/api/agents/${agentAId}/${name}`, {
          method: 'POST',
          headers: { origin: expectedOrigin },
        });
        const res = await handler(req, { params: { id: agentAId } });
        expect(res.status).toBe(401);
        expect(res.headers.get('cache-control')).toContain('no-store');
      });

      it(`${name}: returns 403 when CSRF Origin is missing`, async () => {
        const req = new Request(`http://localhost:3000/api/agents/${agentAId}/${name}`, {
          method: 'POST',
          headers: { cookie: cookieA },
        });
        const res = await handler(req, { params: { id: agentAId } });
        expect(res.status).toBe(403);
        expect(res.headers.get('cache-control')).toContain('no-store');
      });

      it(`${name}: returns 403 when CSRF Origin is untrusted cross-origin`, async () => {
        const req = new Request(`http://localhost:3000/api/agents/${agentAId}/${name}`, {
          method: 'POST',
          headers: {
            origin: 'http://malicious-website.com',
            cookie: cookieA,
          },
        });
        const res = await handler(req, { params: { id: agentAId } });
        expect(res.status).toBe(403);
      });

      it(`${name}: returns 400 when agent ID format is invalid`, async () => {
        const req = new Request(`http://localhost:3000/api/agents/bad_id/${name}`, {
          method: 'POST',
          headers: { origin: expectedOrigin, cookie: cookieA },
        });
        const res = await handler(req, { params: { id: 'bad_id' } });
        expect(res.status).toBe(400);
      });

      it(`${name}: returns 404 when agent is nonexistent`, async () => {
        const nonExistentId = 'agent_1740000000_99999999';
        const req = new Request(`http://localhost:3000/api/agents/${nonExistentId}/${name}`, {
          method: 'POST',
          headers: { origin: expectedOrigin, cookie: cookieA },
        });
        const res = await handler(req, { params: { id: nonExistentId } });
        expect(res.status).toBe(404);
        const json = await res.json();
        expect(json.error).toBe(`Agent not found: ${nonExistentId}`);
      });

      it(`${name}: returns 404 when agent belongs to another owner (anti-enumeration)`, async () => {
        // Owner A attempts to modify Owner B's agent
        const req = new Request(`http://localhost:3000/api/agents/${agentBId}/${name}`, {
          method: 'POST',
          headers: { origin: expectedOrigin, cookie: cookieA },
        });
        const res = await handler(req, { params: { id: agentBId } });
        expect(res.status).toBe(404);
        const json = await res.json();
        expect(json.error).toBe(`Agent not found: ${agentBId}`);
      });
    });
  });

  describe('2. POST /api/agents/[id]/pause', () => {
    it('successfully pauses an active agent with optional reason (200 OK)', async () => {
      const req = new Request(`http://localhost:3000/api/agents/${agentAId}/pause`, {
        method: 'POST',
        headers: {
          origin: expectedOrigin,
          cookie: cookieA,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ reason: 'Routine maintenance window' }),
      });

      const res = await pauseRoute(req, { params: { id: agentAId } });
      expect(res.status).toBe(200);
      expect(res.headers.get('cache-control')).toContain('no-store');

      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.data.id).toBe(agentAId);
      expect(json.data.status).toBe('PAUSED');
      expect(json.data.statusReason).toBe('Routine maintenance window');
      expect(json.data.ownerAddress).toBe(ownerA); // Unchanged
    });

    it('successfully pauses an active agent with empty body (200 OK)', async () => {
      const req = new Request(`http://localhost:3000/api/agents/${agentAId}/pause`, {
        method: 'POST',
        headers: {
          origin: expectedOrigin,
          cookie: cookieA,
        },
      });

      const res = await pauseRoute(req, { params: { id: agentAId } });
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.data.status).toBe('PAUSED');
    });

    it('returns 409 Conflict when attempting to pause an already PAUSED agent', async () => {
      // First pause succeeds
      const req1 = new Request(`http://localhost:3000/api/agents/${agentAId}/pause`, {
        method: 'POST',
        headers: { origin: expectedOrigin, cookie: cookieA },
      });
      const res1 = await pauseRoute(req1, { params: { id: agentAId } });
      expect(res1.status).toBe(200);

      // Second pause fails with 409
      const req2 = new Request(`http://localhost:3000/api/agents/${agentAId}/pause`, {
        method: 'POST',
        headers: { origin: expectedOrigin, cookie: cookieA },
      });
      const res2 = await pauseRoute(req2, { params: { id: agentAId } });
      expect(res2.status).toBe(409);
      expect(res2.headers.get('cache-control')).toContain('no-store');
      const json2 = await res2.json();
      expect(json2.success).toBe(false);
      expect(json2.error).toContain('already in status PAUSED');
    });

    it('rejects unexpected body fields with 400 Bad Request', async () => {
      const req = new Request(`http://localhost:3000/api/agents/${agentAId}/pause`, {
        method: 'POST',
        headers: {
          origin: expectedOrigin,
          cookie: cookieA,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ status: 'TERMINATED', reason: 'Attempt bypass' }),
      });

      const res = await pauseRoute(req, { params: { id: agentAId } });
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toContain('Unexpected or forbidden field: "status"');
    });

    it('rejects oversized reason (> 500 chars) with 400 Bad Request', async () => {
      const req = new Request(`http://localhost:3000/api/agents/${agentAId}/pause`, {
        method: 'POST',
        headers: {
          origin: expectedOrigin,
          cookie: cookieA,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ reason: 'R'.repeat(501) }),
      });

      const res = await pauseRoute(req, { params: { id: agentAId } });
      expect(res.status).toBe(400);
    });
  });

  describe('3. POST /api/agents/[id]/resume', () => {
    it('successfully resumes a paused agent (200 OK)', async () => {
      // First pause the agent
      await getAgentService().pauseAgent(ownerA, agentAId, 'Initial pause');

      const req = new Request(`http://localhost:3000/api/agents/${agentAId}/resume`, {
        method: 'POST',
        headers: {
          origin: expectedOrigin,
          cookie: cookieA,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ reason: 'Resuming operations' }),
      });

      const res = await resumeRoute(req, { params: { id: agentAId } });
      expect(res.status).toBe(200);
      expect(res.headers.get('cache-control')).toContain('no-store');

      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.data.status).toBe('ACTIVE');
      expect(json.data.statusReason).toBe('Resuming operations');
    });

    it('returns 409 Conflict when attempting to resume an already ACTIVE agent', async () => {
      // Agent A is ACTIVE
      const req = new Request(`http://localhost:3000/api/agents/${agentAId}/resume`, {
        method: 'POST',
        headers: { origin: expectedOrigin, cookie: cookieA },
      });

      const res = await resumeRoute(req, { params: { id: agentAId } });
      expect(res.status).toBe(409);
      const json = await res.json();
      expect(json.error).toContain('already in status ACTIVE');
    });
  });

  describe('4. POST /api/agents/[id]/terminate', () => {
    it('successfully terminates an active agent (200 OK)', async () => {
      const req = new Request(`http://localhost:3000/api/agents/${agentAId}/terminate`, {
        method: 'POST',
        headers: {
          origin: expectedOrigin,
          cookie: cookieA,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ reason: 'Retiring agent permanently' }),
      });

      const res = await terminateRoute(req, { params: { id: agentAId } });
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.data.status).toBe('TERMINATED');
      expect(json.data.statusReason).toBe('Retiring agent permanently');
    });

    it('successfully terminates a paused agent (200 OK)', async () => {
      await getAgentService().pauseAgent(ownerA, agentAId, 'Pause before terminate');

      const req = new Request(`http://localhost:3000/api/agents/${agentAId}/terminate`, {
        method: 'POST',
        headers: { origin: expectedOrigin, cookie: cookieA },
      });

      const res = await terminateRoute(req, { params: { id: agentAId } });
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.data.status).toBe('TERMINATED');
    });

    it('returns 409 Conflict when attempting to terminate an already TERMINATED agent', async () => {
      // First terminate
      await getAgentService().terminateAgent(ownerA, agentAId);

      const req = new Request(`http://localhost:3000/api/agents/${agentAId}/terminate`, {
        method: 'POST',
        headers: { origin: expectedOrigin, cookie: cookieA },
      });

      const res = await terminateRoute(req, { params: { id: agentAId } });
      expect(res.status).toBe(409);
      const json = await res.json();
      expect(json.error).toContain('TERMINATED');
    });
  });

  describe('5. Terminal State Invariant Enforcement', () => {
    it('guarantees that once terminated, an agent can never be paused or resumed', async () => {
      // Terminate Agent A
      await getAgentService().terminateAgent(ownerA, agentAId, 'End of life');

      // Attempt to pause terminated agent -> 409
      const pauseReq = new Request(`http://localhost:3000/api/agents/${agentAId}/pause`, {
        method: 'POST',
        headers: { origin: expectedOrigin, cookie: cookieA },
      });
      const pauseRes = await pauseRoute(pauseReq, { params: { id: agentAId } });
      expect(pauseRes.status).toBe(409);
      const pauseJson = await pauseRes.json();
      expect(pauseJson.error).toContain('TERMINATED');

      // Attempt to resume terminated agent -> 409
      const resumeReq = new Request(`http://localhost:3000/api/agents/${agentAId}/resume`, {
        method: 'POST',
        headers: { origin: expectedOrigin, cookie: cookieA },
      });
      const resumeRes = await resumeRoute(resumeReq, { params: { id: agentAId } });
      expect(resumeRes.status).toBe(409);
      const resumeJson = await resumeRes.json();
      expect(resumeJson.error).toContain('TERMINATED');
    });
  });
});
