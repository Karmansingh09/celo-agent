import { NextResponse } from 'next/server';
import {
  getAuthService,
  AuthenticationError,
  CsrfError,
  AUTH_CACHE_HEADERS,
} from '@/lib/auth';
import {
  AgentNotFoundError,
  UnauthorizedAgentError,
  AgentPausedError,
  AgentTerminatedError,
  isValidAgentId,
} from '@/lib/agent';
import {
  getAgentPaymentService,
  PendingApprovalNotFoundError,
  PendingApprovalStateError,
  isValidPaymentRequestId,
} from '@/lib/payment';

interface RouteContext {
  params: {
    id: string;
    requestId: string;
  };
}

async function parseOptionalRejectReason(
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
      return { error: 'reason must be a non-empty string up to 500 characters' };
    }
    return { reason: rawBody.reason.trim() };
  }

  return {};
}

export async function POST(req: Request, context: RouteContext) {
  const authService = getAuthService();
  const paymentService = getAgentPaymentService();

  const { id, requestId } = await Promise.resolve(context.params);

  try {
    // 1. Authenticate using verified SIWE session
    const authenticatedOwner = await authService.getAuthenticatedOwnerAddress(req);

    // 2. Enforce CSRF Origin validation on state-changing request
    authService.assertValidOrigin(req);

    // 3. Validate URL parameters format
    if (!isValidAgentId(id)) {
      return NextResponse.json(
        { success: false, error: `Invalid agent ID format: "${id}"` },
        { status: 400, headers: AUTH_CACHE_HEADERS }
      );
    }

    if (!isValidPaymentRequestId(requestId)) {
      return NextResponse.json(
        { success: false, error: `Invalid request ID format: "${requestId}"` },
        { status: 400, headers: AUTH_CACHE_HEADERS }
      );
    }

    // 4. Parse optional reason from request body
    const bodyResult = await parseOptionalRejectReason(req);
    if ('error' in bodyResult) {
      return NextResponse.json(
        { success: false, error: bodyResult.error },
        { status: 400, headers: AUTH_CACHE_HEADERS }
      );
    }

    // 5. Delegate rejection to AgentPaymentService
    const rejectedApproval = await paymentService.rejectPaymentRequest(
      authenticatedOwner,
      id,
      requestId,
      bodyResult.reason
    );

    return NextResponse.json(
      {
        success: true,
        data: rejectedApproval,
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

    if (err instanceof CsrfError) {
      return NextResponse.json(
        { success: false, error: err.message },
        { status: 403, headers: AUTH_CACHE_HEADERS }
      );
    }

    // Anti-Enumeration: return 404 uniformly for nonexistent/unauthorized agents
    if (err instanceof AgentNotFoundError || err instanceof UnauthorizedAgentError) {
      return NextResponse.json(
        { success: false, error: `Agent not found: ${id}` },
        { status: 404, headers: AUTH_CACHE_HEADERS }
      );
    }

    // Approval not found for this agent
    if (err instanceof PendingApprovalNotFoundError) {
      return NextResponse.json(
        { success: false, error: `Pending approval not found: ${requestId}` },
        { status: 404, headers: AUTH_CACHE_HEADERS }
      );
    }

    // Agent status conflicts
    if (err instanceof AgentPausedError || err instanceof AgentTerminatedError) {
      return NextResponse.json(
        { success: false, error: err.message },
        { status: 409, headers: AUTH_CACHE_HEADERS }
      );
    }

    // Approval lifecycle state conflicts (already approved, rejected, expired, etc.)
    if (err instanceof PendingApprovalStateError) {
      return NextResponse.json(
        { success: false, error: err.message },
        { status: 409, headers: AUTH_CACHE_HEADERS }
      );
    }

    return NextResponse.json(
      { success: false, error: 'Internal server error processing rejection' },
      { status: 500, headers: AUTH_CACHE_HEADERS }
    );
  }
}
