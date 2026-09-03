import 'server-only';
import { createWalletClient, http, WalletClient } from 'viem';
import { getActiveCeloChain, celoSepoliaChain, celoMainnetChain } from './config';
import { getAgentAccount } from './account';

/**
 * Retrieves a server-side viem WalletClient for the configured backend agent account.
 *
 * @param network Optional network override ('sepolia' | 'mainnet')
 * @returns WalletClient or null if agent account is not configured
 */
export function getAgentWalletClient(network?: string): WalletClient | null {
  const account = getAgentAccount();
  if (!account) {
    return null;
  }

  const chain = network === 'mainnet'
    ? celoMainnetChain
    : network === 'sepolia'
    ? celoSepoliaChain
    : getActiveCeloChain();

  return createWalletClient({
    account,
    chain,
    transport: http(chain.rpcUrls.default.http[0]),
  });
}
