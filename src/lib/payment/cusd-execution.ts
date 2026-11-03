import 'server-only';

import {
  Address,
  erc20Abi,
  getAddress,
  isAddress,
  parseUnits,
  PublicClient,
  WalletClient,
} from 'viem';
import { getCusdTokenAddress, getExplorerTxUrl, getCeloChain, resolveCeloNetwork } from '../celo/config';
import { getPublicClient } from '../celo/public-client';
import { CeloSettlementReceiptVerifier } from '../celo/settlement-verifier';
import { Account } from 'viem/accounts';
import { AgentSignerProvider, getAgentSignerProvider } from '../signer';
import {
  AssetMismatchError,
  IPaymentExecutor,
  PaymentExecutionRequest,
  PaymentExecutionResult,
} from './execution-types';

export const CUSD_DECIMALS = 18;

export type CusdPublicClientFactory = (network: 'sepolia') => PublicClient;
export type CusdWalletClientFactory = (network: 'sepolia') => WalletClient | null;
export type CusdAccountResolver = () => Account | null;
export type CusdTokenResolver = (network: 'sepolia') => `0x${string}`;

export interface CusdExecutionDependencies {
  publicClientFactory?: CusdPublicClientFactory;
  walletClientFactory?: CusdWalletClientFactory;
  accountResolver?: CusdAccountResolver;
  tokenResolver?: CusdTokenResolver;
  signerProvider?: AgentSignerProvider;
}

function isUncertainError(error: unknown): boolean {
  const message = error instanceof Error ? error.message.toLowerCase() : '';
  return (
    message.includes('timeout') ||
    message.includes('timed out') ||
    message.includes('network') ||
    message.includes('transport') ||
    message.includes('connection')
  );
}

/**
 * Executes the authorized cUSD ERC-20 transfer rail on Celo Sepolia.
 *
 * The executor performs all preflight checks before signing, then retains the
 * transaction hash for every post-broadcast outcome. A successful receipt is
 * independently checked for the exact cUSD Transfer event before SUBMITTED is
 * returned to the reservation lifecycle.
 */
export class CeloCusdPaymentExecutor implements IPaymentExecutor {
  private readonly publicClientFactory: CusdPublicClientFactory;
  private readonly walletClientFactory?: CusdWalletClientFactory;
  private readonly accountResolver?: CusdAccountResolver;
  private readonly tokenResolver: CusdTokenResolver;
  private readonly signerProvider: AgentSignerProvider;

  constructor(dependencies: CusdExecutionDependencies = {}) {
    this.publicClientFactory = dependencies.publicClientFactory || (() => getPublicClient('sepolia'));
    this.walletClientFactory = dependencies.walletClientFactory;
    this.accountResolver = dependencies.accountResolver;
    this.tokenResolver = dependencies.tokenResolver || (() => getCusdTokenAddress('sepolia'));
    this.signerProvider = dependencies.signerProvider || getAgentSignerProvider();
  }

  public async execute(request: PaymentExecutionRequest): Promise<PaymentExecutionResult> {
    if (request.asset.kind !== 'CUSD_ERC20') {
      throw new AssetMismatchError(
        `CeloCusdPaymentExecutor only supports CUSD_ERC20 execution, received: ${request.asset.kind}`
      );
    }

    let network: 'sepolia';
    try {
      if (resolveCeloNetwork(request.asset.network) !== 'sepolia') {
        throw new AssetMismatchError('Real cUSD execution is currently supported only on Celo Sepolia');
      }
      network = 'sepolia';
    } catch (error: unknown) {
      if (error instanceof AssetMismatchError) throw error;
      return {
        success: false,
        status: 'FAILED',
        error: error instanceof Error ? error.message : 'Unsupported Celo network',
      };
    }

    if (!isAddress(request.recipient)) {
      return { success: false, status: 'FAILED', error: 'Invalid cUSD recipient address' };
    }

    let amountWei: bigint;
    try {
      if (!/^\d+(\.\d+)?$/.test(request.amount.trim())) {
        throw new Error('cUSD amount must be a positive decimal string');
      }
      amountWei = parseUnits(request.amount.trim(), CUSD_DECIMALS);
      if (amountWei <= 0n) throw new Error('cUSD amount must be greater than zero');
    } catch (error: unknown) {
      return {
        success: false,
        status: 'FAILED',
        error: error instanceof Error ? error.message : 'Invalid cUSD amount',
      };
    }

    let account: Account | null = null;
    let walletClient: WalletClient | null = null;
    try {
      if (this.accountResolver && this.walletClientFactory) {
        account = this.accountResolver();
        walletClient = this.walletClientFactory(network);
      } else {
        if (!request.executionWalletAddress) {
          return {
            success: false,
            status: 'FAILED',
            error: 'Agent wallet not configured: execution wallet is not bound to this agent',
          };
        }
        const signer = await this.signerProvider.resolve({
          agentId: request.agentId,
          walletAddress: request.executionWalletAddress,
        });
        account = signer.account;
        walletClient = signer.getWalletClient(network);
      }
    } catch (error: unknown) {
      return {
        success: false,
        status: 'FAILED',
        error: error instanceof Error ? error.message : 'Agent signer is unavailable',
      };
    }
    if (!account) return { success: false, status: 'FAILED', error: 'Agent signer is not configured' };
    if (!walletClient) return { success: false, status: 'FAILED', error: 'Agent wallet client is unavailable' };

    let tokenAddress: `0x${string}`;
    try {
      tokenAddress = getAddress(this.tokenResolver(network));
    } catch (error: unknown) {
      return {
        success: false,
        status: 'FAILED',
        error: error instanceof Error ? error.message : 'cUSD token configuration is invalid',
      };
    }

    const publicClient = this.publicClientFactory(network);
    const recipient = getAddress(request.recipient) as Address;
    const sender = getAddress(account.address) as Address;

    // All checks before writeContract are pre-broadcast and safe to release.
    try {
      const decimals = await publicClient.readContract({
        address: tokenAddress,
        abi: erc20Abi,
        functionName: 'decimals',
      });
      if (decimals !== CUSD_DECIMALS) {
        return {
          success: false,
          status: 'FAILED',
          error: `Configured cUSD token must use ${CUSD_DECIMALS} decimals; received ${decimals}`,
        };
      }

      const tokenBalance = await publicClient.readContract({
        address: tokenAddress,
        abi: erc20Abi,
        functionName: 'balanceOf',
        args: [sender],
      });
      if (tokenBalance < amountWei) {
        return {
          success: false,
          status: 'FAILED',
          error: `Insufficient cUSD balance. Current: ${tokenBalance.toString()} base units, required: ${amountWei.toString()}`,
        };
      }

      const gasEstimate = await publicClient.estimateContractGas({
        address: tokenAddress,
        abi: erc20Abi,
        functionName: 'transfer',
        args: [recipient, amountWei],
        account: sender,
      });
      const gasLimit = (gasEstimate * 120n) / 100n;
      const gasPrice = await publicClient.getGasPrice();
      const requiredNativeBalance = gasLimit * gasPrice;
      const nativeBalance = await publicClient.getBalance({ address: sender });
      if (nativeBalance < requiredNativeBalance) {
        return {
          success: false,
          status: 'FAILED',
          error: `Insufficient CELO for gas. Current: ${nativeBalance.toString()} wei, required: ${requiredNativeBalance.toString()} wei`,
        };
      }

      // estimateContractGas is the preflight revert check; this write is the
      // only signing/broadcast operation in the executor.
      let txHash: `0x${string}`;
      try {
        txHash = await walletClient.writeContract({
          account,
          chain: getCeloChain(network),
          address: tokenAddress,
          abi: erc20Abi,
          functionName: 'transfer',
          args: [recipient, amountWei],
          gas: gasLimit,
        });
      } catch (error: unknown) {
        // A wallet/RPC error after signing may mean the node accepted the
        // transaction but failed to return the hash. Preserve the reservation.
        return {
          success: false,
          status: 'UNCERTAIN',
          error: error instanceof Error ? error.message : 'cUSD broadcast outcome is uncertain',
        };
      }

      try {
        const receipt = await publicClient.waitForTransactionReceipt({
          hash: txHash,
          confirmations: 1,
        });

        if (receipt.status !== 'success') {
          return {
            success: false,
            status: 'FAILED',
            txHash,
            error: 'cUSD transaction reverted on-chain',
            explorerUrl: getExplorerTxUrl(txHash, network),
          };
        }

        const verifier = new CeloSettlementReceiptVerifier(
          () => publicClient,
          () => account.address,
          () => tokenAddress
        );
        await verifier.verify({
          txHash,
          amountWei,
          recipient,
        });

        return {
          success: true,
          status: 'SUBMITTED',
          txHash,
          explorerUrl: getExplorerTxUrl(txHash, network),
        };
      } catch (error: unknown) {
        return {
          success: false,
          status: 'UNCERTAIN',
          txHash,
          error: error instanceof Error ? error.message : 'cUSD settlement outcome is uncertain',
          explorerUrl: getExplorerTxUrl(txHash, network),
        };
      }
    } catch (error: unknown) {
      return {
        success: false,
        status: isUncertainError(error) ? 'UNCERTAIN' : 'FAILED',
        error: error instanceof Error ? error.message : 'cUSD preflight failed',
      };
    }
  }
}
