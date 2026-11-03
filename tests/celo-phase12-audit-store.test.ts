import { describe, expect, it } from 'vitest';
import { InMemoryAuditEventStore } from '../src/lib/audit';

describe('Phase 12: audit event ledger', () => {
  it('stores structured events and returns defensive copies', async () => {
    const store = new InMemoryAuditEventStore();
    const event = await store.append({
      eventType: 'TRANSACTION_BROADCAST',
      agentId: 'agent_abc12345',
      txHash: `0x${'a'.repeat(64)}`,
      details: { asset: 'CUSD_ERC20' },
      createdAt: 1,
    });
    event.details.asset = 'tampered';
    const listed = await store.list({ agentId: 'agent_abc12345' });
    expect(listed).toHaveLength(1);
    expect(listed[0].details.asset).toBe('CUSD_ERC20');
  });
});
