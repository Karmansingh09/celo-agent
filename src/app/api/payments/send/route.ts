import { NextResponse } from 'next/server';
import { executePayment, validatePaymentRequest, PaymentRequest } from '@/lib/celo/payment';
import { isAgentConfigured } from '@/lib/celo/account';

export async function POST(req: Request) {
  try {
    let body: PaymentRequest;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        { success: false, status: 'failed', error: 'Invalid JSON request payload' },
        { status: 400 }
      );
    }

    // Check agent wallet configuration
    if (!isAgentConfigured()) {
      return NextResponse.json(
        {
          success: false,
          status: 'failed',
          error: 'Agent wallet not configured. Please set AGENT_PRIVATE_KEY in environment variables.',
        },
        { status: 403 }
      );
    }

    // Validate payment request parameters & spending policy
    const validation = validatePaymentRequest(body);
    if (!validation.valid) {
      return NextResponse.json(
        { success: false, status: 'failed', error: validation.error },
        { status: 400 }
      );
    }

    // Execute server-side payment transaction
    const result = await executePayment(body);

    if (!result.success) {
      return NextResponse.json(
        {
          success: false,
          status: 'failed',
          txHash: result.txHash,
          error: result.error || 'Payment execution failed',
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      txHash: result.txHash,
      status: result.status,
      amountCelo: result.amountCelo,
      to: result.to,
      purpose: result.purpose,
      explorerUrl: result.explorerUrl,
    });
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : 'Internal server error processing payment';
    return NextResponse.json(
      { success: false, status: 'failed', error: errorMessage },
      { status: 500 }
    );
  }
}
