import { defineChain, getAddress, isAddress } from 'viem';
import { celo, celoSepolia } from 'viem/chains';

/**
 * Explicit Celo Sepolia Testnet Chain definition.
 * Chain ID: 11142220
 * RPC: https://forno.celo-sepolia.celo-testnet.org
 * Explorer: https://celo-sepolia.blockscout.com
 */
export const celoSepoliaChain = defineChain({
  id: 11142220,
  name: 'Celo Sepolia Testnet',
  nativeCurrency: {
    name: 'CELO',
    symbol: 'CELO',
    decimals: 18,
  },
  rpcUrls: {
    default: {
      http: [process.env.CELO_SEPOLIA_RPC_URL || 'https://forno.celo-sepolia.celo-testnet.org'],
    },
    public: {
      http: [process.env.CELO_SEPOLIA_RPC_URL || 'https://forno.celo-sepolia.celo-testnet.org'],
    },
  },
  blockExplorers: {
    default: {
      name: 'Celo Sepolia Blockscout',
      url: 'https://celo-sepolia.blockscout.com',
    },
  },
  testnet: true,
});

/**
 * Celo Mainnet Chain definition reference.
 * Chain ID: 42220
 * RPC: https://forno.celo.org
 */
export const celoMainnetChain = celo;

/**
 * Helper to retrieve current active chain configuration based on environment variable.
 */
export function getActiveCeloChain() {
  const network = process.env.CELO_NETWORK || 'sepolia';
  if (network === 'mainnet') {
    return celoMainnetChain;
  }
  return celoSepoliaChain;
}

export const CURRENT_CHAIN = getActiveCeloChain();

/**
 * Gets the block explorer transaction URL for a transaction hash.
 *
 * @param txHash Hex transaction hash
 * @param network Optional network override ('sepolia' | 'mainnet')
 * @returns Explorer URL string
 */
export function getExplorerTxUrl(txHash: string, network?: string): string {
  const chain = network === 'mainnet'
    ? celoMainnetChain
    : network === 'sepolia'
    ? celoSepoliaChain
    : getActiveCeloChain();

  const baseUrl = chain.blockExplorers?.default?.url || 'https://celo-sepolia.blockscout.com';
  return `${baseUrl}/tx/${txHash}`;
}

/**
 * Retrieves the maximum payment spending limit in CELO configured via env.
 * Default is 0.01 CELO for testnet safety.
 *
 * @returns CELO amount string (e.g. "0.01")
 */
export function getMaxPaymentLimit(): string {
  const envVal = process.env.CELO_MAX_PAYMENT;
  if (!envVal || typeof envVal !== 'string' || envVal.trim() === '') {
    return '0.01';
  }
  return envVal.trim();
}

/**
 * Resolves the configured cUSD token contract for the active Celo network.
 *
 * Settlement verification fails closed when the token contract is not
 * explicitly configured. No token address is guessed here.
 */
export function getCusdTokenAddress(network?: string): `0x${string}` {
  const resolvedNetwork = network === 'mainnet' ? 'mainnet' : 'sepolia';
  const envName = resolvedNetwork === 'mainnet'
    ? 'CELO_MAINNET_CUSD_ADDRESS'
    : 'CELO_SEPOLIA_CUSD_ADDRESS';
  const configuredAddress = process.env[envName]?.trim();

  if (!configuredAddress || !isAddress(configuredAddress)) {
    throw new Error(`${envName} must be configured with a valid cUSD token contract address`);
  }

  return getAddress(configuredAddress);
}
