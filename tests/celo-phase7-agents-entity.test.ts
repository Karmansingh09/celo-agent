import { describe, it, expect, beforeEach } from 'vitest';
import { getSessionStore } from '../src/lib/auth';
import { getAgentStore, getAgentService } from '../src/lib/agent';
import { GET as getAgentRoute, PATCH as updateAgentRoute } from '../src/app/api/agents/[id]/route';

describe('Phase 7.5.3: Agent Management Entity Routes (GET & PATCH /api/agents/[id])', () => {
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

    // Seed agent for Owner A
    const agentA = await getAgentService().createAgent(ownerA, {
      name: 'Agent Alpha',
      description: 'Alpha agent description',
      metadata: { env: 'dev' },
      spendingPolicy: validPolicy,
    });
    agentAId = agentA.id;

    // Seed agent for Owner B
    const agentB = await getAgentService().createAgent(ownerB, {
      name: 'Agent Beta',
      description: 'Beta agent description',
      metadata: { env: 'prod' },
      spendingPolicy: validPolicy,
    });
    agentBId = agentB.id;
  });

  describe('1. GET /api/agents/[id]', () => {
    it('returns 401 when request is unauthenticated (missing cookie)', async () => {
      const req = new Request(`http://localhost:3000/api/agents/${agentAId}`);
      const res = await getAgentRoute(req, { params: { id: agentAId } });

      expect(res.status).toBe(401);
      expect(res.headers.get('cache-control')).toContain('no-store');
      const json = await res.json();
      expect(json.success).toBe(false);
      expect(json.error).toContain('Authentication required');
    });

    it('returns 400 when agent ID format is invalid', async () => {
      const invalidId = 'not_a_valid_agent_id';
      const req = new Request(`http://localhost:3000/api/agents/${invalidId}`, {
        headers: { cookie: cookieA },
      });
      const res = await getAgentRoute(req, { params: { id: invalidId } });

      expect(res.status).toBe(400);
      expect(res.headers.get('cache-control')).toContain('no-store');
      const json = await res.json();
      expect(json.success).toBe(false);
      expect(json.error).toContain('Invalid agent ID format');
    });

    it('returns 200 and agent data when authenticated owner requests their own agent', async () => {
      const req = new Request(`http://localhost:3000/api/agents/${agentAId}`, {
        headers: { cookie: cookieA },
      });
      const res = await getAgentRoute(req, { params: { id: agentAId } });

      expect(res.status).toBe(200);
      expect(res.headers.get('cache-control')).toContain('no-store');
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.data.id).toBe(agentAId);
      expect(json.data.ownerAddress).toBe(ownerA);
      expect(json.data.name).toBe('Agent Alpha');
      expect(json.data.status).toBe('ACTIVE');
    });

    it('returns 404 when agent does not exist', async () => {
      const nonExistentId = 'agent_1740000000_99999999';
      const req = new Request(`http://localhost:3000/api/agents/${nonExistentId}`, {
        headers: { cookie: cookieA },
      });
      const res = await getAgentRoute(req, { params: { id: nonExistentId } });

      expect(res.status).toBe(404);
      expect(res.headers.get('cache-control')).toContain('no-store');
      const json = await res.json();
      expect(json.success).toBe(false);
      expect(json.error).toBe(`Agent not found: ${nonExistentId}`);
    });

    it('returns 404 when agent belongs to another owner (anti-enumeration)', async () => {
      // Owner A attempts to access Owner B's agent
      const req = new Request(`http://localhost:3000/api/agents/${agentBId}`, {
        headers: { cookie: cookieA },
      });
      const res = await getAgentRoute(req, { params: { id: agentBId } });

      expect(res.status).toBe(404);
      expect(res.headers.get('cache-control')).toContain('no-store');
      const json = await res.json();
      expect(json.success).toBe(false);
      expect(json.error).toBe(`Agent not found: ${agentBId}`);
    });

    it('verifies non-owned and nonexistent agents return identical error responses', async () => {
      const nonExistentId = 'agent_1740000000_88888888';

      const resNonExistent = await getAgentRoute(
        new Request(`http://localhost:3000/api/agents/${nonExistentId}`, {
          headers: { cookie: cookieA },
        }),
        { params: { id: nonExistentId } }
      );

      const resNonOwned = await getAgentRoute(
        new Request(`http://localhost:3000/api/agents/${agentBId}`, {
          headers: { cookie: cookieA },
        }),
        { params: { id: agentBId } }
      );

      expect(resNonExistent.status).toBe(404);
      expect(resNonOwned.status).toBe(404);

      const jsonNonExistent = await resNonExistent.json();
      const jsonNonOwned = await resNonOwned.json();

      expect(jsonNonExistent).toEqual({ success: false, error: `Agent not found: ${nonExistentId}` });
      expect(jsonNonOwned).toEqual({ success: false, error: `Agent not found: ${agentBId}` });
    });
  });

  describe('2. PATCH /api/agents/[id]', () => {
    it('returns 401 when request is unauthenticated', async () => {
      const req = new Request(`http://localhost:3000/api/agents/${agentAId}`, {
        method: 'PATCH',
        headers: {
          origin: expectedOrigin,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ name: 'New Name' }),
      });
      const res = await updateAgentRoute(req, { params: { id: agentAId } });

      expect(res.status).toBe(401);
      expect(res.headers.get('cache-control')).toContain('no-store');
    });

    it('returns 403 when CSRF Origin is missing on PATCH', async () => {
      const req = new Request(`http://localhost:3000/api/agents/${agentAId}`, {
        method: 'PATCH',
        headers: {
          cookie: cookieA,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ name: 'New Name' }),
      });
      const res = await updateAgentRoute(req, { params: { id: agentAId } });

      expect(res.status).toBe(403);
      expect(res.headers.get('cache-control')).toContain('no-store');
      const json = await res.json();
      expect(json.success).toBe(false);
      expect(json.error).toContain('CSRF');
    });

    it('returns 403 when CSRF Origin is malicious cross-site', async () => {
      const req = new Request(`http://localhost:3000/api/agents/${agentAId}`, {
        method: 'PATCH',
        headers: {
          origin: 'http://malicious-attacker.com',
          cookie: cookieA,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ name: 'New Name' }),
      });
      const res = await updateAgentRoute(req, { params: { id: agentAId } });

      expect(res.status).toBe(403);
    });

    it('returns 400 when body is malformed JSON', async () => {
      const req = new Request(`http://localhost:3000/api/agents/${agentAId}`, {
        method: 'PATCH',
        headers: {
          origin: expectedOrigin,
          cookie: cookieA,
          'content-type': 'application/json',
        },
        body: '{ malformed json',
      });
      const res = await updateAgentRoute(req, { params: { id: agentAId } });

      expect(res.status).toBe(400);
      expect(res.headers.get('cache-control')).toContain('no-store');
      const json = await res.json();
      expect(json.error).toContain('Invalid JSON');
    });

    it('returns 400 when body is not a plain non-null object', async () => {
      const req = new Request(`http://localhost:3000/api/agents/${agentAId}`, {
        method: 'PATCH',
        headers: {
          origin: expectedOrigin,
          cookie: cookieA,
          'content-type': 'application/json',
        },
        body: JSON.stringify(['array', 'not', 'allowed']),
      });
      const res = await updateAgentRoute(req, { params: { id: agentAId } });

      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toContain('Request body must be a valid non-null object');
    });

    it('returns 400 when body is empty object', async () => {
      const req = new Request(`http://localhost:3000/api/agents/${agentAId}`, {
        method: 'PATCH',
        headers: {
          origin: expectedOrigin,
          cookie: cookieA,
          'content-type': 'application/json',
        },
        body: JSON.stringify({}),
      });
      const res = await updateAgentRoute(req, { params: { id: agentAId } });

      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toContain('Update request cannot be empty');
    });

    it('returns 400 when attempting to mutate immutable field: ownerAddress', async () => {
      const req = new Request(`http://localhost:3000/api/agents/${agentAId}`, {
        method: 'PATCH',
        headers: {
          origin: expectedOrigin,
          cookie: cookieA,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ ownerAddress: ownerB }),
      });
      const res = await updateAgentRoute(req, { params: { id: agentAId } });

      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toContain('Cannot modify immutable field: "ownerAddress"');
    });

    it('returns 400 when attempting to mutate immutable field: id', async () => {
      const req = new Request(`http://localhost:3000/api/agents/${agentAId}`, {
        method: 'PATCH',
        headers: {
          origin: expectedOrigin,
          cookie: cookieA,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ id: 'agent_new_id_attempt' }),
      });
      const res = await updateAgentRoute(req, { params: { id: agentAId } });

      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toContain('Cannot modify immutable field: "id"');
    });

    it('returns 400 when attempting to mutate immutable field: createdAt', async () => {
      const req = new Request(`http://localhost:3000/api/agents/${agentAId}`, {
        method: 'PATCH',
        headers: {
          origin: expectedOrigin,
          cookie: cookieA,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ createdAt: 1000 }),
      });
      const res = await updateAgentRoute(req, { params: { id: agentAId } });

      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toContain('Cannot modify immutable field: "createdAt"');
    });

    it('returns 400 when attempting to mutate lifecycle status via PATCH', async () => {
      const req = new Request(`http://localhost:3000/api/agents/${agentAId}`, {
        method: 'PATCH',
        headers: {
          origin: expectedOrigin,
          cookie: cookieA,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ status: 'PAUSED' }),
      });
      const res = await updateAgentRoute(req, { params: { id: agentAId } });

      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toContain('Cannot modify immutable field: "status"');
    });

    it('returns 400 when body contains unknown fields', async () => {
      const req = new Request(`http://localhost:3000/api/agents/${agentAId}`, {
        method: 'PATCH',
        headers: {
          origin: expectedOrigin,
          cookie: cookieA,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ name: 'Valid Name', unknownField: true }),
      });
      const res = await updateAgentRoute(req, { params: { id: agentAId } });

      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toContain('Unexpected or forbidden field: "unknownField"');
    });

    it('returns 404 when attempting to update a nonexistent agent', async () => {
      const nonExistentId = 'agent_1740000000_77777777';
      const req = new Request(`http://localhost:3000/api/agents/${nonExistentId}`, {
        method: 'PATCH',
        headers: {
          origin: expectedOrigin,
          cookie: cookieA,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ name: 'New Name' }),
      });
      const res = await updateAgentRoute(req, { params: { id: nonExistentId } });

      expect(res.status).toBe(404);
      const json = await res.json();
      expect(json.error).toBe(`Agent not found: ${nonExistentId}`);
    });

    it('returns 404 when attempting to update another owner agent (anti-enumeration)', async () => {
      // Owner A attempts to update Owner B's agent
      const req = new Request(`http://localhost:3000/api/agents/${agentBId}`, {
        method: 'PATCH',
        headers: {
          origin: expectedOrigin,
          cookie: cookieA,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ name: 'Hacked Name' }),
      });
      const res = await updateAgentRoute(req, { params: { id: agentBId } });

      expect(res.status).toBe(404);
      const json = await res.json();
      expect(json.error).toBe(`Agent not found: ${agentBId}`);
    });

    it('returns 400 when update values violate validation constraints (e.g. name > 100 chars)', async () => {
      const req = new Request(`http://localhost:3000/api/agents/${agentAId}`, {
        method: 'PATCH',
        headers: {
          origin: expectedOrigin,
          cookie: cookieA,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ name: 'X'.repeat(101) }),
      });
      const res = await updateAgentRoute(req, { params: { id: agentAId } });

      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toContain('cannot exceed 100 characters');
    });

    it('updates allowed mutable fields successfully and change persists in subsequent GET', async () => {
      const updatedPolicy = {
        maxPerTransaction: '15.0',
        maxPerDay: '60.0',
        autoApproveThreshold: '3.0',
        validUntil: Date.now() + 172_800_000,
        allowedRecipients: ['0x4444444444444444444444444444444444444444'],
      };

      const req = new Request(`http://localhost:3000/api/agents/${agentAId}`, {
        method: 'PATCH',
        headers: {
          origin: expectedOrigin,
          cookie: cookieA,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          name: 'Renamed Alpha Agent',
          description: 'Updated alpha description',
          metadata: { env: 'staging', version: '2' },
          spendingPolicy: updatedPolicy,
        }),
      });

      const res = await updateAgentRoute(req, { params: { id: agentAId } });
      expect(res.status).toBe(200);
      expect(res.headers.get('cache-control')).toContain('no-store');

      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.data.name).toBe('Renamed Alpha Agent');
      expect(json.data.description).toBe('Updated alpha description');
      expect(json.data.metadata).toEqual({ env: 'staging', version: '2' });
      expect(json.data.spendingPolicy.maxPerTransaction).toBe('15.0');
      expect(json.data.spendingPolicy.allowedRecipients).toEqual([
        '0x4444444444444444444444444444444444444444',
      ]);
      expect(json.data.ownerAddress).toBe(ownerA); // Ownership preserved!

      // Verify persistence via GET
      const getReq = new Request(`http://localhost:3000/api/agents/${agentAId}`, {
        headers: { cookie: cookieA },
      });
      const getRes = await getAgentRoute(getReq, { params: { id: agentAId } });
      expect(getRes.status).toBe(200);
      const getJson = await getRes.json();
      expect(getJson.data.name).toBe('Renamed Alpha Agent');
      expect(getJson.data.description).toBe('Updated alpha description');
    });
  });
});
