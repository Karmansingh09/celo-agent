import { NextResponse } from 'next/server';
import { AUTH_CACHE_HEADERS } from '@/lib/auth';

/**
 * DEPRECATED: Legacy payment endpoint.
 *
 * This endpoint has been deprecated and disabled in Phase 8.5.
 * It previously exposed unauthenticated direct server payments without SIWE,
 * agent identity, or policy/budget controls.
 *
 * All programmatic and user-initiated spending must use the controlled agent payment API:
 * POST /api/agents/[id]/payments
 */
export async function POST(): Promise<NextResponse> {
  return NextResponse.json(
    {
      success: false,
      error: 'This payment endpoint has been deprecated. Use the controlled agent payment API at POST /api/agents/[id]/payments',
    },
    {
      status: 410,
      headers: AUTH_CACHE_HEADERS,
    }
  );
}

export async function GET(): Promise<NextResponse> {
  return NextResponse.json(
    {
      success: false,
      error: 'This payment endpoint has been deprecated. Use the controlled agent payment API at POST /api/agents/[id]/payments',
    },
    {
      status: 410,
      headers: AUTH_CACHE_HEADERS,
    }
  );
}

