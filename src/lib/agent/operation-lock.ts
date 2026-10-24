/**
 * Process-local per-agent operation lock.
 *
 * This coordinates lifecycle, approval, payment-request, and rejection
 * operations that share the in-memory stores. It is intentionally not a
 * cross-process or durable locking mechanism; production deployments need
 * conditional database state transitions instead.
 */
const agentOperationTails = new Map<string, Promise<void>>();

/**
 * Returns the canonical in-process lock key for an agent operation.
 * Agent IDs are case-sensitive domain identifiers, but surrounding whitespace
 * is not significant at the service/API boundary.
 */
export function normalizeAgentOperationKey(agentId: unknown): string {
  if (typeof agentId !== 'string') {
    return '__invalid__';
  }

  const normalized = agentId.trim();
  return normalized.length > 0 ? normalized : '__invalid__';
}

export async function withAgentOperationLock<T>(
  agentId: unknown,
  operation: () => Promise<T>
): Promise<T> {
  const lockKey = normalizeAgentOperationKey(agentId);
  const previous = agentOperationTails.get(lockKey) || Promise.resolve();
  let release!: () => void;
  const current = new Promise<void>((resolve) => {
    release = resolve;
  });

  agentOperationTails.set(lockKey, current);
  await previous;

  try {
    return await operation();
  } finally {
    release();
    if (agentOperationTails.get(lockKey) === current) {
      agentOperationTails.delete(lockKey);
    }
  }
}
