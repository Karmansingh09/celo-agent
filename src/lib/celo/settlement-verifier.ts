import 'server-only';

import {
  Address,
  PublicClient,
  erc20Abi,
  getAddress,
  isAddress,
  parseEventLogs,
} from 'viem';
import { getAgentAddress } from './account';
import { getActiveCeloChain, getCusdTokenAddress } from './config';
import { getPublicClient } from './public-client';
import type {
  SettlementReceiptVerifier,
  SettlementVerificationRequest,
  VerifiedSettlementEvidence,
} from '../policy/settlement-types';

/**
 * Raised whenever a settlement receipt cannot be independently verified.
 * Callers must preserve the reservation for reconciliation when this occurs.
 */
export class SettlementReceiptVerificationError extends Error {
  public override readonly name = 'SettlementReceiptVerificationError';

  constructor(message: string) {
    super(message);
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export type PublicClientFactory = (network?: string) => PublicClient;
export type TrustedSenderResolver = () => string | null;
export type TrustedTokenResolver = (network?: string) => `0x${string}`;

/**
 * Verifies a cUSD ERC-20 settlement against a live Celo receipt.
 *
 * This class only verifies settlement evidence. It does not submit transfers
 * and does not introduce a cUSD execution rail.
 */
export class CeloSettlementReceiptVerifier implements SettlementReceiptVerifier {
  constructor(
    private readonly publicClientFactory: PublicClientFactory = getPublicClient,
    private readonly senderResolver: TrustedSenderResolver = getAgentAddress,
    private readonly tokenResolver: TrustedTokenResolver = getCusdTokenAddress
  ) {}

  public async verify(
    request: SettlementVerificationRequest
  ): Promise<VerifiedSettlementEvidence> {
    if (
      !request ||
      typeof request.txHash !== 'string' ||
      !/^0x[a-fA-F0-9]{64}$/.test(request.txHash.trim())
    ) {
      throw new SettlementReceiptVerificationError('Settlement transaction hash is invalid');
    }

    if (!isAddress(request.recipient) || request.amountWei <= 0n) {
      throw new SettlementReceiptVerificationError(
        'Settlement verification requires a valid recipient and positive amount'
      );
    }

    const network = process.env.CELO_NETWORK === 'mainnet' ? 'mainnet' : 'sepolia';
    const expectedChain = getActiveCeloChain();
    const expectedSender = this.senderResolver();
    if (!expectedSender || !isAddress(expectedSender)) {
      throw new SettlementReceiptVerificationError(
        'Settlement verification requires a configured trusted sender wallet'
      );
    }

    const expectedToken = this.tokenResolver(network);
    if (!isAddress(expectedToken)) {
      throw new SettlementReceiptVerificationError(
        'Settlement verification requires a valid trusted token contract'
      );
    }

    const client = this.publicClientFactory(network);
    const txHash = request.txHash.trim() as `0x${string}`;
    let chainId: number;
    let receipt: Awaited<ReturnType<PublicClient['getTransactionReceipt']>>;

    try {
      chainId = await client.getChainId();
      receipt = await client.getTransactionReceipt({ hash: txHash });
    } catch (error: unknown) {
      throw new SettlementReceiptVerificationError(
        `Settlement receipt verification unavailable: ${error instanceof Error ? error.message : 'RPC error'}`
      );
    }

    if (chainId !== expectedChain.id) {
      throw new SettlementReceiptVerificationError(
        `Settlement receipt chain mismatch: expected ${expectedChain.id}, received ${chainId}`
      );
    }

    if (receipt.transactionHash.toLowerCase() !== txHash.toLowerCase()) {
      throw new SettlementReceiptVerificationError('Settlement receipt hash does not match the requested hash');
    }

    if (receipt.status !== 'success') {
      throw new SettlementReceiptVerificationError('Settlement transaction receipt is not successful');
    }

    const normalizedSender = getAddress(expectedSender);
    const normalizedRecipient = getAddress(request.recipient);
    const normalizedToken = getAddress(expectedToken);

    if (getAddress(receipt.from) !== normalizedSender) {
      throw new SettlementReceiptVerificationError('Settlement receipt sender does not match the trusted sender');
    }

    if (!receipt.to || getAddress(receipt.to) !== normalizedToken) {
      throw new SettlementReceiptVerificationError(
        'Settlement receipt target is not the trusted cUSD token contract'
      );
    }

    let transferLogs: ReturnType<typeof parseEventLogs<typeof erc20Abi, false, 'Transfer'>>;
    try {
      transferLogs = parseEventLogs({
        abi: erc20Abi,
        eventName: 'Transfer',
        logs: receipt.logs,
        strict: false,
      });
    } catch (error: unknown) {
      throw new SettlementReceiptVerificationError(
        `Settlement Transfer event could not be decoded: ${error instanceof Error ? error.message : 'decode error'}`
      );
    }

    const matchingTransfer = transferLogs.find((log) => {
      const args = log.args as {
        from?: Address;
        to?: Address;
        value?: bigint;
      };

      return (
        getAddress(log.address) === normalizedToken &&
        args.from !== undefined &&
        args.to !== undefined &&
        args.value !== undefined &&
        getAddress(args.from) === normalizedSender &&
        getAddress(args.to) === normalizedRecipient &&
        args.value === request.amountWei
      );
    });

    if (!matchingTransfer) {
      throw new SettlementReceiptVerificationError(
        'Settlement receipt does not contain the expected cUSD Transfer event'
      );
    }

    return {
      txHash,
      chainId,
      blockNumber: receipt.blockNumber,
      sender: normalizedSender,
      recipient: normalizedRecipient,
      tokenAddress: normalizedToken,
      amountWei: request.amountWei,
    };
  }
}
