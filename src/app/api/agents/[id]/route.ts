import { NextResponse } from 'next/server';
import {
  getAuthService,
  AuthenticationError,
  CsrfError,
  AUTH_CACHE_HEADERS,
} from '@/lib/auth';
import {
  getAgentService,
  AgentNotFoundError,
  UnauthorizedAgentError,
  InvalidAgentInputError,
  AgentTerminatedError,
  InvalidAgentStateError,
  isValidAgentId,
  UpdateAgentServiceInput,
} from '@/lib/agent';

interface RouteContext {
  params: {
    id: string;
  };
}

const ALLOWED_UPDATE_KEYS = new Set([
  'name',
  'description',
  'spendingPolicy',
  'walletAddress',
  'metadata',
]);

const IMMUTABLE_KEYS = new Set([
  'id',
  'ownerAddress',
  'createdAt',
  'updatedAt',
  'status',
  'statusReason',
]);

export async function GET(req: Request, context: RouteContext) {
  const authService = getAuthService();
  const agentService = getAgentService();

  const { id } = await Promise.resolve(context.params);

  try {
    // 1. Authenticate using verified SIWE session
    const authenticatedOwner = await authService.getAuthenticatedOwnerAddress(req);

    // 2. Validate agent ID format
    if (!isValidAgentId(id)) {
      return NextResponse.json(
        { success: false, error: `Invalid agent ID format: "${id}"` },
        { status: 400, headers: AUTH_CACHE_HEADERS }
      );
    }

    // 3. Delegate to AgentService with verified authenticatedOwner
    const agent = await agentService.getAgentById(authenticatedOwner, id);

    return NextResponse.json(
      { success: true, data: agent },
      { status: 200, headers: AUTH_CACHE_HEADERS }
    );
  } catch (err: unknown) {
    if (err instanceof AuthenticationError) {
      return NextResponse.json(
        { success: false, error: err.message },
        { status: 401, headers: AUTH_CACHE_HEADERS }
      );
    }

    // Anti-Enumeration: return 404 uniformly for both nonexistent and non-owned agents
    if (err instanceof AgentNotFoundError || err instanceof UnauthorizedAgentError) {
      return NextResponse.json(
        { success: false, error: `Agent not found: ${id}` },
        { status: 404, headers: AUTH_CACHE_HEADERS }
      );
    }

    if (err instanceof InvalidAgentInputError) {
      return NextResponse.json(
        { success: false, error: err.message },
        { status: 400, headers: AUTH_CACHE_HEADERS }
      );
    }

    return NextResponse.json(
      { success: false, error: 'Internal server error retrieving agent' },
      { status: 500, headers: AUTH_CACHE_HEADERS }
    );
  }
}

export async function PATCH(req: Request, context: RouteContext) {
  const authService = getAuthService();
  const agentService = getAgentService();

  const { id } = await Promise.resolve(context.params);

  try {
    // 1. Authenticate using verified SIWE session
    const authenticatedOwner = await authService.getAuthenticatedOwnerAddress(req);

    // 2. Enforce CSRF Origin validation on state-changing request
    authService.assertValidOrigin(req);

    // 3. Validate agent ID format
    if (!isValidAgentId(id)) {
      return NextResponse.json(
        { success: false, error: `Invalid agent ID format: "${id}"` },
        { status: 400, headers: AUTH_CACHE_HEADERS }
      );
    }

    // 4. Parse JSON body
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        { success: false, error: 'Invalid JSON request payload' },
        { status: 400, headers: AUTH_CACHE_HEADERS }
      );
    }

    // 5. Validate body is a plain, non-null, non-array object
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return NextResponse.json(
        { success: false, error: 'Request body must be a valid non-null object' },
        { status: 400, headers: AUTH_CACHE_HEADERS }
      );
    }

    const rawBody = body as Record<string, unknown>;
    const keys = Object.keys(rawBody);

    if (keys.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Update request cannot be empty: must supply at least one mutable field to update' },
        { status: 400, headers: AUTH_CACHE_HEADERS }
      );
    }

    // 6. Reject immutable or unknown fields
    for (const key of keys) {
      if (IMMUTABLE_KEYS.has(key)) {
        return NextResponse.json(
          { success: false, error: `Cannot modify immutable field: "${key}"` },
          { status: 400, headers: AUTH_CACHE_HEADERS }
        );
      }
      if (!ALLOWED_UPDATE_KEYS.has(key)) {
        return NextResponse.json(
          { success: false, error: `Unexpected or forbidden field: "${key}"` },
          { status: 400, headers: AUTH_CACHE_HEADERS }
        );
      }
    }

    // 7. Application-level input sanity checks
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

    // 8. Delegate update to AgentService with explicit authenticatedOwner
    const updatedAgent = await agentService.updateAgent(
      authenticatedOwner,
      id,
      rawBody as UpdateAgentServiceInput
    );

    return NextResponse.json(
      { success: true, data: updatedAgent },
      { status: 200, headers: AUTH_CACHE_HEADERS }
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

    // Anti-Enumeration: return 404 uniformly for both nonexistent and non-owned agents
    if (err instanceof AgentNotFoundError || err instanceof UnauthorizedAgentError) {
      return NextResponse.json(
        { success: false, error: `Agent not found: ${id}` },
        { status: 404, headers: AUTH_CACHE_HEADERS }
      );
    }

    if (err instanceof InvalidAgentInputError) {
      return NextResponse.json(
        { success: false, error: err.message },
        { status: 400, headers: AUTH_CACHE_HEADERS }
      );
    }

    if (err instanceof AgentTerminatedError || err instanceof InvalidAgentStateError) {
      return NextResponse.json(
        { success: false, error: err.message },
        { status: 409, headers: AUTH_CACHE_HEADERS }
      );
    }

    return NextResponse.json(
      { success: false, error: 'Internal server error processing agent update' },
      { status: 500, headers: AUTH_CACHE_HEADERS }
    );
  }
}
