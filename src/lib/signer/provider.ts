import 'server-only';

import { getAddress, isAddress } from 'viem';
import {
  AgentSigner,
  AgentSignerAuthorizationError,
  AgentSignerProvider,
  AgentSignerRequest,
  AgentSignerUnavailableError,
} from './types';

/**
 * Fail-closed default. Production deployments must inject an HSM/KMS-backed
 * provider at application startup; CeloAgent never reads a global private key.
 */
export class UnconfiguredAgentSignerProvider implements AgentSignerProvider {
  public async resolve(_request: AgentSignerRequest): Promise<AgentSigner> {
    throw new AgentSignerUnavailableError(
      'Agent wallet not configured: inject an HSM/KMS-backed AgentSignerProvider for this agent'
    );
  }
}

/**
 * Test/integration adapter for an already-created server-side signer.
 * It accepts signer objects, never private-key strings, and enforces both the
 * agent ID and the persisted execution-wallet address at resolution time.
 */
export class StaticAgentSignerProvider implements AgentSignerProvider {
  constructor(private readonly signers: ReadonlyMap<string, AgentSigner>) {}

  public async resolve(request: AgentSignerRequest): Promise<AgentSigner> {
    if (!isAddress(request.walletAddress)) {
      throw new AgentSignerAuthorizationError(request.agentId, request.walletAddress, 'invalid-address');
    }
    const signer = this.signers.get(request.agentId);
    if (!signer) {
      throw new AgentSignerUnavailableError(`No signer is registered for agent ${request.agentId}`);
    }
    const expected = getAddress(request.walletAddress);
    const actual = getAddress(signer.address);
    if (signer.agentId !== request.agentId || actual !== expected) {
      throw new AgentSignerAuthorizationError(request.agentId, expected, actual);
    }
    return signer;
  }
}

let configuredProvider: AgentSignerProvider = new UnconfiguredAgentSignerProvider();

export function getAgentSignerProvider(): AgentSignerProvider {
  return configuredProvider;
}

/** Server-only startup hook for wiring a KMS/HSM or smart-account provider. */
export function configureAgentSignerProvider(provider: AgentSignerProvider): void {
  configuredProvider = provider;
}
