import { defineChain } from 'viem';
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
