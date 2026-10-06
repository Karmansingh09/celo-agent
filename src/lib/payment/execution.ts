import 'server-only';
import { executePayment } from '../celo/payment';
import {
  IPaymentExecutor,
  PaymentExecutionRequest,
  PaymentExecutionResult,
  AssetMismatchError,
} from './execution-types';

/**
 * Phase 8.3: Celo Payment Rail Adapter
 * 
 * Concrete adapter implementing the IPaymentExecutor boundary on top of the
 * existing `executePayment` Celo Sepolia execution rail.
 * 
 * ASSET INTEGRITY:
 * - This executor ONLY handles `NATIVE_CELO` assets.
 * - If called with an unsupported asset kind (such as `CUSD_ERC20`), it throws `AssetMismatchError`.
 * - No implicit conversion is performed.
 * 
 * EXECUTION OUTCOMES:
 * - When `executePayment` succeeds (or broadcasts), returns status 'SUBMITTED' with txHash.
 * - When `executePayment` encounters a deterministic failure before confirmation or broadcast, returns 'FAILED'.
 * - If an ambiguous timeout or unknown error occurs, returns 'UNCERTAIN'.
 */
export class CeloPaymentExecutor implements IPaymentExecutor {
  public async execute(request: PaymentExecutionRequest): Promise<PaymentExecutionResult> {
    // 1. Verify asset kind
    if (request.asset.kind !== 'NATIVE_CELO') {
      throw new AssetMismatchError(
        `CeloPaymentExecutor only supports NATIVE_CELO execution, received: ${request.asset.kind}`
      );
    }

    try {
      const celoResult = await executePayment(
        {
          to: request.recipient,
          amountCelo: request.amount,
          purpose: request.purpose,
          idempotencyKey: request.idempotencyKey,
        },
        request.asset.network
      );

      if (celoResult.success && celoResult.txHash) {
        return {
          success: true,
          status: 'SUBMITTED',
          txHash: celoResult.txHash,
          explorerUrl: celoResult.explorerUrl,
        };
      }

      // Check if failure indicates an uncertain outcome (e.g. timeout during wait)
      const errorMsg = celoResult.error || 'Payment execution failed';
      const isUncertain =
        errorMsg.toLowerCase().includes('timeout') ||
        errorMsg.toLowerCase().includes('network') ||
        errorMsg.toLowerCase().includes('timed out');

      return {
        success: false,
        status: isUncertain ? 'UNCERTAIN' : 'FAILED',
        txHash: celoResult.txHash,
        error: errorMsg,
        explorerUrl: celoResult.explorerUrl,
      };
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : 'Unknown execution exception';
      const isUncertain =
        errorMsg.toLowerCase().includes('timeout') ||
        errorMsg.toLowerCase().includes('network') ||
        errorMsg.toLowerCase().includes('timed out');

      return {
        success: false,
        status: isUncertain ? 'UNCERTAIN' : 'FAILED',
        error: errorMsg,
      };
    }
  }
}
