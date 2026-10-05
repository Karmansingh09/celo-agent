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
  InvalidAgentStateError,
  AgentTerminatedError,
  isValidAgentId,
} from '@/lib/agent';

interface RouteContext {
  params: {
    id: string;
  };
}

async function parseOptionalLifecycleReason(
  req: Request
): Promise<{ reason?: string } | { error: string }> {
  const text = await req.text();
  if (text.trim().length === 0) {
    return {};
  }

  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return { error: 'Invalid JSON request payload' };
  }

  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { error: 'Request body must be a valid non-null object' };
  }

  const rawBody = body as Record<string, unknown>;
  for (const key of Object.keys(rawBody)) {
    if (key !== 'reason') {
      return { error: `Unexpected or forbidden field: "${key}"` };
    }
  }

  if (rawBody.reason !== undefined) {
    if (
      typeof rawBody.reason !== 'string' ||
      rawBody.reason.trim().length === 0 ||
      rawBody.reason.length > 500
    ) {
      return { error: 'statusReason must be a non-empty string up to 500 characters' };
    }
    return { reason: rawBody.reason.trim() };
  }

  return {};
}

export async function POST(req: Request, context: RouteContext) {
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

    // 4. Parse optional reason from request body
    const bodyResult = await parseOptionalLifecycleReason(req);
    if ('error' in bodyResult) {
      return NextResponse.json(
        { success: false, error: bodyResult.error },
        { status: 400, headers: AUTH_CACHE_HEADERS }
      );
    }

    // 5. Delegate pause operation to AgentService
    const updatedAgent = await agentService.pauseAgent(
      authenticatedOwner,
      id,
      bodyResult.reason
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

    if (err instanceof InvalidAgentStateError || err instanceof AgentTerminatedError) {
      return NextResponse.json(
        { success: false, error: err.message },
        { status: 409, headers: AUTH_CACHE_HEADERS }
      );
    }

    return NextResponse.json(
      { success: false, error: 'Internal server error pausing agent' },
      { status: 500, headers: AUTH_CACHE_HEADERS }
    );
  }
}
