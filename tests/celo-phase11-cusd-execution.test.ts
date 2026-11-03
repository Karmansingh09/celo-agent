import { describe, expect, it, vi } from 'vitest';
import {
  encodeAbiParameters,
  encodeEventTopics,
  erc20Abi,
  parseUnits,
  PublicClient,
  WalletClient,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { CeloCusdPaymentExecutor } from '../src/lib/payment/cusd-execution';
import { AssetMismatchError, PaymentExecutionRequest } from '../src/lib/payment/execution-types';

describe('Phase 11: real cUSD Sepolia execution rail', () => {
  const account = privateKeyToAccount(`0x${'1'.repeat(64)}`);
  const sender = account.address;
  const recipient = '0x2222222222222222222222222222222222222222' as const;
  const token = '0x3333333333333333333333333333333333333333' as const;
  const txHash = `0x${'a'.repeat(64)}` as `0x${string}`;
  const amountWei = parseUnits('0.15', 18);

  function makeReceipt(options?: {
    status?: 'success' | 'reverted';
    transferTo?: `0x${string}`;
    transferAmount?: bigint;
    logToken?: `0x${string}`;
  }) {
    const topics = encodeEventTopics({
      abi: erc20Abi,
      eventName: 'Transfer',
      args: {
        from: sender,
        to: options?.transferTo || recipient,
      },
    });
    const data = encodeAbiParameters(
      [{ name: 'value', type: 'uint256' }],
      [options?.transferAmount ?? amountWei]
    );
    return {
      transactionHash: txHash,
      blockHash: `0x${'b'.repeat(64)}`,
      blockNumber: 100n,
      transactionIndex: 0,
      from: sender,
      to: token,
      cumulativeGasUsed: 50_000n,
      gasUsed: 50_000n,
      contractAddress: null,
      effectiveGasPrice: 1n,
      status: options?.status || 'success',
      type: 'legacy' as const,
      logs: [
        {
          address: options?.logToken || token,
          topics,
          data,
          blockHash: `0x${'b'.repeat(64)}`,
          blockNumber: 100n,
          transactionHash: txHash,
          transactionIndex: 0,
          logIndex: 0,
          removed: false,
        },
      ],
    };
  }

  function setup(receipt = makeReceipt(), overrides?: {
    tokenBalance?: bigint;
    nativeBalance?: bigint;
    decimals?: number;
  }) {
    const writeContract = vi.fn().mockResolvedValue(txHash);
    const publicClient = {
      readContract: vi.fn(async ({ functionName }: { functionName: string }) => {
        if (functionName === 'decimals') return overrides?.decimals ?? 18;
        return overrides?.tokenBalance ?? amountWei;
      }),
      estimateContractGas: vi.fn(async () => 50_000n),
      getGasPrice: vi.fn(async () => 1n),
      getBalance: vi.fn(async () => overrides?.nativeBalance ?? 1_000_000n),
      waitForTransactionReceipt: vi.fn(async () => receipt),
      getChainId: vi.fn(async () => 11142220),
      getTransactionReceipt: vi.fn(async () => receipt),
    } as unknown as PublicClient;
    const walletClient = { writeContract } as unknown as WalletClient;

    const executor = new CeloCusdPaymentExecutor({
      publicClientFactory: () => publicClient,
      walletClientFactory: () => walletClient,
      accountResolver: () => account,
      tokenResolver: () => token,
    });

    return { executor, publicClient, writeContract };
  }

  const request: PaymentExecutionRequest = {
    reservationId: 'res_cusd_1',
    agentId: 'agent_cusd_1',
    recipient,
    asset: { kind: 'CUSD_ERC20', network: 'sepolia' },
    amount: '0.15',
  };

  it('broadcasts an exact cUSD transfer after token and gas preflight checks', async () => {
    const { executor, writeContract } = setup();

    await expect(executor.execute(request)).resolves.toMatchObject({
      success: true,
      status: 'SUBMITTED',
      txHash,
    });
    expect(writeContract).toHaveBeenCalledWith(expect.objectContaining({
      address: token,
      functionName: 'transfer',
      args: [recipient, amountWei],
      gas: 60_000n,
    }));
  });

  it('rejects non-cUSD and non-Sepolia execution without invoking the wallet', async () => {
    const { executor, writeContract } = setup();

    await expect(executor.execute({ ...request, asset: { kind: 'NATIVE_CELO', network: 'sepolia' } }))
      .rejects.toBeInstanceOf(AssetMismatchError);
    await expect(executor.execute({ ...request, asset: { kind: 'CUSD_ERC20', network: 'mainnet' } }))
      .rejects.toBeInstanceOf(AssetMismatchError);
    expect(writeContract).not.toHaveBeenCalled();
  });

  it.each([
    ['token balance', { tokenBalance: amountWei - 1n }],
    ['native gas balance', { nativeBalance: 59_999n }],
    ['unexpected token decimals', { decimals: 6 }],
  ])('fails before broadcast when %s is unsafe', async (_label, overrides) => {
    const { executor, writeContract } = setup(undefined, overrides);

    const result = await executor.execute(request);
    expect(result.status).toBe('FAILED');
    expect(writeContract).not.toHaveBeenCalled();
  });

  it('returns FAILED for a confirmed reverted transaction', async () => {
    const { executor, writeContract } = setup(makeReceipt({ status: 'reverted' }));

    await expect(executor.execute(request)).resolves.toMatchObject({
      success: false,
      status: 'FAILED',
      txHash,
    });
    expect(writeContract).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['wrong recipient', { transferTo: '0x4444444444444444444444444444444444444444' as const }],
    ['wrong amount', { transferAmount: amountWei + 1n }],
    ['wrong token log', { logToken: '0x5555555555555555555555555555555555555555' as const }],
  ])('holds an uncertain result when a successful receipt lacks the authorized %s', async (_label, options) => {
    const { executor } = setup(makeReceipt(options));

    await expect(executor.execute(request)).resolves.toMatchObject({
      success: false,
      status: 'UNCERTAIN',
      txHash,
    });
  });
});
