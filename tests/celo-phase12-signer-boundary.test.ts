import { describe, expect, it, vi } from 'vitest';
import { privateKeyToAccount } from 'viem/accounts';
import { AgentSigner, AgentSignerAuthorizationError, StaticAgentSignerProvider, UnconfiguredAgentSignerProvider } from '../src/lib/signer';
import { CeloPaymentExecutor } from '../src/lib/payment/execution';

describe('Phase 12: agent-specific signer boundary', () => {
  const agentId = 'agent_abc12345';
  const account = privateKeyToAccount(`0x${'1'.repeat(64)}`);
  const otherAccount = privateKeyToAccount(`0x${'2'.repeat(64)}`);

  function signerFor(id: string, address = account.address): AgentSigner {
    return {
      agentId: id,
      address,
      account,
      getWalletClient: vi.fn(() => ({}) as never),
    };
  }

  it('fails closed when no external signer provider is configured', async () => {
    await expect(new UnconfiguredAgentSignerProvider().resolve({ agentId, walletAddress: account.address }))
      .rejects.toThrow('inject an HSM/KMS-backed AgentSignerProvider');
  });

  it('binds a signer to both agent identity and persisted wallet address', async () => {
    const provider = new StaticAgentSignerProvider(new Map([[agentId, signerFor(agentId)]]));
    await expect(provider.resolve({ agentId, walletAddress: account.address })).resolves.toMatchObject({ agentId, address: account.address });
    await expect(provider.resolve({ agentId: 'agent_other1', walletAddress: account.address }))
      .rejects.toThrow('No signer is registered');
    await expect(provider.resolve({ agentId, walletAddress: otherAccount.address }))
      .rejects.toBeInstanceOf(AgentSignerAuthorizationError);
  });

  it('does not allow the controlled native executor to use a global wallet key', async () => {
    const provider = new UnconfiguredAgentSignerProvider();
    const executor = new CeloPaymentExecutor(provider);
    const result = await executor.execute({
      reservationId: 'res_signer_1',
      agentId,
      recipient: otherAccount.address,
      asset: { kind: 'NATIVE_CELO', network: 'sepolia' },
      amount: '0.01',
    });
    expect(result.status).toBe('FAILED');
    expect(result.error).toContain('execution wallet is not bound');
  });
});
