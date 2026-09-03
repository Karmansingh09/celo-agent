import { NextResponse } from 'next/server';
import { getActiveCeloChain } from '@/lib/celo/config';
import { checkBlockchainHealth } from '@/lib/celo/public-client';
import { getAgentAddress, isAgentConfigured } from '@/lib/celo/account';

export async function GET() {
  try {
    const chain = getActiveCeloChain();
    const network = process.env.CELO_NETWORK || 'sepolia';
    const health = await checkBlockchainHealth();
    const agentConfigured = isAgentConfigured();
    const agentAddress = getAgentAddress();

    return NextResponse.json({
      network,
      chainId: chain.id,
      rpcConnected: health.rpcConnected,
      latestBlock: health.latestBlock ? Number(health.latestBlock) : null,
      agentConfigured,
      agentAddress,
      ...(health.error ? { error: health.error } : {}),
    });
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : 'Internal server error checking Celo health';
    return NextResponse.json(
      {
        network: process.env.CELO_NETWORK || 'sepolia',
        chainId: 11142220,
        rpcConnected: false,
        latestBlock: null,
        agentConfigured: false,
        agentAddress: null,
        error: errorMessage,
      },
      { status: 500 }
    );
  }
}
