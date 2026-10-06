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
  PendingApprovalExpiredError,
  isValidPaymentRequestId,
  serializePaymentResult,
} from '@/lib/payment';

interface RouteContext {
  params: {
    id: string;
    requestId: string;
  };
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

    // 4. Ensure request body is either empty or empty object (reject unapproved parameters)
    const text = await req.text();
    if (text.trim().length > 0) {
      let body: unknown;
      try {
        body = JSON.parse(text);
      } catch {
        return NextResponse.json(
          { success: false, error: 'Invalid JSON request payload' },
          { status: 400, headers: AUTH_CACHE_HEADERS }
        );
      }
      if (!body || typeof body !== 'object' || Array.isArray(body)) {
        return NextResponse.json(
          { success: false, error: 'Request body must be an object' },
          { status: 400, headers: AUTH_CACHE_HEADERS }
        );
      }
      const keys = Object.keys(body as Record<string, unknown>);
      if (keys.length > 0) {
        return NextResponse.json(
          {
            success: false,
            error: `Unexpected fields in approve request: ${keys.map((k) => `"${k}"`).join(', ')}. Approve does not accept client-supplied parameter overrides.`,
          },
          { status: 400, headers: AUTH_CACHE_HEADERS }
        );
      }
    }

    // 5. Delegate approval to AgentPaymentService (performs fresh policy & budget re-evaluation)
    const result = await paymentService.approvePaymentRequest(
      authenticatedOwner,
      id,
      requestId
    );

    // If reservation succeeded: 200 OK
    // If fresh re-evaluation denied (POLICY_DENIED or BUDGET_DENIED): 422 Unprocessable Entity
    let statusCode = 200;
    if (result.outcome === 'RESERVED') {
      statusCode = 200;
    } else if (result.outcome === 'POLICY_DENIED' || result.outcome === 'BUDGET_DENIED') {
      statusCode = 422;
    } else {
      statusCode = 409;
    }

    return NextResponse.json(
      {
        success: result.success,
        data: serializePaymentResult(result),
      },
      { status: statusCode, headers: AUTH_CACHE_HEADERS }
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
    if (err instanceof PendingApprovalStateError || err instanceof PendingApprovalExpiredError) {
      return NextResponse.json(
        { success: false, error: err.message },
        { status: 409, headers: AUTH_CACHE_HEADERS }
      );
    }

    return NextResponse.json(
      { success: false, error: 'Internal server error processing approval' },
      { status: 500, headers: AUTH_CACHE_HEADERS }
    );
  }
}
