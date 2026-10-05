import { NextResponse } from 'next/server';
import { getAuthService, AUTH_CACHE_HEADERS } from '@/lib/auth';

export async function GET() {
  try {
    const authService = getAuthService();
    const nonce = await authService.issueNonce();

    return NextResponse.json(
      { success: true, nonce },
      {
        status: 200,
        headers: AUTH_CACHE_HEADERS,
      }
    );
  } catch {
    return NextResponse.json(
      { success: false, error: 'Failed to issue authentication nonce' },
      {
        status: 500,
        headers: AUTH_CACHE_HEADERS,
      }
    );
  }
}
