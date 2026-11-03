import {
  SettlementReceiptVerifier,
  SettlementVerificationRequest,
} from '../../src/lib/policy/settlement-types';

/** Test-only verifier used by policy/payment unit tests without RPC calls. */
export function createTestSettlementVerifier(): SettlementReceiptVerifier {
  return {
    verify: async (request: SettlementVerificationRequest) => ({
      txHash: request.txHash as `0x${string}`,
      chainId: 11142220,
      blockNumber: 1n,
      sender: '0x1111111111111111111111111111111111111111',
      recipient: request.recipient as `0x${string}`,
      tokenAddress: '0x2222222222222222222222222222222222222222',
      amountWei: request.amountWei,
    }),
  };
}
