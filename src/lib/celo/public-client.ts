import { createPublicClient, http, PublicClient } from 'viem';
import { getActiveCeloChain, celoSepoliaChain, celoMainnetChain } from './config';

/**
 * Creates a viem PublicClient for read-only Celo blockchain operations.
 *
 * @param network Optional network override ('sepolia' | 'mainnet')
 * @returns PublicClient instance
 */
export function getPublicClient(network?: string): PublicClient {
  const chain = network === 'mainnet'
    ? celoMainnetChain
    : network === 'sepolia'
    ? celoSepoliaChain
    : getActiveCeloChain();

  return createPublicClient({
    chain,
    transport: http(chain.rpcUrls.default.http[0]),
  }) as PublicClient;
}

/** Default shared PublicClient instance for active configured network */
export const publicClient = getPublicClient();

/**
 * Checks RPC connectivity to Celo network.
 *
 * @param network Optional network override
 * @returns Object with connectivity status and latest block number if successful
 */
export async function checkBlockchainHealth(network?: string): Promise<{
  rpcConnected: boolean;
  latestBlock: bigint | null;
  error?: string;
}> {
  try {
    const client = getPublicClient(network);
    const blockNumber = await client.getBlockNumber();
    return {
      rpcConnected: true,
      latestBlock: blockNumber,
    };
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : 'RPC Connection Failed';
    return {
      rpcConnected: false,
      latestBlock: null,
      error: errorMessage,
    };
  }
}
