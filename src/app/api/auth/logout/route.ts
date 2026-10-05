import { NextResponse } from 'next/server';
import { getAuthService, CsrfError, AUTH_CACHE_HEADERS } from '@/lib/auth';

export async function POST(req: Request) {
  const authService = getAuthService();

  try {
    // Enforce CSRF Origin check on state-changing logout
    authService.assertValidOrigin(req);

    await authService.logout(req);
    const clearCookieHeader = authService.createClearCookieHeader();

    return NextResponse.json(
      {
        success: true,
        message: 'Logged out successfully',
      },
      {
        status: 200,
        headers: {
          'Set-Cookie': clearCookieHeader,
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

    return NextResponse.json(
      { success: false, error: 'Internal server error during logout' },
      { status: 500, headers: AUTH_CACHE_HEADERS }
    );
  }
}
