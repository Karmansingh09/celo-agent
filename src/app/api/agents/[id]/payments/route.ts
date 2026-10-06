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
  InvalidPaymentInputError,
  PaymentIdempotencyConflictError,
  AgentPaymentRequest,
  serializePaymentResult,
} from '@/lib/payment';

interface RouteContext {
  params: {
    id: string;
  };
}

const ALLOWED_PAYMENT_KEYS = new Set([
  'amountCusd',
  'recipient',
  'idempotencyKey',
  'policyId',
  'purpose',
  'requestId',
]);

export async function POST(req: Request, context: RouteContext) {
  const authService = getAuthService();
  const paymentService = getAgentPaymentService();

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

    // 6. Reject unknown or forbidden fields (including client-supplied ownerAddress)
    for (const key of Object.keys(rawBody)) {
      if (!ALLOWED_PAYMENT_KEYS.has(key)) {
        return NextResponse.json(
          { success: false, error: `Unexpected or forbidden field: "${key}"` },
          { status: 400, headers: AUTH_CACHE_HEADERS }
        );
      }
    }

    // 7. Check required fields
    if (typeof rawBody.amountCusd !== 'string' || rawBody.amountCusd.trim() === '') {
      return NextResponse.json(
        { success: false, error: 'amountCusd is required and must be a non-empty string' },
        { status: 400, headers: AUTH_CACHE_HEADERS }
      );
    }

    if (typeof rawBody.recipient !== 'string' || rawBody.recipient.trim() === '') {
      return NextResponse.json(
        { success: false, error: 'recipient is required and must be a non-empty string' },
        { status: 400, headers: AUTH_CACHE_HEADERS }
      );
    }

    if (typeof rawBody.idempotencyKey !== 'string' || rawBody.idempotencyKey.trim() === '') {
      return NextResponse.json(
        { success: false, error: 'idempotencyKey is required and must be a non-empty string' },
        { status: 400, headers: AUTH_CACHE_HEADERS }
      );
    }

    // Construct domain request with server-enforced agentId
    const paymentRequest: AgentPaymentRequest = {
      agentId: id,
      amountCusd: rawBody.amountCusd.trim(),
      recipient: rawBody.recipient.trim(),
      idempotencyKey: rawBody.idempotencyKey.trim(),
      policyId: typeof rawBody.policyId === 'string' ? rawBody.policyId.trim() : undefined,
      purpose: typeof rawBody.purpose === 'string' ? rawBody.purpose.trim() : undefined,
      requestId: typeof rawBody.requestId === 'string' ? rawBody.requestId.trim() : undefined,
    };

    // 8. Delegate to AgentPaymentService
    const result = await paymentService.requestPayment(authenticatedOwner, paymentRequest);

    // Map outcome to HTTP status
    // RESERVED: 200 OK (or 201 Created)
    // REQUIRE_USER_APPROVAL: 202 Accepted
    // DUPLICATE_COMMITTED: 200 OK
    // POLICY_DENIED / BUDGET_DENIED / DUPLICATE_IN_PROGRESS / IDEMPOTENCY_CONFLICT: 409 Conflict (or 422 Unprocessable)
    let statusCode = 200;
    if (result.outcome === 'RESERVED' || result.outcome === 'DUPLICATE_IN_PROGRESS' || result.outcome === 'DUPLICATE_COMMITTED') {
      statusCode = 200;
    } else if (result.outcome === 'REQUIRE_USER_APPROVAL') {
      statusCode = 202;
    } else if (result.outcome === 'POLICY_DENIED' || result.outcome === 'BUDGET_DENIED') {
      statusCode = 422;
    } else if (result.outcome === 'IDEMPOTENCY_CONFLICT') {
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

    // Anti-Enumeration: return 404 uniformly for nonexistent or unauthorized agents
    if (err instanceof AgentNotFoundError || err instanceof UnauthorizedAgentError) {
      return NextResponse.json(
        { success: false, error: `Agent not found: ${id}` },
        { status: 404, headers: AUTH_CACHE_HEADERS }
      );
    }

    if (err instanceof InvalidPaymentInputError) {
      return NextResponse.json(
        { success: false, error: err.message },
        { status: 400, headers: AUTH_CACHE_HEADERS }
      );
    }

    if (
      err instanceof AgentPausedError ||
      err instanceof AgentTerminatedError ||
      err instanceof PaymentIdempotencyConflictError
    ) {
      return NextResponse.json(
        { success: false, error: err.message },
        { status: 409, headers: AUTH_CACHE_HEADERS }
      );
    }

    return NextResponse.json(
      { success: false, error: 'Internal server error processing payment request' },
      { status: 500, headers: AUTH_CACHE_HEADERS }
    );
  }
}
