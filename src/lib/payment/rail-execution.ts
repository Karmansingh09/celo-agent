import 'server-only';

import { IPaymentExecutor, PaymentExecutionRequest, PaymentExecutionResult } from './execution-types';
import { CeloCusdPaymentExecutor } from './cusd-execution';
import { CeloPaymentExecutor } from './execution';
import { AgentSignerProvider, getAgentSignerProvider } from '../signer';

/** Routes each asset to its explicit, non-converting Celo execution rail. */
export class CeloPaymentRailExecutor implements IPaymentExecutor {
  constructor(
    private readonly nativeExecutor: IPaymentExecutor,
    private readonly cusdExecutor: IPaymentExecutor
  ) {}

  public static withSignerProvider(provider: AgentSignerProvider = getAgentSignerProvider()): CeloPaymentRailExecutor {
    return new CeloPaymentRailExecutor(
      new CeloPaymentExecutor(provider),
      new CeloCusdPaymentExecutor({ signerProvider: provider })
    );
  }

  public execute(request: PaymentExecutionRequest): Promise<PaymentExecutionResult> {
    if (request.asset.kind === 'NATIVE_CELO') {
      return this.nativeExecutor.execute(request);
    }
    return this.cusdExecutor.execute(request);
  }
}
