import { Hex, isHex } from 'viem';
import { getPublicClient } from './public-client';

export type TransactionStatus = 'pending' | 'confirmed' | 'failed' | 'not_found';

export interface TransactionDetails {
  hash: string;
  status: TransactionStatus;
  blockNumber: string | null;
  from: string | null;
  to: string | null;
  value: string | null;
  confirmations?: number;
  error?: string;
}

/**
 * Validates whether a transaction hash string is a valid EVM hex hash.
 *
 * @param hash Hash string to validate
 * @returns boolean
 */
export function isValidTxHash(hash: string): hash is Hex {
  if (!hash || typeof hash !== 'string') return false;
  const trimmed = hash.trim();
  return trimmed.startsWith('0x') && trimmed.length === 66 && isHex(trimmed);
}

/**
 * Retrieves details for a given transaction hash from Celo blockchain.
 *
 * @param hash Hex transaction hash
 * @param network Optional network override
 * @returns TransactionDetails object
 */
export async function getTransaction(
  hash: string,
  network?: string
): Promise<TransactionDetails> {
  if (!isValidTxHash(hash)) {
    return {
      hash,
      status: 'not_found',
      blockNumber: null,
      from: null,
      to: null,
      value: null,
      error: 'Invalid transaction hash format',
    };
  }

  try {
    const client = getPublicClient(network);
    const tx = await client.getTransaction({ hash });

    if (!tx) {
      return {
        hash,
        status: 'not_found',
        blockNumber: null,
        from: null,
        to: null,
        value: null,
      };
    }

    const isConfirmed = tx.blockNumber !== null;
    return {
      hash: tx.hash,
      status: isConfirmed ? 'confirmed' : 'pending',
      blockNumber: tx.blockNumber ? tx.blockNumber.toString() : null,
      from: tx.from,
      to: tx.to,
      value: tx.value.toString(),
    };
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : 'Error fetching transaction details';
    return {
      hash,
      status: 'not_found',
      blockNumber: null,
      from: null,
      to: null,
      value: null,
      error: errorMessage,
    };
  }
}

/**
 * Waits for a pending transaction to be confirmed on Celo blockchain.
 *
 * @param hash Hex transaction hash
 * @param confirmations Number of block confirmations to wait for (default: 1)
 * @param network Optional network override
 * @returns TransactionDetails object upon receipt confirmation
 */
export async function waitForTransaction(
  hash: string,
  confirmations: number = 1,
  network?: string
): Promise<TransactionDetails> {
  if (!isValidTxHash(hash)) {
    return {
      hash,
      status: 'failed',
      blockNumber: null,
      from: null,
      to: null,
      value: null,
      error: 'Invalid transaction hash format',
    };
  }

  try {
    const client = getPublicClient(network);
    const receipt = await client.waitForTransactionReceipt({
      hash,
      confirmations,
    });

    const isSuccess = receipt.status === 'success';

    return {
      hash: receipt.transactionHash,
      status: isSuccess ? 'confirmed' : 'failed',
      blockNumber: receipt.blockNumber.toString(),
      from: receipt.from,
      to: receipt.to,
      value: null,
    };
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : 'Transaction wait failed or timed out';
    return {
      hash,
      status: 'failed',
      blockNumber: null,
      from: null,
      to: null,
      value: null,
      error: errorMessage,
    };
  }
}
