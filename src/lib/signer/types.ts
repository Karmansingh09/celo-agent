import 'server-only';

import { Account } from 'viem/accounts';
import { Address, WalletClient } from 'viem';

export interface AgentSignerRequest {
  agentId: string;
  walletAddress: string;
}

/**
 * A signer returned by an approved server-side signer integration.
 * `account` may be a viem local account, smart-account adapter, or KMS-backed
 * custom account. Private key material is intentionally absent from this type.
 */
export interface AgentSigner {
  readonly agentId: string;
  readonly address: Address;
  readonly account: Account;
  getWalletClient(network: 'sepolia' | 'mainnet'): WalletClient;
}

export interface AgentSignerProvider {
  resolve(request: AgentSignerRequest): Promise<AgentSigner>;
}

export class AgentSignerUnavailableError extends Error {
  constructor(message = 'Agent wallet not configured: no approved server-side signer is available') {
    super(message);
    this.name = 'AgentSignerUnavailableError';
  }
}

export class AgentSignerAuthorizationError extends Error {
  constructor(agentId: string, expected: string, actual: string) {
    super(`Signer address ${actual} is not authorized for agent ${agentId}; expected ${expected}`);
    this.name = 'AgentSignerAuthorizationError';
  }
}
