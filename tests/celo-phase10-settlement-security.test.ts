import { describe, expect, it, vi } from 'vitest';
import {
  encodeAbiParameters,
  encodeEventTopics,
  erc20Abi,
  PublicClient,
} from 'viem';
import { CeloSettlementReceiptVerifier } from '../src/lib/celo/settlement-verifier';
import {
  EnforcePaymentRequest,
  PolicyEnforcementService,
  SettlementReceiptVerifier,
  TrustedSettlementConfirmation,
} from '../src/lib/policy';
import { InMemoryBudgetStore } from '../src/lib/policy/in-memory-budget-store';

describe('P0-A: settlement receipt and reservation security', () => {
  const txHash = '0x' + 'a'.repeat(64) as `0x${string}`;
  const sender = '0x1111111111111111111111111111111111111111' as const;
  const recipient = '0x2222222222222222222222222222222222222222' as const;
  const otherRecipient = '0x3333333333333333333333333333333333333333' as const;
  const token = '0x4444444444444444444444444444444444444444' as const;
  const otherToken = '0x5555555555555555555555555555555555555555' as const;
  const amountWei = 150000000000000000n;

  function makeReceipt(options?: {
    chainId?: number;
    status?: 'success' | 'reverted';
    from?: `0x${string}`;
    to?: `0x${string}` | null;
    transferFrom?: `0x${string}`;
    transferTo?: `0x${string}`;
    transferAmount?: bigint;
    includeTransfer?: boolean;
    receiptHash?: `0x${string}`;
  }) {
    const transferTopics = encodeEventTopics({
      abi: erc20Abi,
      eventName: 'Transfer',
      args: {
        from: options?.transferFrom || sender,
        to: options?.transferTo || recipient,
      },
    });
    const transferData = encodeAbiParameters(
      [{ name: 'value', type: 'uint256' }],
      [options?.transferAmount ?? amountWei]
    );
    const logs = options?.includeTransfer === false
      ? []
      : [{
          address: options?.to || token,
          topics: transferTopics,
          data: transferData,
          blockHash: ('0x' + 'b'.repeat(64)) as `0x${string}`,
          blockNumber: 100n,
          transactionHash: options?.receiptHash || txHash,
          transactionIndex: 0,
          logIndex: 0,
          removed: false,
        }];

    return {
      transactionHash: options?.receiptHash || txHash,
      blockHash: ('0x' + 'c'.repeat(64)) as `0x${string}`,
      blockNumber: 100n,
      transactionIndex: 0,
      from: options?.from || sender,
      to: options?.to === undefined ? token : options.to,
      cumulativeGasUsed: 21000n,
      gasUsed: 21000n,
      contractAddress: null,
      effectiveGasPrice: 1n,
      status: options?.status || 'success',
      type: 'legacy' as const,
      logs,
      chainId: options?.chainId || 11142220,
    };
  }

  function verifierFor(receiptOptions?: Parameters<typeof makeReceipt>[0]) {
    const receipt = makeReceipt(receiptOptions);
    const client = {
      getChainId: vi.fn(async () => receiptOptions?.chainId || 11142220),
      getTransactionReceipt: vi.fn(async () => receipt),
    } as unknown as PublicClient;
    return new CeloSettlementReceiptVerifier(
      () => client,
      () => sender,
      () => token
    );
  }

  it('verifies chain, receipt, sender, token, recipient, amount and Transfer event', async () => {
    const verifier = verifierFor();

    await expect(verifier.verify({
      txHash,
      amountWei,
      recipient,
    })).resolves.toMatchObject({
      txHash,
      chainId: 11142220,
      sender,
      recipient,
      tokenAddress: token,
      amountWei,
    });
  });

  it.each([
    ['wrong chain', { chainId: 42220 }],
    ['reverted receipt', { status: 'reverted' as const }],
    ['wrong sender', { from: otherRecipient }],
    ['wrong token contract', { to: otherToken }],
    ['wrong transfer recipient', { transferTo: otherRecipient }],
    ['wrong transfer amount', { transferAmount: amountWei + 1n }],
    ['missing Transfer event', { includeTransfer: false }],
    ['wrong receipt hash', { receiptHash: ('0x' + 'd'.repeat(64)) as `0x${string}` }],
  ])('rejects %s without producing settlement evidence', async (_label, options) => {
    const verifier = verifierFor(options);

    await expect(verifier.verify({
      txHash,
      amountWei,
      recipient,
    })).rejects.toThrow();
  });

  it('fails closed when receipt lookup is unavailable', async () => {
    const client = {
      getChainId: vi.fn(async () => 11142220),
      getTransactionReceipt: vi.fn(async () => {
        throw new Error('RPC unavailable');
      }),
    } as unknown as PublicClient;
    const verifier = new CeloSettlementReceiptVerifier(
      () => client,
      () => sender,
      () => token
    );

    await expect(verifier.verify({ txHash, amountWei, recipient }))
      .rejects.toThrow('verification unavailable');
  });

  it('never commits a submitted reservation when verification fails', async () => {
    const store = new InMemoryBudgetStore();
    const verifier: SettlementReceiptVerifier = {
      verify: vi.fn(async () => {
        throw new Error('receipt incomplete');
      }),
    };
    const service = new PolicyEnforcementService(store, () => Date.now(), verifier);
    const request: EnforcePaymentRequest = {
      agentId: 'agent-p0',
      amountCusd: '0.15',
      recipient,
      idempotencyKey: 'p0-unverified',
    };
    const policy = {
      agentId: request.agentId,
      maxPerTransaction: '1.00',
      maxPerDay: '2.00',
      allowedRecipients: [recipient],
      autoApproveThreshold: '1.00',
      validUntil: Date.now() + 60_000,
    };
    const result = await service.enforcePayment(policy, request);
    await service.markSubmitted(result.reservation!.id, txHash);

    await expect(service.confirmSettlement(result.reservation!.id, {
      txHash,
    })).rejects.toThrow('receipt incomplete');

    const reservation = await store.getReservationById(result.reservation!.id);
    expect(reservation?.status).toBe('SUBMITTED');
    const state = await store.getBudgetState(request.agentId, reservation!.windowId, '2.00');
    expect(state.reservedCusd).toBe('0.15');
    expect(state.spentCusd).toBe('0');
    expect(verifier.verify).toHaveBeenCalledWith({
      txHash,
      amountWei: reservation!.amountWei,
      recipient,
    });
  });

  it('rejects a valid-looking hash for a RESERVED reservation', async () => {
    const store = new InMemoryBudgetStore();
    const verifier: SettlementReceiptVerifier = {
      verify: vi.fn(),
    };
    const service = new PolicyEnforcementService(store, () => Date.now(), verifier);
    const request: EnforcePaymentRequest = {
      agentId: 'agent-p0-reserved',
      amountCusd: '0.10',
      recipient,
      idempotencyKey: 'p0-reserved-hash',
    };
    const policy = {
      agentId: request.agentId,
      maxPerTransaction: '1.00',
      maxPerDay: '1.00',
      allowedRecipients: [recipient],
      autoApproveThreshold: '1.00',
      validUntil: Date.now() + 60_000,
    };
    const result = await service.enforcePayment(policy, request);

    await expect(service.confirmSettlement(result.reservation!.id, {
      txHash,
    } as TrustedSettlementConfirmation)).rejects.toThrow('requires SUBMITTED');
    expect(verifier.verify).not.toHaveBeenCalled();
    expect((await store.getReservationById(result.reservation!.id))?.status).toBe('RESERVED');
  });
});
