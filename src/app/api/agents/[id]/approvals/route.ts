import { NextResponse } from 'next/server';
import {
  getAuthService,
  AuthenticationError,
  AUTH_CACHE_HEADERS,
} from '@/lib/auth';
import {
  AgentNotFoundError,
  UnauthorizedAgentError,
  isValidAgentId,
} from '@/lib/agent';
import {
  getAgentPaymentService,
  ApprovalStatus,
  PendingApproval,
} from '@/lib/payment';

interface RouteContext {
  params: {
    id: string;
  };
}

const VALID_APPROVAL_STATUSES: Set<ApprovalStatus> = new Set([
  'PENDING',
  'APPROVED',
  'REJECTED',
  'EXPIRED',
  'CANCELLED',
]);

export async function GET(req: Request, context: RouteContext) {
  const authService = getAuthService();
  const paymentService = getAgentPaymentService();

  const { id } = await Promise.resolve(context.params);

  try {
    // 1. Authenticate using verified SIWE session (GET requires no CSRF)
    const authenticatedOwner = await authService.getAuthenticatedOwnerAddress(req);

    // 2. Validate agent ID format
    if (!isValidAgentId(id)) {
      return NextResponse.json(
        { success: false, error: `Invalid agent ID format: "${id}"` },
        { status: 400, headers: AUTH_CACHE_HEADERS }
      );
    }

    // 3. Optional status filter from query params
    const url = new URL(req.url);
    let statusFilter: ApprovalStatus | undefined = undefined;
    const statusParam = url.searchParams.get('status');
    if (statusParam !== null) {
      const upper = statusParam.trim().toUpperCase() as ApprovalStatus;
      if (!VALID_APPROVAL_STATUSES.has(upper)) {
        return NextResponse.json(
          {
            success: false,
            error: `Invalid status filter: "${statusParam}". Must be PENDING, APPROVED, REJECTED, EXPIRED, or CANCELLED.`,
          },
          { status: 400, headers: AUTH_CACHE_HEADERS }
        );
      }
      statusFilter = upper;
    }

    // 4. Delegate to AgentPaymentService (authenticates agent ownership internally)
    const approvals = await paymentService.listPendingApprovals(
      authenticatedOwner,
      id,
      statusFilter
    );

    // 5. Sanitize approval outputs ensuring no internal sensitive data is leaked
    const sanitizedApprovals = approvals.map((appr: PendingApproval) => ({
      requestId: appr.requestId,
      agentId: appr.agentId,
      amountCusd: appr.amountCusd,
      recipient: appr.recipient,
      idempotencyKey: appr.idempotencyKey,
      policyId: appr.policyId,
      createdAt: appr.createdAt,
      validUntil: appr.validUntil,
      status: appr.status,
      statusReason: appr.statusReason,
      resolvedAt: appr.resolvedAt,
    }));

    return NextResponse.json(
      {
        success: true,
        data: sanitizedApprovals,
        count: sanitizedApprovals.length,
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

    // Anti-Enumeration: return 404 uniformly for nonexistent or unauthorized agents
    if (err instanceof AgentNotFoundError || err instanceof UnauthorizedAgentError) {
      return NextResponse.json(
        { success: false, error: `Agent not found: ${id}` },
        { status: 404, headers: AUTH_CACHE_HEADERS }
      );
    }

    return NextResponse.json(
      { success: false, error: 'Internal server error listing pending approvals' },
      { status: 500, headers: AUTH_CACHE_HEADERS }
    );
  }
}
