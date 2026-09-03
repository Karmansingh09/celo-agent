import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { validatePaymentRequest, executePayment, PaymentRequest } from '../src/lib/celo/payment';
import { getExplorerTxUrl, getMaxPaymentLimit } from '../src/lib/celo/config';

describe('Phase 3: Payment Request & Policy Validation', () => {
  const validRecipient = '0x19E7E376E7C213B7E7e7e46cc70A5dD086DAff2A';

  it('1. should validate a correct payment request', () => {
    const req: PaymentRequest = {
      to: validRecipient,
      amountCelo: '0.005',
      purpose: 'Unit Test Fee',
    };
    const result = validatePaymentRequest(req);
    expect(result.valid).toBe(true);
    expect(result.recipient).toBe(validRecipient);
    expect(result.amountWei).toBeDefined();
    expect(result.amountWei).toBe(5000000000000000n); // 0.005 ETH/CELO in Wei
  });

  it('2. should reject invalid EVM recipient addresses', () => {
    const invalidAddresses = ['', '0xinvalid', '12345', '0x123'];
    for (const addr of invalidAddresses) {
      const res = validatePaymentRequest({ to: addr, amountCelo: '0.01' });
      expect(res.valid).toBe(false);
      expect(res.error).toBeDefined();
    }
  });

  it('3. should reject non-numeric and malformed amount strings', () => {
    const invalidAmounts = ['abc', '0.01.02', '1e10', 'undefined', ''];
    for (const amt of invalidAmounts) {
      const res = validatePaymentRequest({ to: validRecipient, amountCelo: amt });
      expect(res.valid).toBe(false);
    }
  });

  it('4. should reject zero amount payments', () => {
    const res1 = validatePaymentRequest({ to: validRecipient, amountCelo: '0' });
    expect(res1.valid).toBe(false);
    expect(res1.error).toContain('greater than 0');

    const res2 = validatePaymentRequest({ to: validRecipient, amountCelo: '0.00' });
    expect(res2.valid).toBe(false);
  });

  it('5. should reject negative amount payments', () => {
    const res = validatePaymentRequest({ to: validRecipient, amountCelo: '-0.01' });
    expect(res.valid).toBe(false);
    expect(res.error).toBeDefined();
  });

  it('6. should enforce CELO_MAX_PAYMENT spending limit', () => {
    // Default limit is 0.01 CELO
    const resOver = validatePaymentRequest({ to: validRecipient, amountCelo: '0.05' });
    expect(resOver.valid).toBe(false);
    expect(resOver.error).toContain('exceeds configured spending limit');

    // Amount equal to or below limit should pass
    const resValid = validatePaymentRequest({ to: validRecipient, amountCelo: '0.01' });
    expect(resValid.valid).toBe(true);
  });
});

describe('Phase 3: Agent Wallet & Balance Pre-Checks', () => {
  const originalEnvKey = process.env.AGENT_PRIVATE_KEY;

  beforeEach(() => {
    delete process.env.AGENT_PRIVATE_KEY;
  });

  afterEach(() => {
    if (originalEnvKey !== undefined) {
      process.env.AGENT_PRIVATE_KEY = originalEnvKey;
    } else {
      delete process.env.AGENT_PRIVATE_KEY;
    }
  });

  it('7. should fail execution when agent wallet is missing', async () => {
    const req: PaymentRequest = {
      to: '0x19E7E376E7C213B7E7e7e46cc70A5dD086DAff2A',
      amountCelo: '0.001',
    };
    const result = await executePayment(req);
    expect(result.success).toBe(false);
    expect(result.status).toBe('failed');
    expect(result.error).toContain('Agent wallet not configured');
  });

  it('8. should return insufficient balance error when agent balance is low', async () => {
    // Synthetic non-sensitive test key
    process.env.AGENT_PRIVATE_KEY = '0x1111111111111111111111111111111111111111111111111111111111111111';

    // Mock public client getBalance to return 0 Wei
    const publicClientModule = await import('../src/lib/celo/public-client');
    const mockPublicClient = {
      getBalance: vi.fn().mockResolvedValue(0n),
      getGasPrice: vi.fn().mockResolvedValue(1000000000n),
      waitForTransactionReceipt: vi.fn(),
    };
    vi.spyOn(publicClientModule, 'getPublicClient').mockReturnValue(mockPublicClient as any);

    const result = await executePayment({
      to: '0x19E7E376E7C213B7E7e7e46cc70A5dD086DAff2A',
      amountCelo: '0.005',
    });

    expect(result.success).toBe(false);
    expect(result.status).toBe('failed');
    expect(result.error).toContain('Insufficient agent wallet balance');

    vi.restoreAllMocks();
  });
});

describe('Phase 3: Explorer Links & Result Structures', () => {
  it('9. should generate correct Blockscout explorer URL for Celo Sepolia', () => {
    const mockTxHash = '0xa1b2c3d4e5f678901234567890abcdef1234567890abcdef1234567890abcdef';
    const url = getExplorerTxUrl(mockTxHash, 'sepolia');
    expect(url).toBe(`https://celo-sepolia.blockscout.com/tx/${mockTxHash}`);
  });

  it('10. should return correct max payment limit helper string', () => {
    expect(getMaxPaymentLimit()).toBe('0.01');
  });

  it('11. should structure payment results with status, explorer URL, and amounts', async () => {
    process.env.AGENT_PRIVATE_KEY = '0x1111111111111111111111111111111111111111111111111111111111111111';
    const mockHash = '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef';

    // Mock clients for successful execution test
    const publicClientModule = await import('../src/lib/celo/public-client');
    const walletClientModule = await import('../src/lib/celo/wallet-client');

    const mockPublicClient = {
      getBalance: vi.fn().mockResolvedValue(1000000000000000000n), // 1 CELO
      getGasPrice: vi.fn().mockResolvedValue(1000000000n),
      waitForTransactionReceipt: vi.fn().mockResolvedValue({
        status: 'success',
        transactionHash: mockHash,
        blockNumber: 100n,
      }),
    };

    const mockWalletClient = {
      sendTransaction: vi.fn().mockResolvedValue(mockHash),
    };

    vi.spyOn(publicClientModule, 'getPublicClient').mockReturnValue(mockPublicClient as any);
    vi.spyOn(walletClientModule, 'getAgentWalletClient').mockReturnValue(mockWalletClient as any);

    const res = await executePayment({
      to: '0x19E7E376E7C213B7E7e7e46cc70A5dD086DAff2A',
      amountCelo: '0.005',
      purpose: 'Mock Test Payment',
    });

    expect(res.success).toBe(true);
    expect(res.status).toBe('confirmed');
    expect(res.txHash).toBe(mockHash);
    expect(res.explorerUrl).toContain(mockHash);
    expect(res.to).toBe('0x19E7E376E7C213B7E7e7e46cc70A5dD086DAff2A');

    vi.restoreAllMocks();
  });

  it('12. should handle on-chain revert execution safely', async () => {
    process.env.AGENT_PRIVATE_KEY = '0x1111111111111111111111111111111111111111111111111111111111111111';
    const mockHash = '0x9999999999999999999999999999999999999999999999999999999999999999';

    const publicClientModule = await import('../src/lib/celo/public-client');
    const walletClientModule = await import('../src/lib/celo/wallet-client');

    const mockPublicClient = {
      getBalance: vi.fn().mockResolvedValue(1000000000000000000n),
      getGasPrice: vi.fn().mockResolvedValue(1000000000n),
      waitForTransactionReceipt: vi.fn().mockResolvedValue({
        status: 'reverted',
        transactionHash: mockHash,
        blockNumber: 100n,
      }),
    };

    const mockWalletClient = {
      sendTransaction: vi.fn().mockResolvedValue(mockHash),
    };

    vi.spyOn(publicClientModule, 'getPublicClient').mockReturnValue(mockPublicClient as any);
    vi.spyOn(walletClientModule, 'getAgentWalletClient').mockReturnValue(mockWalletClient as any);

    const res = await executePayment({
      to: '0x19E7E376E7C213B7E7e7e46cc70A5dD086DAff2A',
      amountCelo: '0.005',
    });

    expect(res.success).toBe(false);
    expect(res.status).toBe('failed');
    expect(res.error).toContain('reverted');

    vi.restoreAllMocks();
  });
});
