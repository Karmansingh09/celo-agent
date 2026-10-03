import {
  AgentBudgetState,
  BudgetReservation,
  IBudgetStore,
  ReservationRequest,
  ReservationResult,
  calculateAvailableBudget,
  formatBaseUnitsToCusd,
  getUtcCalendarWindowId,
  parseCusdToBaseUnits,
  validateBudgetAccountingInvariant,
} from './budget-types';

/**
 * Phase 6.2: In-Memory Budget Reservation Engine
 * 
 * Implements the IBudgetStore interface for single-process Node.js runtimes.
 * 
 * CONCURRENCY & PERSISTENCE ARCHITECTURE:
 * - Single-Process Concurrency Safety: All budget checks, invariant validations, and state mutations
 *   execute synchronously without intervening async yields or `await` statements. This guarantees
 *   strict atomic execution on the Node.js event loop: concurrent requests are serialized safely,
 *   preventing race-condition overspending.
 * - In-Memory Ephemeral Storage: State is held in JavaScript Map collections.
 *   LIMITATIONS:
 *   1. Process Restarts: All spending history, budget allocations, and active reservations are lost on restart.
 *   2. Multi-Instance / Serverless: Does NOT synchronize across multiple server instances or independent
 *      Vercel / Next.js serverless functions.
 *   Production deployments require an external ACID-compliant database implementation of IBudgetStore.
 */
export class InMemoryBudgetStore implements IBudgetStore {
  /** Map of budget states keyed by `${agentId}:${windowId}` */
  private budgetStates: Map<string, AgentBudgetState> = new Map();

  /** Map of reservations keyed by `reservation.id` */
  private reservations: Map<string, BudgetReservation> = new Map();

  /** Map of idempotency keys scoped per agent: `${agentId}:${idempotencyKey}` -> `reservation.id` */
  private idempotencyMap: Map<string, string> = new Map();

  /**
   * Resets all in-memory state. Useful for test isolation.
   */
  public clear(): void {
    this.budgetStates.clear();
    this.reservations.clear();
    this.idempotencyMap.clear();
  }

  /**
   * Builds the internal composite key for budget state storage.
   */
  private getStateKey(agentId: string, windowId: string): string {
    return `${agentId}:${windowId}`;
  }

  /**
   * Builds the internal composite key for idempotency lookup.
   */
  private getIdempotencyKey(agentId: string, idempotencyKey: string): string {
    return `${agentId}:${idempotencyKey}`;
  }

  /**
   * Retrieves or initializes the budget state snapshot for an agent in a specific UTC daily window.
   */
  public async getBudgetState(
    agentId: string,
    windowId: string,
    dailyLimitCusd: string
  ): Promise<AgentBudgetState> {
    const key = this.getStateKey(agentId, windowId);
    let state = this.budgetStates.get(key);

    if (!state) {
      const dailyLimitWei = parseCusdToBaseUnits(dailyLimitCusd);
      if (dailyLimitWei === null) {
        throw new Error(`Invalid daily limit cUSD string: ${dailyLimitCusd}`);
      }

      const formattedLimit = formatBaseUnitsToCusd(dailyLimitWei);
      state = {
        agentId,
        windowId,
        dailyLimitWei,
        dailyLimitCusd: formattedLimit,
        spentWei: 0n,
        spentCusd: '0',
        reservedWei: 0n,
        reservedCusd: '0',
        availableWei: dailyLimitWei,
        availableCusd: formattedLimit,
        updatedAt: Date.now(),
      };
      this.budgetStates.set(key, state);
    } else {
      const incomingLimitWei = parseCusdToBaseUnits(dailyLimitCusd);
      if (incomingLimitWei !== null && incomingLimitWei !== state.dailyLimitWei) {
        throw new Error(
          `Contradictory daily limit for existing window ${windowId}: requested ${dailyLimitCusd} cUSD but window is locked at ${state.dailyLimitCusd} cUSD`
        );
      }
    }

    return { ...state };
  }

  /**
   * Atomically acquires a budget reservation against the agent's UTC daily window.
   * Enforces the accounting invariant: availableWei >= amountWei.
   * Handles idempotency: duplicate keys return existing status without double-reserving.
   */
  public async acquireReservation(
    request: ReservationRequest,
    dailyLimitCusd: string
  ): Promise<ReservationResult> {
    const now = request.timestamp !== undefined ? request.timestamp : Date.now();

    // 1. Validate request parameters
    if (!request.agentId || request.agentId.trim() === '') {
      return this.createDeniedResult(
        'Missing or empty agentId',
        request.agentId,
        'UNKNOWN',
        0n
      );
    }

    if (!request.recipient || !/^0x[a-fA-F0-9]{40}$/.test(request.recipient.trim())) {
      return this.createDeniedResult(
        'Invalid recipient EVM address format',
        request.agentId,
        'UNKNOWN',
        0n
      );
    }

    if (!request.idempotencyKey || request.idempotencyKey.trim() === '') {
      return this.createDeniedResult(
        'Missing or empty idempotencyKey',
        request.agentId,
        'UNKNOWN',
        0n
      );
    }

    const requestedAmountWei = parseCusdToBaseUnits(request.amountCusd);
    if (requestedAmountWei === null) {
      return this.createDeniedResult(
        `Invalid requested amount format: ${request.amountCusd}`,
        request.agentId,
        'UNKNOWN',
        0n
      );
    }

    const dailyLimitWei = parseCusdToBaseUnits(dailyLimitCusd);
    if (dailyLimitWei === null) {
      return this.createDeniedResult(
        `Invalid daily limit format: ${dailyLimitCusd}`,
        request.agentId,
        'UNKNOWN',
        0n
      );
    }

    // 2. Validate UTC Window ID
    let windowId: string;
    try {
      windowId = getUtcCalendarWindowId(now);
    } catch {
      return this.createDeniedResult(
        'Invalid request timestamp provided',
        request.agentId,
        'UNKNOWN',
        dailyLimitWei
      );
    }

    const stateKey = this.getStateKey(request.agentId, windowId);
    let state = this.budgetStates.get(stateKey);

    if (!state) {
      const formattedLimit = formatBaseUnitsToCusd(dailyLimitWei);
      state = {
        agentId: request.agentId,
        policyId: request.policyId,
        windowId,
        dailyLimitWei,
        dailyLimitCusd: formattedLimit,
        spentWei: 0n,
        spentCusd: '0',
        reservedWei: 0n,
        reservedCusd: '0',
        availableWei: dailyLimitWei,
        availableCusd: formattedLimit,
        updatedAt: now,
      };
      this.budgetStates.set(stateKey, state);
    } else if (dailyLimitWei !== state.dailyLimitWei) {
      return {
        success: false,
        outcome: 'DENIED',
        reason: `Contradictory daily limit provided for existing window ${windowId}: provided ${dailyLimitCusd} cUSD, but window is locked at ${state.dailyLimitCusd} cUSD`,
        budgetState: { ...state },
      };
    }

    // 3. Idempotency Check (Scoped per Agent)
    const idempKey = this.getIdempotencyKey(request.agentId, request.idempotencyKey);
    const existingResId = this.idempotencyMap.get(idempKey);

    if (existingResId) {
      const existingRes = this.reservations.get(existingResId);
      if (existingRes) {
        // Check for parameter mismatch (conflict)
        const recipientMatches =
          existingRes.recipient.trim().toLowerCase() === request.recipient.trim().toLowerCase();
        const amountMatches = existingRes.amountWei === requestedAmountWei;
        const windowMatches = existingRes.windowId === windowId;
        const policyMatches = existingRes.policyId === request.policyId;

        if (!recipientMatches || !amountMatches || !windowMatches || !policyMatches) {
          return {
            success: false,
            outcome: 'IDEMPOTENCY_CONFLICT',
            reservation: { ...existingRes },
            reason:
              'Idempotency key was previously used with different payment parameters (amount, recipient, window, or policy)',
            budgetState: { ...state },
          };
        }

        // Return existing reservation according to its state
        if (existingRes.status === 'COMMITTED') {
          return {
            success: true,
            outcome: 'DUPLICATE_COMMITTED',
            reservation: { ...existingRes },
            reason: 'Payment already completed on-chain for this idempotency key',
            budgetState: { ...state },
          };
        }

        if (
          existingRes.status === 'RESERVED' ||
          existingRes.status === 'SUBMITTED' ||
          existingRes.status === 'HELD_FOR_RECONCILIATION'
        ) {
          return {
            success: true,
            outcome: 'DUPLICATE_IN_PROGRESS',
            reservation: { ...existingRes },
            reason: 'Payment reservation currently in progress for this idempotency key',
            budgetState: { ...state },
          };
        }

        // If previously released, do not permit re-use to avoid confusion
        return {
          success: false,
          outcome: 'DENIED',
          reservation: { ...existingRes },
          reason: 'Previous reservation with this idempotency key was released after failure',
          budgetState: { ...state },
        };
      }
    }

    // 4. Invariant & Available Budget Check
    // (Zero async yields between this check and the reservation update!)
    if (state.availableWei < requestedAmountWei) {
      return {
        success: false,
        outcome: 'DENIED',
        reason: `Daily budget exceeded. Available: ${state.availableCusd} cUSD, Requested: ${request.amountCusd} cUSD`,
        budgetState: { ...state },
      };
    }

    // 5. Atomic State Update (Synchronous Mutation)
    state.reservedWei += requestedAmountWei;
    state.availableWei = calculateAvailableBudget(
      state.dailyLimitWei,
      state.spentWei,
      state.reservedWei
    );
    state.reservedCusd = formatBaseUnitsToCusd(state.reservedWei);
    state.availableCusd = formatBaseUnitsToCusd(state.availableWei);
    state.updatedAt = now;

    // Verify invariant integrity
    const invariant = validateBudgetAccountingInvariant(
      state.dailyLimitWei,
      state.spentWei,
      state.reservedWei
    );
    if (!invariant.valid) {
      // Revert in case of unexpected corruption
      state.reservedWei -= requestedAmountWei;
      state.availableWei = calculateAvailableBudget(
        state.dailyLimitWei,
        state.spentWei,
        state.reservedWei
      );
      throw new Error(`Accounting invariant violation during reservation: ${invariant.error}`);
    }

    // 6. Create Reservation Record
    const reservationId = `res_${now}_${Math.random().toString(36).slice(2, 9)}`;
    const reservation: BudgetReservation = {
      id: reservationId,
      idempotencyKey: request.idempotencyKey,
      agentId: request.agentId,
      policyId: request.policyId,
      windowId,
      amountWei: requestedAmountWei,
      amountCusd: request.amountCusd,
      recipient: request.recipient,
      status: 'RESERVED',
      createdAt: now,
      updatedAt: now,
    };

    this.reservations.set(reservationId, reservation);
    this.idempotencyMap.set(idempKey, reservationId);

    return {
      success: true,
      outcome: 'RESERVED',
      reservation: { ...reservation },
      reason: 'Budget reservation acquired successfully',
      budgetState: { ...state },
    };
  }

  /**
   * Transitions a reservation to SUBMITTED state (in-flight on blockchain).
   */
  public async markSubmitted(reservationId: string, txHash: string): Promise<BudgetReservation> {
    const res = this.reservations.get(reservationId);
    if (!res) {
      throw new Error(`Reservation not found: ${reservationId}`);
    }

    // Idempotent retry: if already submitted with same txHash, return existing
    if (res.status === 'SUBMITTED') {
      return { ...res };
    }

    if (res.status !== 'RESERVED') {
      throw new Error(
        `Invalid state transition: Cannot mark reservation as SUBMITTED from status ${res.status}`
      );
    }

    res.status = 'SUBMITTED';
    res.txHash = txHash;
    res.updatedAt = Date.now();

    return { ...res };
  }

  /**
   * Transitions a reservation to COMMITTED state (confirmed on-chain).
   * Moves amountWei from reservedWei into spentWei exactly once.
   */
  public async commitReservation(reservationId: string): Promise<BudgetReservation> {
    const res = this.reservations.get(reservationId);
    if (!res) {
      throw new Error(`Reservation not found: ${reservationId}`);
    }

    // Idempotency: if already committed, return without double-counting
    if (res.status === 'COMMITTED') {
      return { ...res };
    }

    if (
      res.status !== 'SUBMITTED' &&
      res.status !== 'RESERVED' &&
      res.status !== 'HELD_FOR_RECONCILIATION'
    ) {
      throw new Error(
        `Invalid state transition: Cannot commit reservation from status ${res.status}`
      );
    }

    const stateKey = this.getStateKey(res.agentId, res.windowId);
    const state = this.budgetStates.get(stateKey);
    if (!state) {
      throw new Error(`Budget state not found for agent ${res.agentId} and window ${res.windowId}`);
    }

    // Atomic state update: move from reserved to spent
    state.reservedWei =
      state.reservedWei >= res.amountWei ? state.reservedWei - res.amountWei : 0n;
    state.spentWei += res.amountWei;
    state.availableWei = calculateAvailableBudget(
      state.dailyLimitWei,
      state.spentWei,
      state.reservedWei
    );
    state.reservedCusd = formatBaseUnitsToCusd(state.reservedWei);
    state.spentCusd = formatBaseUnitsToCusd(state.spentWei);
    state.availableCusd = formatBaseUnitsToCusd(state.availableWei);
    state.updatedAt = Date.now();

    res.status = 'COMMITTED';
    res.updatedAt = Date.now();

    return { ...res };
  }

  /**
   * Transitions a reservation to RELEASED state (failed/rejected pre-settlement).
   * Releases amountWei from reservedWei back into availableWei exactly once.
   */
  public async releaseReservation(
    reservationId: string,
    reason: string
  ): Promise<BudgetReservation> {
    const res = this.reservations.get(reservationId);
    if (!res) {
      throw new Error(`Reservation not found: ${reservationId}`);
    }

    // Idempotency: if already released, return without double-releasing
    if (res.status === 'RELEASED') {
      return { ...res };
    }

    if (
      res.status !== 'RESERVED' &&
      res.status !== 'SUBMITTED' &&
      res.status !== 'HELD_FOR_RECONCILIATION'
    ) {
      throw new Error(
        `Invalid state transition: Cannot release reservation from status ${res.status}`
      );
    }

    const stateKey = this.getStateKey(res.agentId, res.windowId);
    const state = this.budgetStates.get(stateKey);
    if (!state) {
      throw new Error(`Budget state not found for agent ${res.agentId} and window ${res.windowId}`);
    }

    // Atomic state update: release from reserved back to available
    state.reservedWei =
      state.reservedWei >= res.amountWei ? state.reservedWei - res.amountWei : 0n;
    state.availableWei = calculateAvailableBudget(
      state.dailyLimitWei,
      state.spentWei,
      state.reservedWei
    );
    state.reservedCusd = formatBaseUnitsToCusd(state.reservedWei);
    state.availableCusd = formatBaseUnitsToCusd(state.availableWei);
    state.updatedAt = Date.now();

    res.status = 'RELEASED';
    res.failureReason = reason;
    res.updatedAt = Date.now();

    return { ...res };
  }

  /**
   * Transitions an uncertain or timed-out reservation to HELD_FOR_RECONCILIATION.
   * Preserves amountWei in reservedWei to prevent overspending until reconciliation confirms status.
   */
  public async holdForReconciliation(
    reservationId: string,
    reason: string
  ): Promise<BudgetReservation> {
    const res = this.reservations.get(reservationId);
    if (!res) {
      throw new Error(`Reservation not found: ${reservationId}`);
    }

    if (res.status === 'HELD_FOR_RECONCILIATION') {
      return { ...res };
    }

    if (res.status !== 'SUBMITTED' && res.status !== 'RESERVED') {
      throw new Error(
        `Invalid state transition: Cannot hold reservation for reconciliation from status ${res.status}`
      );
    }

    // Status changes to HELD_FOR_RECONCILIATION; amountWei remains in reservedWei
    res.status = 'HELD_FOR_RECONCILIATION';
    res.failureReason = reason;
    res.updatedAt = Date.now();

    return { ...res };
  }

  /**
   * Looks up an existing reservation by agentId and idempotencyKey.
   */
  public async getReservationByIdempotencyKey(
    agentId: string,
    idempotencyKey: string
  ): Promise<BudgetReservation | null> {
    const idempKey = this.getIdempotencyKey(agentId, idempotencyKey);
    const resId = this.idempotencyMap.get(idempKey);
    if (!resId) {
      return null;
    }
    const res = this.reservations.get(resId);
    return res ? { ...res } : null;
  }

  /**
   * Helper to construct a DENIED ReservationResult with a safe fallback budget state.
   */
  private createDeniedResult(
    reason: string,
    agentId: string,
    windowId: string,
    dailyLimitWei: bigint
  ): ReservationResult {
    const formattedLimit = formatBaseUnitsToCusd(dailyLimitWei);
    return {
      success: false,
      outcome: 'DENIED',
      reason,
      budgetState: {
        agentId,
        windowId,
        dailyLimitWei,
        dailyLimitCusd: formattedLimit,
        spentWei: 0n,
        spentCusd: '0',
        reservedWei: 0n,
        reservedCusd: '0',
        availableWei: dailyLimitWei,
        availableCusd: formattedLimit,
        updatedAt: Date.now(),
      },
    };
  }
}
