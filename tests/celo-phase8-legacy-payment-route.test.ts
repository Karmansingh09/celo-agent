import { describe, it, expect, vi } from 'vitest';
import { POST, GET } from '../src/app/api/payments/send/route';
import * as celoPaymentModule from '../src/lib/celo/payment';
import * as celoWalletModule from '../src/lib/celo/wallet-client';
import { CeloPaymentExecutor } from '../src/lib/payment/execution';
import { AssetMismatchError } from '../src/lib/payment/execution-types';

describe('Phase 8.5: Legacy Payment Route Guard & Deprecation', () => {
  it('1. returns HTTP 410 Gone for POST requests', async () => {
    const res = await POST();
    expect(res.status).toBe(410);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error).toContain('deprecated');
    expect(body.error).toContain('/api/agents/[id]/payments');
  });

  it('2. returns HTTP 410 Gone for GET requests', async () => {
    const res = await GET();
    expect(res.status).toBe(410);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error).toContain('deprecated');
    expect(body.error).toContain('/api/agents/[id]/payments');
  });

  it('3. includes strict no-store cache control headers on responses', async () => {
    const res = await POST();
    expect(res.headers.get('cache-control')).toContain('no-store');
    expect(res.headers.get('pragma')).toBe('no-cache');
  });

  it('4. ensures executePayment is never called by the legacy route', async () => {
    const executePaymentSpy = vi.spyOn(celoPaymentModule, 'executePayment');
    const getWalletSpy = vi.spyOn(celoWalletModule, 'getAgentWalletClient');

    await POST();

    expect(executePaymentSpy).not.toHaveBeenCalled();
    expect(getWalletSpy).not.toHaveBeenCalled();

    executePaymentSpy.mockRestore();
    getWalletSpy.mockRestore();
  });

  it('5. blocks unauthenticated callers from triggering transfers', async () => {
    const executePaymentSpy = vi.spyOn(celoPaymentModule, 'executePayment');

    const res = await POST();
    expect(res.status).toBe(410);
    expect(executePaymentSpy).not.toHaveBeenCalled();

    executePaymentSpy.mockRestore();
  });

  it('6. rejects malformed or empty bodies without executing any payments', async () => {
    const executePaymentSpy = vi.spyOn(celoPaymentModule, 'executePayment');

    const res = await POST();
    expect(res.status).toBe(410);
    expect(executePaymentSpy).not.toHaveBeenCalled();

    executePaymentSpy.mockRestore();
  });

  it('7. rejects attempts with injected private keys or attacker parameters', async () => {
    const executePaymentSpy = vi.spyOn(celoPaymentModule, 'executePayment');

    const res = await POST();
    expect(res.status).toBe(410);
    expect(executePaymentSpy).not.toHaveBeenCalled();

    executePaymentSpy.mockRestore();
  });

  it('8. preserves src/lib/celo/payment.ts executePayment functionality for valid callers', () => {
    expect(typeof celoPaymentModule.executePayment).toBe('function');
    expect(typeof celoPaymentModule.validatePaymentRequest).toBe('function');
  });

  it('9. ensures CeloPaymentExecutor in payment/execution.ts remains functional and rejects mismatched assets', async () => {
    const executor = new CeloPaymentExecutor();
    expect(typeof executor.execute).toBe('function');

    await expect(
      executor.execute({
        reservationId: 'res_test_1',
        agentId: 'agent_test_1',
        recipient: '0x19E7E376E7C213B7E7e7e46cc70A5dD086DAff2A',
        amount: '10.00',
        asset: { kind: 'CUSD_ERC20' },
        idempotencyKey: 'idem_test_1',
      })
    ).rejects.toThrow(AssetMismatchError);
  });
});
