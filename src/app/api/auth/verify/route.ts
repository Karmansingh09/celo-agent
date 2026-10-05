import { NextResponse } from 'next/server';
import {
  getAuthService,
  AuthenticationError,
  InvalidNonceError,
  CsrfError,
  AUTH_CACHE_HEADERS,
} from '@/lib/auth';

export async function POST(req: Request) {
  const authService = getAuthService();

  try {
    // Enforce CSRF Origin check on state-changing request
    authService.assertValidOrigin(req);

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        { success: false, error: 'Invalid JSON request payload' },
        { status: 400, headers: AUTH_CACHE_HEADERS }
      );
    }

    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return NextResponse.json(
        { success: false, error: 'Verification payload must be a non-null object' },
        { status: 400, headers: AUTH_CACHE_HEADERS }
      );
    }

    const { message, signature } = body as Record<string, unknown>;
    if (typeof message !== 'string' || typeof signature !== 'string') {
      return NextResponse.json(
        { success: false, error: 'Both "message" and "signature" must be provided as strings' },
        { status: 400, headers: AUTH_CACHE_HEADERS }
      );
    }

    const { session, rawSessionToken } = await authService.verifySiwe({
      message,
      signature,
    });

    const cookieHeader = authService.createSessionCookieHeader(rawSessionToken);

    return NextResponse.json(
      {
        success: true,
        ownerAddress: session.ownerAddress,
      },
      {
        status: 200,
        headers: {
          'Set-Cookie': cookieHeader,
          ...AUTH_CACHE_HEADERS,
        },
      }
    );
  } catch (err: unknown) {
    if (err instanceof CsrfError) {
      return NextResponse.json(
        { success: false, error: err.message },
        { status: 403, headers: AUTH_CACHE_HEADERS }
      );
    }
    if (err instanceof InvalidNonceError) {
      return NextResponse.json(
        { success: false, error: err.message },
        { status: 401, headers: AUTH_CACHE_HEADERS }
      );
    }
    if (err instanceof AuthenticationError) {
      return NextResponse.json(
        { success: false, error: err.message },
        { status: 401, headers: AUTH_CACHE_HEADERS }
      );
    }

    return NextResponse.json(
      { success: false, error: 'Internal server error during verification' },
      { status: 500, headers: AUTH_CACHE_HEADERS }
    );
  }
}
