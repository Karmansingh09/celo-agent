import { formatEther, isAddress } from 'viem';
import { getPublicClient } from './public-client';
import { getAgentAddress } from './account';

export interface BalanceResult {
  isConfigured: boolean;
  address: string | null;
  formattedBalance: string | null;
  rawBalance: string | null;
  error?: string;
}

/**
 * Retrieves the real native CELO balance for the agent wallet or specified target address.
 *
 * @param targetAddress Optional target EVM address. Defaults to configured agent address.
 * @param network Optional network override ('sepolia' | 'mainnet')
 * @returns BalanceResult object containing status, formatted balance, and raw balance
 */
export async function getAgentBalance(
  targetAddress?: string,
  network?: string
): Promise<BalanceResult> {
  const addressToQuery = targetAddress || getAgentAddress();

  if (!addressToQuery) {
    return {
      isConfigured: false,
      address: null,
      formattedBalance: null,
      rawBalance: null,
    };
  }

  if (!isAddress(addressToQuery)) {
    return {
      isConfigured: false,
      address: addressToQuery,
      formattedBalance: null,
      rawBalance: null,
      error: 'Invalid EVM address format',
    };
  }

  try {
    const client = getPublicClient(network);
    const balanceWei = await client.getBalance({ address: addressToQuery as `0x${string}` });
    const formatted = formatEther(balanceWei);

    return {
      isConfigured: true,
      address: addressToQuery,
      formattedBalance: formatted,
      rawBalance: balanceWei.toString(),
    };
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : 'Failed to query balance from RPC';
    return {
      isConfigured: true,
      address: addressToQuery,
      formattedBalance: null,
      rawBalance: null,
      error: errorMessage,
    };
  }
}
