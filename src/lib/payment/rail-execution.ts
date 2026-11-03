import 'server-only';

import { IPaymentExecutor, PaymentExecutionRequest, PaymentExecutionResult } from './execution-types';
import { CeloCusdPaymentExecutor } from './cusd-execution';
import { CeloPaymentExecutor } from './execution';

/** Routes each asset to its explicit, non-converting Celo execution rail. */
export class CeloPaymentRailExecutor implements IPaymentExecutor {
  constructor(
    private readonly nativeExecutor: IPaymentExecutor = new CeloPaymentExecutor(),
    private readonly cusdExecutor: IPaymentExecutor = new CeloCusdPaymentExecutor()
  ) {}

  public execute(request: PaymentExecutionRequest): Promise<PaymentExecutionResult> {
    if (request.asset.kind === 'NATIVE_CELO') {
      return this.nativeExecutor.execute(request);
    }
    return this.cusdExecutor.execute(request);
  }
}
