import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { celoSepoliaChain, celoMainnetChain, getActiveCeloChain } from '../src/lib/celo/config';
import { isValidPrivateKey, getAgentAccount, getAgentAddress, isAgentConfigured } from '../src/lib/celo/account';
import { getAgentBalance } from '../src/lib/celo/balance';
import { isValidTxHash, getTransaction, waitForTransaction } from '../src/lib/celo/transactions';
import { checkBlockchainHealth } from '../src/lib/celo/public-client';

describe('Phase 2: Celo Blockchain Network Configuration', () => {
  it('should have correct Celo Sepolia Chain ID 11142220', () => {
    expect(celoSepoliaChain.id).toBe(11142220);
    expect(celoSepoliaChain.rpcUrls.default.http[0]).toBe('https://forno.celo-sepolia.celo-testnet.org');
    expect(celoSepoliaChain.blockExplorers.default.url).toBe('https://celo-sepolia.blockscout.com');
  });

  it('should have correct Celo Mainnet Chain ID 42220', () => {
    expect(celoMainnetChain.id).toBe(42220);
    expect(celoMainnetChain.rpcUrls.default.http[0]).toBe('https://forno.celo.org');
  });

  it('should resolve default active chain to Celo Sepolia', () => {
    delete process.env.CELO_NETWORK;
    const chain = getActiveCeloChain();
    expect(chain.id).toBe(11142220);
  });
});

describe('Phase 2: Backend Agent Key Management & Security', () => {
  const originalEnv = process.env.AGENT_PRIVATE_KEY;

  beforeEach(() => {
    delete process.env.AGENT_PRIVATE_KEY;
  });

  afterEach(() => {
    if (originalEnv !== undefined) {
      process.env.AGENT_PRIVATE_KEY = originalEnv;
    } else {
      delete process.env.AGENT_PRIVATE_KEY;
    }
  });

  it('should return false for missing private key', () => {
    expect(isAgentConfigured()).toBe(false);
    expect(getAgentAddress()).toBeNull();
    expect(getAgentAccount()).toBeNull();
  });

  it('should return false for malformed private key formats', () => {
    expect(isValidPrivateKey('')).toBe(false);
    expect(isValidPrivateKey('invalid_key')).toBe(false);
    expect(isValidPrivateKey('0x12345')).toBe(false); // short
    expect(isValidPrivateKey('1111111111111111111111111111111111111111111111111111111111111111')).toBe(false); // no 0x prefix

    process.env.AGENT_PRIVATE_KEY = 'invalid_key';
    expect(isAgentConfigured()).toBe(false);
    expect(getAgentAddress()).toBeNull();
  });

  it('should resolve correct checksummed address for valid private key', () => {
    // Synthetic non-sensitive test key
    const testKey = '0x1111111111111111111111111111111111111111111111111111111111111111';
    expect(isValidPrivateKey(testKey)).toBe(true);

    process.env.AGENT_PRIVATE_KEY = testKey;
    expect(isAgentConfigured()).toBe(true);
    const address = getAgentAddress();
    expect(address).toBeDefined();
    expect(address).toMatch(/^0x[a-fA-F0-9]{40}$/);
    expect(address).toBe('0x19E7E376E7C213B7E7e7e46cc70A5dD086DAff2A');
  });
});

describe('Phase 2: Balance Service', () => {
  it('should return unconfigured status when no address is provided or configured', async () => {
    delete process.env.AGENT_PRIVATE_KEY;
    const balance = await getAgentBalance();
    expect(balance.isConfigured).toBe(false);
    expect(balance.address).toBeNull();
    expect(balance.formattedBalance).toBeNull();
  });

  it('should return error status for invalid EVM address', async () => {
    const balance = await getAgentBalance('invalid_address');
    expect(balance.isConfigured).toBe(false);
    expect(balance.error).toBe('Invalid EVM address format');
  });
});

describe('Phase 2: Transaction Read/Wait Infrastructure', () => {
  it('should validate hex transaction hashes', () => {
    expect(isValidTxHash('0x1234')).toBe(false);
    expect(isValidTxHash('0x' + '1'.repeat(64))).toBe(true);
  });

  it('should handle invalid tx hash safely in getTransaction', async () => {
    const res = await getTransaction('invalid_hash');
    expect(res.status).toBe('not_found');
    expect(res.error).toBe('Invalid transaction hash format');
  });

  it('should handle invalid tx hash safely in waitForTransaction', async () => {
    const res = await waitForTransaction('invalid_hash');
    expect(res.status).toBe('failed');
    expect(res.error).toBe('Invalid transaction hash format');
  });
});

describe('Phase 2: Blockchain Health Check', () => {
  it('should execute blockchain health check without crashing', async () => {
    const health = await checkBlockchainHealth();
    expect(typeof health.rpcConnected).toBe('boolean');
  });
});
