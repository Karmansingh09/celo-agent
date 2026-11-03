/**
 * Data passed to the settlement verification boundary.
 *
 * These values come from the server-owned reservation, except for txHash,
 * which must match the hash recorded when the transaction was submitted.
 */
export interface SettlementVerificationRequest {
  txHash: string;
  amountWei: bigint;
  recipient: string;
}

/**
 * Evidence returned only after an independent receipt verifier has checked
 * the configured chain, receipt, transaction identity, and token transfer.
 */
export interface VerifiedSettlementEvidence {
  txHash: `0x${string}`;
  chainId: number;
  blockNumber: bigint;
  sender: `0x${string}`;
  recipient: `0x${string}`;
  tokenAddress: `0x${string}`;
  amountWei: bigint;
}

/** Receipt verification boundary used before budget commitment. */
export interface SettlementReceiptVerifier {
  verify(request: SettlementVerificationRequest): Promise<VerifiedSettlementEvidence>;
}
