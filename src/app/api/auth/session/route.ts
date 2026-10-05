import { NextResponse } from 'next/server';
import { getAuthService, AUTH_CACHE_HEADERS } from '@/lib/auth';

export async function GET(req: Request) {
  try {
    const authService = getAuthService();
    const ownerAddress = await authService.getAuthenticatedOwnerAddress(req);

    return NextResponse.json(
      {
        authenticated: true,
        ownerAddress,
      },
      {
        status: 200,
        headers: AUTH_CACHE_HEADERS,
      }
    );
  } catch {
    // Unauthenticated requests safely return authenticated: false
    return NextResponse.json(
      { authenticated: false },
      {
        status: 200,
        headers: AUTH_CACHE_HEADERS,
      }
    );
  }
}
