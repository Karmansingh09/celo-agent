import {
  ApprovalStatus,
  PendingApproval,
  PendingApprovalNotFoundError,
  PendingApprovalStateError,
  PaymentIdempotencyConflictError,
  isValidPaymentRequestId,
  InvalidPaymentInputError,
} from './types';

/**
 * Phase 8.2: Pending Approval Repository Interface
 * 
 * Defines the contract for persisting, querying, and transitioning
 * pending payment approvals awaiting human authorization.
 */
export interface IPendingApprovalStore {
  /**
   * Persists a new pending approval record.
   * Enforces idempotency key uniqueness scoped per agentId.
   */
  create(approval: PendingApproval): Promise<PendingApproval>;

  /**
   * Retrieves a pending approval record by unique request ID.
   */
  getByRequestId(requestId: string): Promise<PendingApproval | null>;

  /**
   * Looks up a pending approval by scoped agentId and idempotencyKey.
   */
  getByIdempotencyKey(agentId: string, idempotencyKey: string): Promise<PendingApproval | null>;

  /**
   * Lists pending approvals for an agent, optionally filtered by status.
   */
  listByAgentId(agentId: string, status?: ApprovalStatus): Promise<PendingApproval[]>;

  /**
   * Atomically transitions the lifecycle status of a pending approval.
   * Throws PendingApprovalStateError if the approval's current status does not match fromStatus.
   */
  transitionStatus(
    requestId: string,
    fromStatus: ApprovalStatus,
    toStatus: ApprovalStatus,
    patch?: { statusReason?: string; resolvedAt?: number }
  ): Promise<PendingApproval>;

  /**
   * Clears all in-memory approval records. Used primarily for test suite isolation.
   */
  clear(): void;
}

/**
 * In-Memory implementation of IPendingApprovalStore.
 * 
 * ARCHITECTURE & CONCURRENCY GUARANTEES:
 * 1. Single-Process Concurrency Safety:
 *    - All lookups, checks, and Map state transitions execute synchronously within a single
 *      turn of the Node.js event loop without intervening async yields or `await`.
 *    - Two concurrent transition calls for the same requestId cannot both succeed:
 *      the first caller transitions PENDING -> APPROVED; the second caller observes
 *      the updated state and throws PendingApprovalStateError.
 * 2. Process-Local & Non-Durable (LIMITATIONS):
 *    - State is held ephemerally in JavaScript Map collections.
 *    - Data is lost on server restart, crash, or deployment.
 *    - Does NOT provide cross-process locking or persistence.
 *    - Does NOT synchronize across multiple server instances or independent serverless lambdas.
 * 3. Defensive Isolation:
 *    - Every stored approval record is deep-cloned on input and output to prevent external tampering.
 */
export class InMemoryPendingApprovalStore implements IPendingApprovalStore {
  /** Map of approvals keyed by `approval.requestId` */
  private readonly approvals: Map<string, PendingApproval> = new Map();

  /** Map of idempotency keys scoped per agent: `${agentId}:${idempotencyKey}` -> `requestId` */
  private readonly idempotencyMap: Map<string, string> = new Map();

  /**
   * Resets all in-memory records.
   */
  public clear(): void {
    this.approvals.clear();
    this.idempotencyMap.clear();
  }

  /**
   * Deep-clones a PendingApproval record to prevent reference mutation.
   */
  private cloneApproval(item: PendingApproval): PendingApproval {
    return {
      requestId: item.requestId,
      agentId: item.agentId,
      amountCusd: item.amountCusd,
      recipient: item.recipient,
      idempotencyKey: item.idempotencyKey,
      policyId: item.policyId,
      createdAt: item.createdAt,
      validUntil: item.validUntil,
      status: item.status,
      statusReason: item.statusReason,
      resolvedAt: item.resolvedAt,
    };
  }

  /**
   * Constructs the composite index key for scoping idempotency to an agent.
   */
  private getIdempotencyCompositeKey(agentId: string, idempotencyKey: string): string {
    return `${agentId}:${idempotencyKey}`;
  }

  public async create(approval: PendingApproval): Promise<PendingApproval> {
    if (!approval || typeof approval !== 'object' || Array.isArray(approval)) {
      throw new InvalidPaymentInputError('Pending approval must be a valid non-null object');
    }

    if (!isValidPaymentRequestId(approval.requestId)) {
      throw new InvalidPaymentInputError(`Invalid requestId format: ${approval.requestId}`);
    }

    if (this.approvals.has(approval.requestId)) {
      throw new InvalidPaymentInputError(`Pending approval already exists with ID: ${approval.requestId}`);
    }

    const idempKey = this.getIdempotencyCompositeKey(approval.agentId, approval.idempotencyKey);
    const existingRequestId = this.idempotencyMap.get(idempKey);

    if (existingRequestId) {
      const existing = this.approvals.get(existingRequestId);
      if (existing) {
        const matches =
          existing.amountCusd === approval.amountCusd &&
          existing.recipient.trim().toLowerCase() === approval.recipient.trim().toLowerCase() &&
          existing.policyId === approval.policyId;

        if (!matches) {
          throw new PaymentIdempotencyConflictError(
            approval.idempotencyKey,
            `Idempotency key "${approval.idempotencyKey}" already has a pending approval with conflicting parameters`
          );
        }

        // Return existing clone if exact match
        return this.cloneApproval(existing);
      }
    }

    const stored = this.cloneApproval(approval);
    this.approvals.set(approval.requestId, stored);
    this.idempotencyMap.set(idempKey, approval.requestId);

    return this.cloneApproval(stored);
  }

  public async getByRequestId(requestId: string): Promise<PendingApproval | null> {
    if (typeof requestId !== 'string' || requestId.trim() === '') {
      return null;
    }
    const item = this.approvals.get(requestId.trim());
    return item ? this.cloneApproval(item) : null;
  }

  public async getByIdempotencyKey(
    agentId: string,
    idempotencyKey: string
  ): Promise<PendingApproval | null> {
    const key = this.getIdempotencyCompositeKey(agentId, idempotencyKey);
    const requestId = this.idempotencyMap.get(key);
    if (!requestId) {
      return null;
    }
    const item = this.approvals.get(requestId);
    return item ? this.cloneApproval(item) : null;
  }

  public async listByAgentId(
    agentId: string,
    status?: ApprovalStatus
  ): Promise<PendingApproval[]> {
    const results: PendingApproval[] = [];
    for (const item of this.approvals.values()) {
      if (item.agentId === agentId) {
        if (status === undefined || item.status === status) {
          results.push(this.cloneApproval(item));
        }
      }
    }
    return results.sort((a, b) => b.createdAt - a.createdAt);
  }

  public async transitionStatus(
    requestId: string,
    fromStatus: ApprovalStatus,
    toStatus: ApprovalStatus,
    patch?: { statusReason?: string; resolvedAt?: number }
  ): Promise<PendingApproval> {
    const existing = this.approvals.get(requestId);
    if (!existing) {
      throw new PendingApprovalNotFoundError(requestId);
    }

    if (existing.status !== fromStatus) {
      throw new PendingApprovalStateError(
        requestId,
        existing.status,
        `Cannot transition approval ${requestId} to ${toStatus}: current status is ${existing.status}, expected ${fromStatus}`
      );
    }

    existing.status = toStatus;
    if (patch?.statusReason !== undefined) {
      existing.statusReason = patch.statusReason;
    }
    if (patch?.resolvedAt !== undefined) {
      existing.resolvedAt = patch.resolvedAt;
    }

    return this.cloneApproval(existing);
  }
}
