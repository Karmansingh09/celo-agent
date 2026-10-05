import { describe, it, expect, beforeEach } from 'vitest';
import { getSessionStore } from '../src/lib/auth';
import { getAgentStore } from '../src/lib/agent';
import { POST as createAgentRoute, GET as listAgentsRoute } from '../src/app/api/agents/route';

describe('Phase 7.5.2: Agent Management Collection Routes (POST & GET /api/agents)', () => {
  const ownerA = '0x1111111111111111111111111111111111111111';
  const ownerB = '0x2222222222222222222222222222222222222222';
  const expectedOrigin = 'http://localhost:3000';

  let tokenA: string;
  let cookieA: string;
  let tokenB: string;
  let cookieB: string;

  const validPolicy = {
    maxPerTransaction: '5.0',
    maxPerDay: '20.0',
    autoApproveThreshold: '1.0',
    validUntil: Date.now() + 86_400_000,
    allowedRecipients: ['0x3333333333333333333333333333333333333333'],
  };

  beforeEach(async () => {
    // Clear in-memory stores
    getSessionStore().clear();
    getAgentStore().clear();

    // Create authenticated sessions for Owner A and Owner B
    const sessionA = await getSessionStore().createSession(ownerA);
    tokenA = sessionA.rawSessionToken;
    cookieA = `celo_agent_session=${tokenA}`;

    const sessionB = await getSessionStore().createSession(ownerB);
    tokenB = sessionB.rawSessionToken;
    cookieB = `celo_agent_session=${tokenB}`;
  });

  describe('1. POST /api/agents (Agent Creation)', () => {
    it('returns 401 when request is unauthenticated (missing cookie)', async () => {
      const req = new Request('http://localhost:3000/api/agents', {
        method: 'POST',
        headers: {
          origin: expectedOrigin,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          name: 'Unauth Agent',
          spendingPolicy: validPolicy,
        }),
      });

      const res = await createAgentRoute(req);
      expect(res.status).toBe(401);
      expect(res.headers.get('cache-control')).toContain('no-store');

      const json = await res.json();
      expect(json.success).toBe(false);
      expect(json.error).toContain('Authentication required');
    });

    it('returns 401 when session token is invalid or expired', async () => {
      const req = new Request('http://localhost:3000/api/agents', {
        method: 'POST',
        headers: {
          origin: expectedOrigin,
          cookie: 'celo_agent_session=invalid_fake_token',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          name: 'Invalid Session Agent',
          spendingPolicy: validPolicy,
        }),
      });

      const res = await createAgentRoute(req);
      expect(res.status).toBe(401);
      expect(res.headers.get('cache-control')).toContain('no-store');
    });

    it('returns 403 when CSRF Origin and Referer are both missing on POST', async () => {
      const req = new Request('http://localhost:3000/api/agents', {
        method: 'POST',
        headers: {
          cookie: cookieA,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          name: 'CSRF Agent',
          spendingPolicy: validPolicy,
        }),
      });

      const res = await createAgentRoute(req);
      expect(res.status).toBe(403);
      expect(res.headers.get('cache-control')).toContain('no-store');

      const json = await res.json();
      expect(json.success).toBe(false);
      expect(json.error).toContain('CSRF');
    });

    it('returns 403 when Origin header does not match expected origin', async () => {
      const req = new Request('http://localhost:3000/api/agents', {
        method: 'POST',
        headers: {
          origin: 'http://malicious-website.com',
          cookie: cookieA,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          name: 'Malicious Origin Agent',
          spendingPolicy: validPolicy,
        }),
      });

      const res = await createAgentRoute(req);
      expect(res.status).toBe(403);
      expect(res.headers.get('cache-control')).toContain('no-store');
    });

    it('returns 400 when request body is malformed JSON', async () => {
      const req = new Request('http://localhost:3000/api/agents', {
        method: 'POST',
        headers: {
          origin: expectedOrigin,
          cookie: cookieA,
          'content-type': 'application/json',
        },
        body: '{ malformed json ',
      });

      const res = await createAgentRoute(req);
      expect(res.status).toBe(400);
      expect(res.headers.get('cache-control')).toContain('no-store');

      const json = await res.json();
      expect(json.success).toBe(false);
      expect(json.error).toContain('Invalid JSON');
    });

    it('returns 400 when request body is not a plain object (e.g. array or primitive)', async () => {
      const req = new Request('http://localhost:3000/api/agents', {
        method: 'POST',
        headers: {
          origin: expectedOrigin,
          cookie: cookieA,
          'content-type': 'application/json',
        },
        body: JSON.stringify(['not', 'an', 'object']),
      });

      const res = await createAgentRoute(req);
      expect(res.status).toBe(400);
      expect(res.headers.get('cache-control')).toContain('no-store');

      const json = await res.json();
      expect(json.success).toBe(false);
      expect(json.error).toContain('Request body must be a valid non-null object');
    });

    it('returns 400 when body contains unknown or forbidden fields (e.g. ownerAddress)', async () => {
      // Caller attempts to pass ownerAddress in body
      const req = new Request('http://localhost:3000/api/agents', {
        method: 'POST',
        headers: {
          origin: expectedOrigin,
          cookie: cookieA,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          name: 'Tamper Agent',
          ownerAddress: ownerB, // Forbidden in body!
          spendingPolicy: validPolicy,
        }),
      });

      const res = await createAgentRoute(req);
      expect(res.status).toBe(400);
      expect(res.headers.get('cache-control')).toContain('no-store');

      const json = await res.json();
      expect(json.success).toBe(false);
      expect(json.error).toContain('Unexpected or forbidden field');
    });

    it('returns 400 when body contains extraneous unknown fields', async () => {
      const req = new Request('http://localhost:3000/api/agents', {
        method: 'POST',
        headers: {
          origin: expectedOrigin,
          cookie: cookieA,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          name: 'Extra Field Agent',
          unknownCustomField: 12345,
          spendingPolicy: validPolicy,
        }),
      });

      const res = await createAgentRoute(req);
      expect(res.status).toBe(400);
      expect(res.headers.get('cache-control')).toContain('no-store');

      const json = await res.json();
      expect(json.success).toBe(false);
      expect(json.error).toContain('Unexpected or forbidden field');
    });

    it('returns 400 when required fields are missing or invalid', async () => {
      // Missing name
      const reqNoName = new Request('http://localhost:3000/api/agents', {
        method: 'POST',
        headers: { origin: expectedOrigin, cookie: cookieA, 'content-type': 'application/json' },
        body: JSON.stringify({ spendingPolicy: validPolicy }),
      });
      const resNoName = await createAgentRoute(reqNoName);
      expect(resNoName.status).toBe(400);

      // Name exceeds 100 characters
      const reqLongName = new Request('http://localhost:3000/api/agents', {
        method: 'POST',
        headers: { origin: expectedOrigin, cookie: cookieA, 'content-type': 'application/json' },
        body: JSON.stringify({ name: 'A'.repeat(101), spendingPolicy: validPolicy }),
      });
      const resLongName = await createAgentRoute(reqLongName);
      expect(resLongName.status).toBe(400);

      // Invalid policy structure
      const reqBadPolicy = new Request('http://localhost:3000/api/agents', {
        method: 'POST',
        headers: { origin: expectedOrigin, cookie: cookieA, 'content-type': 'application/json' },
        body: JSON.stringify({ name: 'Bad Policy Agent', spendingPolicy: { invalid: true } }),
      });
      const resBadPolicy = await createAgentRoute(reqBadPolicy);
      expect(resBadPolicy.status).toBe(400);
    });

    it('creates an agent successfully with generated ID and returns 201 Created', async () => {
      const req = new Request('http://localhost:3000/api/agents', {
        method: 'POST',
        headers: {
          origin: expectedOrigin,
          cookie: cookieA,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          name: 'Treasury Disburser',
          description: 'Autonomous payment agent',
          metadata: { env: 'test', tier: 'standard' },
          spendingPolicy: validPolicy,
        }),
      });

      const res = await createAgentRoute(req);
      expect(res.status).toBe(201);
      expect(res.headers.get('cache-control')).toContain('no-store');

      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.data).toBeDefined();

      const agent = json.data;
      expect(agent.id).toMatch(/^agent_[a-zA-Z0-9_-]{8,64}$/);
      expect(agent.ownerAddress).toBe(ownerA);
      expect(agent.name).toBe('Treasury Disburser');
      expect(agent.description).toBe('Autonomous payment agent');
      expect(agent.status).toBe('ACTIVE');
      expect(agent.metadata).toEqual({ env: 'test', tier: 'standard' });
      expect(agent.spendingPolicy.agentId).toBe(agent.id);
      expect(agent.spendingPolicy.maxPerTransaction).toBe('5.0');
      expect(agent.spendingPolicy.maxPerDay).toBe('20.0');
      expect(agent.spendingPolicy.autoApproveThreshold).toBe('1.0');
      expect(agent.spendingPolicy.allowedRecipients).toEqual([
        '0x3333333333333333333333333333333333333333',
      ]);
    });

    it('creates an agent with a custom valid ID and returns 201 Created', async () => {
      const customId = 'agent_custom_valid_id_12345678';
      const req = new Request('http://localhost:3000/api/agents', {
        method: 'POST',
        headers: {
          origin: expectedOrigin,
          cookie: cookieA,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          id: customId,
          name: 'Custom ID Agent',
          spendingPolicy: validPolicy,
        }),
      });

      const res = await createAgentRoute(req);
      expect(res.status).toBe(201);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.data.id).toBe(customId);
      expect(json.data.ownerAddress).toBe(ownerA);
    });

    it('returns 409 Conflict when attempting to create an agent with duplicate ID', async () => {
      const customId = 'agent_duplicate_test_12345678';

      // First creation succeeds
      const req1 = new Request('http://localhost:3000/api/agents', {
        method: 'POST',
        headers: { origin: expectedOrigin, cookie: cookieA, 'content-type': 'application/json' },
        body: JSON.stringify({ id: customId, name: 'First Agent', spendingPolicy: validPolicy }),
      });
      const res1 = await createAgentRoute(req1);
      expect(res1.status).toBe(201);

      // Second creation with identical ID must fail with 409
      const req2 = new Request('http://localhost:3000/api/agents', {
        method: 'POST',
        headers: { origin: expectedOrigin, cookie: cookieA, 'content-type': 'application/json' },
        body: JSON.stringify({ id: customId, name: 'Second Agent', spendingPolicy: validPolicy }),
      });
      const res2 = await createAgentRoute(req2);
      expect(res2.status).toBe(409);
      expect(res2.headers.get('cache-control')).toContain('no-store');

      const json2 = await res2.json();
      expect(json2.success).toBe(false);
      expect(json2.error).toContain('already exists');
    });
  });

  describe('2. GET /api/agents (Agent Listing & Owner Scoping)', () => {
    it('returns 401 when request is unauthenticated', async () => {
      const req = new Request('http://localhost:3000/api/agents');
      const res = await listAgentsRoute(req);
      expect(res.status).toBe(401);
      expect(res.headers.get('cache-control')).toContain('no-store');

      const json = await res.json();
      expect(json.success).toBe(false);
    });

    it('returns empty list when authenticated owner has no agents', async () => {
      const req = new Request('http://localhost:3000/api/agents', {
        headers: { cookie: cookieA },
      });
      const res = await listAgentsRoute(req);
      expect(res.status).toBe(200);
      expect(res.headers.get('cache-control')).toContain('no-store');

      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.data).toEqual([]);
      expect(json.count).toBe(0);
    });

    it('returns only agents belonging to the authenticated owner (strict owner isolation)', async () => {
      // Create 2 agents for Owner A
      await createAgentRoute(
        new Request('http://localhost:3000/api/agents', {
          method: 'POST',
          headers: { origin: expectedOrigin, cookie: cookieA, 'content-type': 'application/json' },
          body: JSON.stringify({ name: 'Agent A1', spendingPolicy: validPolicy }),
        })
      );
      await createAgentRoute(
        new Request('http://localhost:3000/api/agents', {
          method: 'POST',
          headers: { origin: expectedOrigin, cookie: cookieA, 'content-type': 'application/json' },
          body: JSON.stringify({ name: 'Agent A2', spendingPolicy: validPolicy }),
        })
      );

      // Create 1 agent for Owner B
      await createAgentRoute(
        new Request('http://localhost:3000/api/agents', {
          method: 'POST',
          headers: { origin: expectedOrigin, cookie: cookieB, 'content-type': 'application/json' },
          body: JSON.stringify({ name: 'Agent B1', spendingPolicy: validPolicy }),
        })
      );

      // Query as Owner A
      const reqA = new Request('http://localhost:3000/api/agents', {
        headers: { cookie: cookieA },
      });
      const resA = await listAgentsRoute(reqA);
      expect(resA.status).toBe(200);
      const jsonA = await resA.json();
      expect(jsonA.success).toBe(true);
      expect(jsonA.count).toBe(2);
      expect(jsonA.data.every((a: any) => a.ownerAddress === ownerA)).toBe(true);

      // Query as Owner B
      const reqB = new Request('http://localhost:3000/api/agents', {
        headers: { cookie: cookieB },
      });
      const resB = await listAgentsRoute(reqB);
      expect(resB.status).toBe(200);
      const jsonB = await resB.json();
      expect(jsonB.success).toBe(true);
      expect(jsonB.count).toBe(1);
      expect(jsonB.data[0].name).toBe('Agent B1');
      expect(jsonB.data[0].ownerAddress).toBe(ownerB);
    });

    it('prevents caller from overriding owner scope with query parameter', async () => {
      // Owner A created agents; Owner B attempts to pass ?ownerAddress=ownerA
      await createAgentRoute(
        new Request('http://localhost:3000/api/agents', {
          method: 'POST',
          headers: { origin: expectedOrigin, cookie: cookieA, 'content-type': 'application/json' },
          body: JSON.stringify({ name: 'Agent A1', spendingPolicy: validPolicy }),
        })
      );

      const req = new Request(`http://localhost:3000/api/agents?ownerAddress=${ownerA}`, {
        headers: { cookie: cookieB },
      });
      const res = await listAgentsRoute(req);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      // Owner B still sees 0 agents because scope is strictly enforced by session!
      expect(json.data).toEqual([]);
      expect(json.count).toBe(0);
    });

    it('supports status filtering, pagination, and rejects invalid parameters', async () => {
      // Create 3 agents for Owner A
      await createAgentRoute(
        new Request('http://localhost:3000/api/agents', {
          method: 'POST',
          headers: { origin: expectedOrigin, cookie: cookieA, 'content-type': 'application/json' },
          body: JSON.stringify({ name: 'Agent 1', spendingPolicy: validPolicy }),
        })
      );
      await createAgentRoute(
        new Request('http://localhost:3000/api/agents', {
          method: 'POST',
          headers: { origin: expectedOrigin, cookie: cookieA, 'content-type': 'application/json' },
          body: JSON.stringify({ name: 'Agent 2', spendingPolicy: validPolicy }),
        })
      );
      await createAgentRoute(
        new Request('http://localhost:3000/api/agents', {
          method: 'POST',
          headers: { origin: expectedOrigin, cookie: cookieA, 'content-type': 'application/json' },
          body: JSON.stringify({ name: 'Agent 3', spendingPolicy: validPolicy }),
        })
      );

      // Pagination: limit=2, offset=1
      const reqPage = new Request('http://localhost:3000/api/agents?limit=2&offset=1', {
        headers: { cookie: cookieA },
      });
      const resPage = await listAgentsRoute(reqPage);
      expect(resPage.status).toBe(200);
      const jsonPage = await resPage.json();
      expect(jsonPage.count).toBe(2);

      // Status filtering: ACTIVE
      const reqStatus = new Request('http://localhost:3000/api/agents?status=ACTIVE', {
        headers: { cookie: cookieA },
      });
      const resStatus = await listAgentsRoute(reqStatus);
      expect(resStatus.status).toBe(200);
      const jsonStatus = await resStatus.json();
      expect(jsonStatus.count).toBe(3);

      // Invalid status filter -> 400
      const reqBadStatus = new Request('http://localhost:3000/api/agents?status=INVALID_STATUS', {
        headers: { cookie: cookieA },
      });
      const resBadStatus = await listAgentsRoute(reqBadStatus);
      expect(resBadStatus.status).toBe(400);

      // Invalid limit -> 400
      const reqBadLimit = new Request('http://localhost:3000/api/agents?limit=invalid', {
        headers: { cookie: cookieA },
      });
      const resBadLimit = await listAgentsRoute(reqBadLimit);
      expect(resBadLimit.status).toBe(400);

      // Negative offset -> 400
      const reqBadOffset = new Request('http://localhost:3000/api/agents?offset=-5', {
        headers: { cookie: cookieA },
      });
      const resBadOffset = await listAgentsRoute(reqBadOffset);
      expect(resBadOffset.status).toBe(400);
    });
  });
});
