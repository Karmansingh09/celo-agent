import { NextResponse } from 'next/server';
import {
  getAuthService,
  AuthenticationError,
  CsrfError,
  AUTH_CACHE_HEADERS,
} from '@/lib/auth';
import {
  getAgentService,
  AgentAlreadyExistsError,
  InvalidAgentInputError,
  AgentStatus,
  CreateAgentServiceInput,
} from '@/lib/agent';

const ALLOWED_CREATE_KEYS = new Set([
  'id',
  'name',
  'description',
  'spendingPolicy',
  'walletAddress',
  'metadata',
]);

const VALID_STATUSES: Set<AgentStatus> = new Set(['ACTIVE', 'PAUSED', 'TERMINATED']);

export async function POST(req: Request) {
  const authService = getAuthService();
  const agentService = getAgentService();

  try {
    // 1. Authenticate using verified SIWE session
    const authenticatedOwner = await authService.getAuthenticatedOwnerAddress(req);

    // 2. Enforce CSRF Origin validation on state-changing request
    authService.assertValidOrigin(req);

    // 3. Parse JSON body
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        { success: false, error: 'Invalid JSON request payload' },
        { status: 400, headers: AUTH_CACHE_HEADERS }
      );
    }

    // 4. Validate body is a plain, non-null, non-array object
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return NextResponse.json(
        { success: false, error: 'Request body must be a valid non-null object' },
        { status: 400, headers: AUTH_CACHE_HEADERS }
      );
    }

    const rawBody = body as Record<string, unknown>;

    // 5. Reject unknown or forbidden fields (including client-supplied ownerAddress)
    for (const key of Object.keys(rawBody)) {
      if (!ALLOWED_CREATE_KEYS.has(key)) {
        return NextResponse.json(
          { success: false, error: `Unexpected or forbidden field: "${key}"` },
          { status: 400, headers: AUTH_CACHE_HEADERS }
        );
      }
    }

    // 6. Application-level input sanity checks
    if (typeof rawBody.name === 'string' && rawBody.name.length > 100) {
      return NextResponse.json(
        { success: false, error: 'Agent name cannot exceed 100 characters' },
        { status: 400, headers: AUTH_CACHE_HEADERS }
      );
    }

    if (typeof rawBody.description === 'string' && rawBody.description.length > 1000) {
      return NextResponse.json(
        { success: false, error: 'Agent description cannot exceed 1000 characters' },
        { status: 400, headers: AUTH_CACHE_HEADERS }
      );
    }

    if (typeof rawBody.id === 'string' && rawBody.id.length > 70) {
      return NextResponse.json(
        { success: false, error: 'Agent ID format is invalid or exceeds maximum length' },
        { status: 400, headers: AUTH_CACHE_HEADERS }
      );
    }

    // 7. Delegate creation to AgentService with explicit authenticatedOwner
    const agent = await agentService.createAgent(
      authenticatedOwner,
      rawBody as unknown as CreateAgentServiceInput
    );

    return NextResponse.json(
      { success: true, data: agent },
      { status: 201, headers: AUTH_CACHE_HEADERS }
    );
  } catch (err: unknown) {
    if (err instanceof AuthenticationError) {
      return NextResponse.json(
        { success: false, error: err.message },
        { status: 401, headers: AUTH_CACHE_HEADERS }
      );
    }

    if (err instanceof CsrfError) {
      return NextResponse.json(
        { success: false, error: err.message },
        { status: 403, headers: AUTH_CACHE_HEADERS }
      );
    }

    if (err instanceof InvalidAgentInputError) {
      return NextResponse.json(
        { success: false, error: err.message },
        { status: 400, headers: AUTH_CACHE_HEADERS }
      );
    }

    if (err instanceof AgentAlreadyExistsError) {
      return NextResponse.json(
        { success: false, error: err.message },
        { status: 409, headers: AUTH_CACHE_HEADERS }
      );
    }

    return NextResponse.json(
      { success: false, error: 'Internal server error processing agent creation' },
      { status: 500, headers: AUTH_CACHE_HEADERS }
    );
  }
}

export async function GET(req: Request) {
  const authService = getAuthService();
  const agentService = getAgentService();

  try {
    // 1. Authenticate using verified SIWE session
    const authenticatedOwner = await authService.getAuthenticatedOwnerAddress(req);

    // 2. Parse and validate query parameters
    const url = new URL(req.url);

    let status: AgentStatus | undefined = undefined;
    const statusParam = url.searchParams.get('status');
    if (statusParam !== null) {
      const upperStatus = statusParam.trim().toUpperCase() as AgentStatus;
      if (!VALID_STATUSES.has(upperStatus)) {
        return NextResponse.json(
          {
            success: false,
            error: `Invalid status filter: "${statusParam}". Must be ACTIVE, PAUSED, or TERMINATED.`,
          },
          { status: 400, headers: AUTH_CACHE_HEADERS }
        );
      }
      status = upperStatus;
    }

    let limit: number | undefined = undefined;
    const limitParam = url.searchParams.get('limit');
    if (limitParam !== null) {
      if (!/^\d+$/.test(limitParam.trim())) {
        return NextResponse.json(
          { success: false, error: 'limit must be an integer between 0 and 1000' },
          { status: 400, headers: AUTH_CACHE_HEADERS }
        );
      }
      const parsedLimit = parseInt(limitParam.trim(), 10);
      if (parsedLimit < 0 || parsedLimit > 1000) {
        return NextResponse.json(
          { success: false, error: 'limit must be an integer between 0 and 1000' },
          { status: 400, headers: AUTH_CACHE_HEADERS }
        );
      }
      limit = parsedLimit;
    }

    let offset: number | undefined = undefined;
    const offsetParam = url.searchParams.get('offset');
    if (offsetParam !== null) {
      if (!/^\d+$/.test(offsetParam.trim())) {
        return NextResponse.json(
          { success: false, error: 'offset must be a non-negative integer' },
          { status: 400, headers: AUTH_CACHE_HEADERS }
        );
      }
      const parsedOffset = parseInt(offsetParam.trim(), 10);
      if (parsedOffset < 0) {
        return NextResponse.json(
          { success: false, error: 'offset must be a non-negative integer' },
          { status: 400, headers: AUTH_CACHE_HEADERS }
        );
      }
      offset = parsedOffset;
    }

    // 3. Query agents strictly scoped to authenticated owner
    const agents = await agentService.listAgents(authenticatedOwner, {
      status,
      limit,
      offset,
    });

    return NextResponse.json(
      {
        success: true,
        data: agents,
        count: agents.length,
      },
      { status: 200, headers: AUTH_CACHE_HEADERS }
    );
  } catch (err: unknown) {
    if (err instanceof AuthenticationError) {
      return NextResponse.json(
        { success: false, error: err.message },
        { status: 401, headers: AUTH_CACHE_HEADERS }
      );
    }

    if (err instanceof InvalidAgentInputError) {
      return NextResponse.json(
        { success: false, error: err.message },
        { status: 400, headers: AUTH_CACHE_HEADERS }
      );
    }

    return NextResponse.json(
      { success: false, error: 'Internal server error listing agents' },
      { status: 500, headers: AUTH_CACHE_HEADERS }
    );
  }
}
