import 'server-only';
import { isAddress, parseEther, formatEther } from 'viem';
import { getMaxPaymentLimit, getExplorerTxUrl } from './config';
import { getPublicClient } from './public-client';
import { getAgentAccount, isAgentConfigured } from './account';
import { getAgentWalletClient } from './wallet-client';

export interface PaymentRequest {
  to: string;
  amountCelo: string;
  purpose?: string;
  idempotencyKey?: string;
}

export interface PaymentResult {
  success: boolean;
  txHash?: string;
  status: 'confirmed' | 'failed';
  amountCelo?: string;
  to?: string;
  purpose?: string;
  explorerUrl?: string;
  error?: string;
}

export interface ValidationResult {
  valid: boolean;
  recipient?: `0x${string}`;
  amountWei?: bigint;
  error?: string;
}

/**
 * Validates a PaymentRequest strictly before execution.
 *
 * Checks:
 * 1. Non-empty, valid EVM recipient address (viem isAddress)
 * 2. Positive non-zero decimal amount string (viem parseEther)
 * 3. Spending policy limit check (CELO_MAX_PAYMENT)
 *
 * @param request PaymentRequest input
 * @returns ValidationResult
 */
export function validatePaymentRequest(request: PaymentRequest): ValidationResult {
  if (!request || typeof request !== 'object') {
    return { valid: false, error: 'Invalid payment request payload' };
  }

  // 1. Recipient Validation
  const rawTo = request.to?.trim();
  if (!rawTo) {
    return { valid: false, error: 'Recipient address is required' };
  }
  if (!isAddress(rawTo)) {
    return { valid: false, error: 'Invalid EVM recipient address format' };
  }

  // 2. Amount Validation
  const rawAmount = request.amountCelo?.trim();
  if (!rawAmount) {
    return { valid: false, error: 'Payment amount is required' };
  }

  // Reject malformed or non-numeric strings
  if (!/^\d+(\.\d+)?$/.test(rawAmount)) {
    return { valid: false, error: 'Invalid amount format. Must be a positive decimal string.' };
  }

  const numVal = Number(rawAmount);
  if (isNaN(numVal) || !isFinite(numVal) || numVal <= 0) {
    return { valid: false, error: 'Payment amount must be greater than 0' };
  }

  let amountWei: bigint;
  try {
    amountWei = parseEther(rawAmount);
  } catch {
    return { valid: false, error: 'Failed to parse payment amount to Wei' };
  }

  if (amountWei <= 0n) {
    return { valid: false, error: 'Payment amount must be greater than 0' };
  }

  // 3. Spending Policy Check (CELO_MAX_PAYMENT)
  const maxLimitStr = getMaxPaymentLimit();
  let maxLimitWei: bigint;
  try {
    maxLimitWei = parseEther(maxLimitStr);
  } catch {
    maxLimitWei = parseEther('0.01'); // Safe fallback
  }

  if (amountWei > maxLimitWei) {
    return {
      valid: false,
      error: `Payment amount (${rawAmount} CELO) exceeds configured spending limit of ${maxLimitStr} CELO`,
    };
  }

  return {
    valid: true,
    recipient: rawTo as `0x${string}`,
    amountWei,
  };
}

/**
 * Server-only execution function for native CELO transactions on Celo Sepolia.
 *
 * Enforces:
 * - Recipient & amount validation
 * - Spending limit policy
 * - Agent wallet configuration check
 * - Balance & gas buffer check
 * - Server-side transaction signing via viem
 * - Confirmation receipt wait
 *
 * @param request PaymentRequest
 * @param network Optional network override ('sepolia' | 'mainnet')
 * @returns PaymentResult
 */
export async function executePayment(
  request: PaymentRequest,
  network?: string
): Promise<PaymentResult> {
  // 1. Validate request payload and policy
  const validation = validatePaymentRequest(request);
  if (!validation.valid || !validation.recipient || !validation.amountWei) {
    return {
      success: false,
      status: 'failed',
      error: validation.error || 'Payment request validation failed',
    };
  }

  // 2. Resolve Agent Account
  if (!isAgentConfigured()) {
    return {
      success: false,
      status: 'failed',
      error: 'Agent wallet not configured. Please set AGENT_PRIVATE_KEY in environment variables.',
    };
  }

  const account = getAgentAccount();
  if (!account) {
    return {
      success: false,
      status: 'failed',
      error: 'Failed to resolve agent account from private key',
    };
  }

  const walletClient = getAgentWalletClient(network);
  if (!walletClient) {
    return {
      success: false,
      status: 'failed',
      error: 'Failed to initialize agent wallet client',
    };
  }

  const publicClient = getPublicClient(network);

  try {
    // 3. Check agent balance & gas buffer
    const balanceWei = await publicClient.getBalance({ address: account.address });
    const gasPriceWei = await publicClient.getGasPrice();
    const estimatedGasLimit = 21000n; // Standard native transfer gas limit
    const estimatedGasWei = gasPriceWei * estimatedGasLimit;
    const requiredTotalWei = validation.amountWei + estimatedGasWei;

    if (balanceWei < requiredTotalWei) {
      const balanceCelo = formatEther(balanceWei);
      const requiredCelo = formatEther(requiredTotalWei);
      return {
        success: false,
        status: 'failed',
        error: `Insufficient agent wallet balance. Current: ${balanceCelo} CELO, Required (including gas): ${requiredCelo} CELO`,
      };
    }

    // 4. Execute Transaction on-chain (Native CELO transfer)
    const txHash = await walletClient.sendTransaction({
      account,
      to: validation.recipient,
      value: validation.amountWei,
      chain: walletClient.chain || undefined,
    });

    // 5. Wait for block confirmation receipt
    const receipt = await publicClient.waitForTransactionReceipt({
      hash: txHash,
      confirmations: 1,
    });

    const isSuccess = receipt.status === 'success';

    return {
      success: isSuccess,
      txHash: receipt.transactionHash,
      status: isSuccess ? 'confirmed' : 'failed',
      amountCelo: request.amountCelo,
      to: validation.recipient,
      purpose: request.purpose,
      explorerUrl: getExplorerTxUrl(receipt.transactionHash, network),
      ...(isSuccess ? {} : { error: 'Transaction executed but reverted on-chain' }),
    };
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : 'Blockchain transaction execution failed';
    return {
      success: false,
      status: 'failed',
      error: errorMessage,
    };
  }
}
