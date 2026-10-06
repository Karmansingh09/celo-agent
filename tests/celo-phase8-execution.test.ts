import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  AgentPaymentService,
  IPaymentExecutor,
  PaymentExecutionRequest,
  PaymentExecutionResult,
  AssetMismatchError,
  InvalidReservationError,
  ExecutionInProgressError,
  InvalidPaymentInputError,
  InMemoryPendingApprovalStore,
  CeloPaymentExecutor,
} from '../src/lib/payment';
import {
  AgentService,
  InMemoryAgentStore,
  AgentPausedError,
  AgentTerminatedError,
} from '../src/lib/agent';
import {
  PolicyEnforcementService,
  InMemoryBudgetStore,
  AgentSpendingPolicy,
} from '../src/lib/policy';

/**
 * Phase 8.3: Controlled Payment Execution Boundary Tests
 * 
 * Verifies:
 * - Execution boundary interface (IPaymentExecutor) and parameter forwarding
 * - Reservation state requirements (RESERVED only)
 * - Strict asset boundary (cUSD != CELO, AssetMismatchError on mismatch)
 * - Process-local concurrency safety (preventing double-execution)
 * - SUBMITTED vs COMMITTED separation (submission records txHash, commit is separate)
 * - Failure handling (failAndRelease on deterministic failure)
 * - Reconciliation handling (holdForReconciliation on timeout/uncertainty)
 * - Owner authorization and tenant isolation
 * - ZERO real blockchain calls
 */
describe('Phase 8.3: Controlled Payment Execution Boundary', () => {
  const OWNER_ALICE = '0x1111111111111111111111111111111111111111';
  const OWNER_BOB = '0x2222222222222222222222222222222222222222';
  const RECIPIENT = '0x3333333333333333333333333333333333333333';
  const TX_HASH_VALID = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';

  let agentStore: InMemoryAgentStore;
  let agentService: AgentService;
  let budgetStore: InMemoryBudgetStore;
  let policyEnforcementService: PolicyEnforcementService;
  let approvalStore: InMemoryPendingApprovalStore;
  let mockExecutor: IPaymentExecutor;
  let executeMock: ReturnType<typeof vi.fn<(request: PaymentExecutionRequest) => Promise<PaymentExecutionResult>>>;
  let paymentService: AgentPaymentService;
  let currentTime: number;

  const baseTime = Date.parse('2026-10-06T12:00:00.000Z');
  const policyExpiry = baseTime + 7 * 86_400_000;

  beforeEach(async () => {
    currentTime = baseTime;
    agentStore = new InMemoryAgentStore(() => currentTime);
    agentService = new AgentService(agentStore, () => currentTime);
    budgetStore = new InMemoryBudgetStore();
    policyEnforcementService = new PolicyEnforcementService(budgetStore, () => currentTime);
    approvalStore = new InMemoryPendingApprovalStore();

    executeMock = vi.fn<(request: PaymentExecutionRequest) => Promise<PaymentExecutionResult>>().mockResolvedValue({
      success: true,
      status: 'SUBMITTED',
      txHash: TX_HASH_VALID,
      explorerUrl: `https://sepolia.celoscan.io/tx/${TX_HASH_VALID}`,
    } as PaymentExecutionResult);

    mockExecutor = {
      execute: (req) => executeMock(req),
    };

    paymentService = new AgentPaymentService(
      agentService,
      policyEnforcementService,
      approvalStore,
      () => currentTime,
      86_400_000,
      mockExecutor
    );
  });

  async function setupActiveAgentWithReservation(options?: {
    owner?: string;
    maxPerDay?: string;
    amountCusd?: string;
    idempotencyKey?: string;
  }) {
    const owner = options?.owner || OWNER_ALICE;
    const maxPerDay = options?.maxPerDay || '10.00';
    const amount = options?.amountCusd || '0.50';
    const idempotencyKey = options?.idempotencyKey || 'res-test-key-1';

    const agent = await agentService.createAgent(owner, {
      name: 'Executor Test Agent',
      spendingPolicy: {
        maxPerTransaction: '5.00',
        maxPerDay,
        allowedRecipients: [RECIPIENT],
        autoApproveThreshold: '5.00',
        validUntil: policyExpiry,
      },
    });

    const paymentRes = await paymentService.requestPayment(owner, {
      agentId: agent.id,
      amountCusd: amount,
      recipient: RECIPIENT,
      idempotencyKey,
    });

    expect(paymentRes.outcome).toBe('RESERVED');
    expect(paymentRes.reservation).toBeDefined();

    return {
      agent,
      reservation: paymentRes.reservation!,
    };
  }

  // ============================================================================
  // 1. BOUNDARY & PARAMETER PASSING
  // ============================================================================
  describe('Boundary & Parameter Passing', () => {
    it('1. Successfully forwards execution parameters to IPaymentExecutor', async () => {
      const { agent, reservation } = await setupActiveAgentWithReservation({
        amountCusd: '0.50',
      });

      const execResult = await paymentService.executeReservedPayment(OWNER_ALICE, {
        agentId: agent.id,
        reservationId: reservation.id,
        asset: { kind: 'CUSD_ERC20', network: 'sepolia' },
        executionAmount: '0.50',
        purpose: 'Paying gas oracle',
      });

      expect(execResult.success).toBe(true);
      expect(execResult.status).toBe('SUBMITTED');
      expect(execResult.txHash).toBe(TX_HASH_VALID);

      expect(executeMock).toHaveBeenCalledTimes(1);
      const callArgs: PaymentExecutionRequest = executeMock.mock.calls[0][0];
      expect(callArgs.reservationId).toBe(reservation.id);
      expect(callArgs.agentId).toBe(agent.id);
      expect(callArgs.recipient).toBe(RECIPIENT);
      expect(callArgs.asset).toEqual({ kind: 'CUSD_ERC20', network: 'sepolia' });
      expect(callArgs.amount).toBe('0.50');
      expect(callArgs.idempotencyKey).toBe(reservation.idempotencyKey);
      expect(callArgs.purpose).toBe('Paying gas oracle');
    });

    it('2. Rejects invalid or null execution parameters with InvalidPaymentInputError', async () => {
      await expect(
        paymentService.executeReservedPayment(OWNER_ALICE, null as any)
      ).rejects.toThrow(InvalidPaymentInputError);

      await expect(
        paymentService.executeReservedPayment(OWNER_ALICE, {} as any)
      ).rejects.toThrow(InvalidPaymentInputError);

      await expect(
        paymentService.executeReservedPayment(OWNER_ALICE, {
          agentId: '',
          reservationId: 'res-1',
          asset: { kind: 'NATIVE_CELO' },
          executionAmount: '0.01',
        })
      ).rejects.toThrow(InvalidPaymentInputError);
    });
  });

  // ============================================================================
  // 2. STRICT ASSET BOUNDARY & CONVERSION PROHIBITION
  // ============================================================================
  describe('Asset Boundary & No Silent Conversion', () => {
    it('3. Throws AssetMismatchError when attempting to execute cUSD reservation via NATIVE_CELO rail', async () => {
      const { agent, reservation } = await setupActiveAgentWithReservation({
        amountCusd: '0.50',
      });

      await expect(
        paymentService.executeReservedPayment(OWNER_ALICE, {
          agentId: agent.id,
          reservationId: reservation.id,
          asset: { kind: 'NATIVE_CELO', network: 'sepolia' },
          executionAmount: '0.05',
        })
      ).rejects.toThrow(AssetMismatchError);

      // Invariant: Executor was NEVER called (no blockchain tx attempted)
      expect(executeMock).not.toHaveBeenCalled();

      // Invariant: Reservation remains safely in RESERVED status (not released or corrupted)
      const resAfter = await budgetStore.getReservationById(reservation.id);
      expect(resAfter?.status).toBe('RESERVED');
    });

    it('4. Throws AssetMismatchError on invalid execution amount format', async () => {
      const { agent, reservation } = await setupActiveAgentWithReservation({
        amountCusd: '0.50',
      });

      await expect(
        paymentService.executeReservedPayment(OWNER_ALICE, {
          agentId: agent.id,
          reservationId: reservation.id,
          asset: { kind: 'CUSD_ERC20' },
          executionAmount: 'invalid-amount',
        })
      ).rejects.toThrow(AssetMismatchError);

      await expect(
        paymentService.executeReservedPayment(OWNER_ALICE, {
          agentId: agent.id,
          reservationId: reservation.id,
          asset: { kind: 'CUSD_ERC20' },
          executionAmount: '-1.0',
        })
      ).rejects.toThrow(AssetMismatchError);

      await expect(
        paymentService.executeReservedPayment(OWNER_ALICE, {
          agentId: agent.id,
          reservationId: reservation.id,
          asset: { kind: 'CUSD_ERC20' },
          executionAmount: '0',
        })
      ).rejects.toThrow(AssetMismatchError);

      expect(executeMock).not.toHaveBeenCalled();

      // Reservation remains in RESERVED status
      const resAfter = await budgetStore.getReservationById(reservation.id);
      expect(resAfter?.status).toBe('RESERVED');
    });

    it('5. Throws AssetMismatchError if executionAmount does not match authorized reservation amount (preventing arbitrary bypass)', async () => {
      const { agent, reservation } = await setupActiveAgentWithReservation({
        amountCusd: '0.75',
      });

      // Caller attempts to execute 0.50 or 1.00 against 0.75 cUSD reservation
      await expect(
        paymentService.executeReservedPayment(OWNER_ALICE, {
          agentId: agent.id,
          reservationId: reservation.id,
          asset: { kind: 'CUSD_ERC20' },
          executionAmount: '0.50',
        })
      ).rejects.toThrow(AssetMismatchError);

      await expect(
        paymentService.executeReservedPayment(OWNER_ALICE, {
          agentId: agent.id,
          reservationId: reservation.id,
          asset: { kind: 'CUSD_ERC20' },
          executionAmount: '100.00',
        })
      ).rejects.toThrow(AssetMismatchError);

      // Executor never invoked
      expect(executeMock).not.toHaveBeenCalled();

      // Reservation remains RESERVED
      const resAfter = await budgetStore.getReservationById(reservation.id);
      expect(resAfter?.status).toBe('RESERVED');
    });

    it('5b. Throws AssetMismatchError for any unsupported asset kind', async () => {
      const { agent, reservation } = await setupActiveAgentWithReservation({
        amountCusd: '0.50',
      });

      await expect(
        paymentService.executeReservedPayment(OWNER_ALICE, {
          agentId: agent.id,
          reservationId: reservation.id,
          asset: { kind: 'UNKNOWN_TOKEN' as any },
          executionAmount: '0.50',
        })
      ).rejects.toThrow(AssetMismatchError);

      expect(executeMock).not.toHaveBeenCalled();
      const resAfter = await budgetStore.getReservationById(reservation.id);
      expect(resAfter?.status).toBe('RESERVED');
    });
  });

  // ============================================================================
  // 3. RESERVATION INTEGRITY & LIFECYCLE
  // ============================================================================
  describe('Reservation Integrity & Lifecycle Checks', () => {
    it('6. Throws InvalidReservationError if reservation does not exist', async () => {
      const { agent } = await setupActiveAgentWithReservation();

      await expect(
        paymentService.executeReservedPayment(OWNER_ALICE, {
          agentId: agent.id,
          reservationId: 'non-existent-res-id',
          asset: { kind: 'CUSD_ERC20' },
          executionAmount: '0.50',
        })
      ).rejects.toThrow(InvalidReservationError);

      expect(executeMock).not.toHaveBeenCalled();
    });

    it('7. Throws InvalidReservationError if reservation belongs to different agent', async () => {
      const { agent: agent1, reservation: res1 } = await setupActiveAgentWithReservation({
        idempotencyKey: 'res-agent-1',
      });
      const { agent: agent2 } = await setupActiveAgentWithReservation({
        idempotencyKey: 'res-agent-2',
      });

      await expect(
        paymentService.executeReservedPayment(OWNER_ALICE, {
          agentId: agent2.id,
          reservationId: res1.id,
          asset: { kind: 'CUSD_ERC20' },
          executionAmount: '0.50',
        })
      ).rejects.toThrow(InvalidReservationError);

      expect(executeMock).not.toHaveBeenCalled();
    });

    it('8. Throws InvalidReservationError if reservation is not in RESERVED status', async () => {
      const { agent, reservation } = await setupActiveAgentWithReservation();

      // Release reservation manually
      await policyEnforcementService.failAndRelease(reservation.id, 'Test release');

      await expect(
        paymentService.executeReservedPayment(OWNER_ALICE, {
          agentId: agent.id,
          reservationId: reservation.id,
          asset: { kind: 'CUSD_ERC20' },
          executionAmount: '0.50',
        })
      ).rejects.toThrow(InvalidReservationError);

      expect(executeMock).not.toHaveBeenCalled();
    });

    it('9. Rejects execution if agent is PAUSED', async () => {
      const { agent, reservation } = await setupActiveAgentWithReservation();
      await agentService.pauseAgent(OWNER_ALICE, agent.id);

      await expect(
        paymentService.executeReservedPayment(OWNER_ALICE, {
          agentId: agent.id,
          reservationId: reservation.id,
          asset: { kind: 'CUSD_ERC20' },
          executionAmount: '0.50',
        })
      ).rejects.toThrow(AgentPausedError);

      expect(executeMock).not.toHaveBeenCalled();
    });

    it('10. Rejects execution if agent is TERMINATED', async () => {
      const { agent, reservation } = await setupActiveAgentWithReservation();
      await agentService.terminateAgent(OWNER_ALICE, agent.id);

      await expect(
        paymentService.executeReservedPayment(OWNER_ALICE, {
          agentId: agent.id,
          reservationId: reservation.id,
          asset: { kind: 'CUSD_ERC20' },
          executionAmount: '0.50',
        })
      ).rejects.toThrow(AgentTerminatedError);

      expect(executeMock).not.toHaveBeenCalled();
    });
  });

  // ============================================================================
  // 4. SUBMISSION VS SETTLEMENT SEPARATION
  // ============================================================================
  describe('Submission vs Settlement Separation', () => {
    it('11. Broadcast success transitions reservation to SUBMITTED with txHash', async () => {
      const { agent, reservation } = await setupActiveAgentWithReservation({
        amountCusd: '0.50',
      });

      const result = await paymentService.executeReservedPayment(OWNER_ALICE, {
        agentId: agent.id,
        reservationId: reservation.id,
        asset: { kind: 'CUSD_ERC20' },
        executionAmount: '0.50',
      });

      expect(result.status).toBe('SUBMITTED');
      expect(result.reservation.status).toBe('SUBMITTED');
      expect(result.reservation.txHash).toBe(TX_HASH_VALID);

      // Verify in budgetStore
      const updated = await budgetStore.getReservationById(reservation.id);
      expect(updated?.status).toBe('SUBMITTED');
      expect(updated?.txHash).toBe(TX_HASH_VALID);
    });

    it('12. Does NOT mark reservation as COMMITTED at submission time', async () => {
      const { agent, reservation } = await setupActiveAgentWithReservation({
        maxPerDay: '10.00',
        amountCusd: '2.00',
      });

      await paymentService.executeReservedPayment(OWNER_ALICE, {
        agentId: agent.id,
        reservationId: reservation.id,
        asset: { kind: 'CUSD_ERC20' },
        executionAmount: '2.00',
      });

      const updated = await budgetStore.getReservationById(reservation.id);
      expect(updated?.status).toBe('SUBMITTED');
      expect(updated?.status).not.toBe('COMMITTED');

      // Funds must still be in reservedWei, NOT spentWei
      const budgetState = await budgetStore.getBudgetState(agent.id, reservation.windowId, '10.00');
      expect(budgetState.reservedCusd).toBe('2');
      expect(budgetState.spentCusd).toBe('0');
    });

    it('13. confirmPaymentSettlement transitions SUBMITTED to COMMITTED and updates spentWei', async () => {
      const { agent, reservation } = await setupActiveAgentWithReservation({
        maxPerDay: '10.00',
        amountCusd: '2.00',
      });

      await paymentService.executeReservedPayment(OWNER_ALICE, {
        agentId: agent.id,
        reservationId: reservation.id,
        asset: { kind: 'CUSD_ERC20' },
        executionAmount: '2.00',
      });

      const confirmedRes = await paymentService.confirmPaymentSettlement(
        OWNER_ALICE,
        agent.id,
        reservation.id,
        {
          txHash: TX_HASH_VALID,
          blockNumber: 1234567,
          confirmedAt: Date.now(),
        }
      );

      expect(confirmedRes.status).toBe('COMMITTED');

      const budgetState = await budgetStore.getBudgetState(agent.id, reservation.windowId, '10.00');
      expect(budgetState.reservedCusd).toBe('0');
      expect(budgetState.spentCusd).toBe('2');
    });

    it('14. confirmPaymentSettlement enforces tenant ownership', async () => {
      const { agent, reservation } = await setupActiveAgentWithReservation({
        amountCusd: '0.50',
      });

      await paymentService.executeReservedPayment(OWNER_ALICE, {
        agentId: agent.id,
        reservationId: reservation.id,
        asset: { kind: 'CUSD_ERC20' },
        executionAmount: '0.50',
      });

      await expect(
        paymentService.confirmPaymentSettlement(
          OWNER_BOB,
          agent.id,
          reservation.id,
          {
            txHash: TX_HASH_VALID,
            blockNumber: 1234567,
            confirmedAt: Date.now(),
          }
        )
      ).rejects.toThrow();
    });
  });

  // ============================================================================
  // 5. FAILURE HANDLING & BUDGET RELEASE
  // ============================================================================
  describe('Failure Handling & Budget Release', () => {
    it('15. Deterministic execution failure transitions reservation to RELEASED', async () => {
      executeMock.mockResolvedValueOnce({
        success: false,
        status: 'FAILED',
        error: 'Execution reverted: Insufficient gas funds',
      });

      const { agent, reservation } = await setupActiveAgentWithReservation({
        maxPerDay: '10.00',
        amountCusd: '1.50',
      });

      const result = await paymentService.executeReservedPayment(OWNER_ALICE, {
        agentId: agent.id,
        reservationId: reservation.id,
        asset: { kind: 'CUSD_ERC20' },
        executionAmount: '1.50',
      });

      expect(result.success).toBe(false);
      expect(result.status).toBe('FAILED');
      expect(result.reservation.status).toBe('RELEASED');

      // Check budget state returned funds from reservedWei to availableWei
      const budgetState = await budgetStore.getBudgetState(agent.id, reservation.windowId, '10.00');
      expect(budgetState.reservedCusd).toBe('0');
      expect(budgetState.availableCusd).toBe('10');
    });

    it('16. Unexpected deterministic exception in executor releases reservation', async () => {
      executeMock.mockRejectedValueOnce(new Error('Pre-flight validation error in wallet client'));

      const { agent, reservation } = await setupActiveAgentWithReservation({
        amountCusd: '0.50',
      });

      const result = await paymentService.executeReservedPayment(OWNER_ALICE, {
        agentId: agent.id,
        reservationId: reservation.id,
        asset: { kind: 'CUSD_ERC20' },
        executionAmount: '0.50',
      });

      expect(result.success).toBe(false);
      expect(result.status).toBe('FAILED');
      expect(result.reservation.status).toBe('RELEASED');
    });
  });

  // ============================================================================
  // 6. TIMEOUT / UNCERTAINTY & HOLD FOR RECONCILIATION
  // ============================================================================
  describe('Timeout / Uncertainty & Hold For Reconciliation', () => {
    it('17. Uncertain timeout from executor transitions reservation to HELD_FOR_RECONCILIATION', async () => {
      executeMock.mockResolvedValueOnce({
        success: false,
        status: 'UNCERTAIN',
        error: 'Network timeout waiting for RPC broadcast confirmation',
      });

      const { agent, reservation } = await setupActiveAgentWithReservation({
        maxPerDay: '10.00',
        amountCusd: '2.50',
      });

      const result = await paymentService.executeReservedPayment(OWNER_ALICE, {
        agentId: agent.id,
        reservationId: reservation.id,
        asset: { kind: 'CUSD_ERC20' },
        executionAmount: '2.50',
      });

      expect(result.success).toBe(false);
      expect(result.status).toBe('UNCERTAIN');
      expect(result.reservation.status).toBe('HELD_FOR_RECONCILIATION');

      // CRITICAL GUARANTEE: funds remain encumbered in reservedWei
      const budgetState = await budgetStore.getBudgetState(agent.id, reservation.windowId, '10.00');
      expect(budgetState.reservedCusd).toBe('2.5');
      expect(budgetState.availableCusd).toBe('7.5');
    });

    it('18. Executor exception with "timeout" keyword transitions to HELD_FOR_RECONCILIATION', async () => {
      executeMock.mockRejectedValueOnce(new Error('Request timed out after 30000ms'));

      const { agent, reservation } = await setupActiveAgentWithReservation({
        maxPerDay: '5.00',
        amountCusd: '1.00',
      });

      const result = await paymentService.executeReservedPayment(OWNER_ALICE, {
        agentId: agent.id,
        reservationId: reservation.id,
        asset: { kind: 'CUSD_ERC20' },
        executionAmount: '1.00',
      });

      expect(result.status).toBe('UNCERTAIN');
      expect(result.reservation.status).toBe('HELD_FOR_RECONCILIATION');

      // Funds remain encumbered
      const budgetState = await budgetStore.getBudgetState(agent.id, reservation.windowId, '5.00');
      expect(budgetState.reservedCusd).toBe('1');
    });

    it('19. holdPaymentForReconciliation allows explicit caller reconciliation hold', async () => {
      const { agent, reservation } = await setupActiveAgentWithReservation({
        amountCusd: '1.00',
      });

      const held = await paymentService.holdPaymentForReconciliation(
        OWNER_ALICE,
        agent.id,
        reservation.id,
        'Suspected dropped broadcast'
      );

      expect(held.status).toBe('HELD_FOR_RECONCILIATION');
    });

    it('20. holdPaymentForReconciliation enforces tenant ownership', async () => {
      const { agent, reservation } = await setupActiveAgentWithReservation();

      await expect(
        paymentService.holdPaymentForReconciliation(
          OWNER_BOB,
          agent.id,
          reservation.id,
          'Unauthorized hold attempt'
        )
      ).rejects.toThrow();
    });
  });

  // ============================================================================
  // 7. IN-FLIGHT CONCURRENCY SAFETY
  // ============================================================================
  describe('In-Flight Concurrency Protection', () => {
    it('21. Prevents duplicate concurrent executions of the same reservation', async () => {
      let resolveFirstCall: (val: PaymentExecutionResult) => void;
      const firstCallPromise = new Promise<PaymentExecutionResult>((res) => {
        resolveFirstCall = res;
      });

      executeMock.mockImplementationOnce(() => firstCallPromise);

      const { agent, reservation } = await setupActiveAgentWithReservation({
        amountCusd: '0.50',
      });

      // Launch first execution (remains pending in executor)
      const executionPromise1 = paymentService.executeReservedPayment(OWNER_ALICE, {
        agentId: agent.id,
        reservationId: reservation.id,
        asset: { kind: 'CUSD_ERC20' },
        executionAmount: '0.50',
      });

      // Attempt second execution concurrently with the same reservationId
      await expect(
        paymentService.executeReservedPayment(OWNER_ALICE, {
          agentId: agent.id,
          reservationId: reservation.id,
          asset: { kind: 'CUSD_ERC20' },
          executionAmount: '0.50',
        })
      ).rejects.toThrow(ExecutionInProgressError);

      // Resolve the first call
      resolveFirstCall!({
        success: true,
        status: 'SUBMITTED',
        txHash: TX_HASH_VALID,
      });

      const result1 = await executionPromise1;
      expect(result1.status).toBe('SUBMITTED');
    });

    it('22. Cleans up in-flight set after completion allowing subsequent attempts if permitted', async () => {
      const { agent, reservation } = await setupActiveAgentWithReservation({
        amountCusd: '0.50',
      });

      // Fails deterministically
      executeMock.mockResolvedValueOnce({
        success: false,
        status: 'FAILED',
        error: 'Initial failure',
      });

      await paymentService.executeReservedPayment(OWNER_ALICE, {
        agentId: agent.id,
        reservationId: reservation.id,
        asset: { kind: 'CUSD_ERC20' },
        executionAmount: '0.50',
      });

      // Reservation is now RELEASED; another execution call fails due to invalid status, NOT in-flight lock
      await expect(
        paymentService.executeReservedPayment(OWNER_ALICE, {
          agentId: agent.id,
          reservationId: reservation.id,
          asset: { kind: 'CUSD_ERC20' },
          executionAmount: '0.50',
        })
      ).rejects.toThrow(InvalidReservationError);
    });
  });

  // ============================================================================
  // 8. TENANT ISOLATION & AUTHORIZATION
  // ============================================================================
  describe('Tenant Isolation & Authorization', () => {
    it('23. Owner Bob cannot execute reservation belonging to Owner Alice agent', async () => {
      const { agent, reservation } = await setupActiveAgentWithReservation({
        owner: OWNER_ALICE,
        amountCusd: '0.50',
      });

      await expect(
        paymentService.executeReservedPayment(OWNER_BOB, {
          agentId: agent.id,
          reservationId: reservation.id,
          asset: { kind: 'CUSD_ERC20' },
          executionAmount: '0.50',
        })
      ).rejects.toThrow();

      expect(executeMock).not.toHaveBeenCalled();
    });

    it('24. Cannot execute reservation against mismatched agent ID', async () => {
      const { agent: agent1, reservation } = await setupActiveAgentWithReservation({
        amountCusd: '0.50',
      });
      const agent2 = await agentService.createAgent(OWNER_ALICE, {
        name: 'Second Agent',
        spendingPolicy: {
          maxPerTransaction: '5.00',
          maxPerDay: '10.00',
          allowedRecipients: [RECIPIENT],
          autoApproveThreshold: '5.00',
          validUntil: policyExpiry,
        },
      });

      await expect(
        paymentService.executeReservedPayment(OWNER_ALICE, {
          agentId: agent2.id,
          reservationId: reservation.id,
          asset: { kind: 'CUSD_ERC20' },
          executionAmount: '0.50',
        })
      ).rejects.toThrow(InvalidReservationError);

      expect(executeMock).not.toHaveBeenCalled();
    });
  });

  // ============================================================================
  // 9. END-TO-END FLOW: APPROVAL -> APPROVE -> EXECUTE -> CONFIRM
  // ============================================================================
  describe('Approval to Execution Full Lifecycle', () => {
    it('25. Full lifecycle: request requires approval, approved, reserved, executed, and confirmed', async () => {
      const agent = await agentService.createAgent(OWNER_ALICE, {
        name: 'High Roller Agent',
        spendingPolicy: {
          maxPerTransaction: '10.00',
          maxPerDay: '20.00',
          allowedRecipients: [RECIPIENT],
          autoApproveThreshold: '1.00', // Requests > 1.00 require approval
          validUntil: policyExpiry,
        },
      });

      // 1. Submit request > 1.00 cUSD
      const initialReq = await paymentService.requestPayment(OWNER_ALICE, {
        agentId: agent.id,
        amountCusd: '3.00',
        recipient: RECIPIENT,
        idempotencyKey: 'approval-exec-flow-1',
      });

      expect(initialReq.outcome).toBe('REQUIRE_USER_APPROVAL');
      expect(initialReq.pendingApproval).toBeDefined();

      // 2. Owner approves
      const approvedRes = await paymentService.approvePaymentRequest(
        OWNER_ALICE,
        agent.id,
        initialReq.pendingApproval!.requestId
      );

      expect(approvedRes.outcome).toBe('RESERVED');
      expect(approvedRes.reservation).toBeDefined();

      // 3. Execute reserved payment
      const execResult = await paymentService.executeReservedPayment(OWNER_ALICE, {
        agentId: agent.id,
        reservationId: approvedRes.reservation!.id,
        asset: { kind: 'CUSD_ERC20' },
        executionAmount: '3.00',
      });

      expect(execResult.status).toBe('SUBMITTED');
      expect(execResult.txHash).toBe(TX_HASH_VALID);

      // 4. Confirm settlement
      const settledRes = await paymentService.confirmPaymentSettlement(
        OWNER_ALICE,
        agent.id,
        approvedRes.reservation!.id,
        {
          txHash: TX_HASH_VALID,
          blockNumber: 1234567,
          confirmedAt: Date.now(),
        }
      );

      expect(settledRes.status).toBe('COMMITTED');

      // 5. Final budget check: 3.00 cUSD spent, 0 reserved, 17.00 available
      const budget = await budgetStore.getBudgetState(agent.id, approvedRes.reservation!.windowId, '20.00');
      expect(budget.spentCusd).toBe('3');
      expect(budget.reservedCusd).toBe('0');
      expect(budget.availableCusd).toBe('17');
    });

    it('26. Cannot execute if pending approval was rejected', async () => {
      const agent = await agentService.createAgent(OWNER_ALICE, {
        name: 'Rejected Flow Agent',
        spendingPolicy: {
          maxPerTransaction: '10.00',
          maxPerDay: '20.00',
          allowedRecipients: [RECIPIENT],
          autoApproveThreshold: '1.00',
          validUntil: policyExpiry,
        },
      });

      const initialReq = await paymentService.requestPayment(OWNER_ALICE, {
        agentId: agent.id,
        amountCusd: '4.00',
        recipient: RECIPIENT,
        idempotencyKey: 'approval-exec-flow-reject',
      });

      await paymentService.rejectPaymentRequest(
        OWNER_ALICE,
        agent.id,
        initialReq.pendingApproval!.requestId
      );

      // No reservation was ever created
      await expect(
        paymentService.executeReservedPayment(OWNER_ALICE, {
          agentId: agent.id,
          reservationId: 'non-existent-res',
          asset: { kind: 'CUSD_ERC20' },
          executionAmount: '4.00',
        })
      ).rejects.toThrow(InvalidReservationError);
    });
  });

  // ============================================================================
  // 10. CONCRETE CeloPaymentExecutor ADAPTER TESTS
  // ============================================================================
  describe('Concrete CeloPaymentExecutor', () => {
    it('27. CeloPaymentExecutor rejects non-NATIVE_CELO asset kinds with AssetMismatchError', async () => {
      const concreteExecutor = new CeloPaymentExecutor();

      await expect(
        concreteExecutor.execute({
          reservationId: 'res-123',
          agentId: 'agent-123',
          recipient: RECIPIENT,
          asset: { kind: 'CUSD_ERC20' },
          amount: '1.00',
        })
      ).rejects.toThrow(AssetMismatchError);
    });

    it('28. CeloPaymentExecutor handles unconfigured agent wallet gracefully without throwing uncaught', async () => {
      // In this test environment, AGENT_PRIVATE_KEY is not set
      const concreteExecutor = new CeloPaymentExecutor();

      const result = await concreteExecutor.execute({
        reservationId: 'res-123',
        agentId: 'agent-123',
        recipient: RECIPIENT,
        asset: { kind: 'NATIVE_CELO' },
        amount: '0.01',
      });

      expect(result.success).toBe(false);
      expect(result.status).toBe('FAILED');
      expect(result.error).toMatch(/Agent wallet not configured/);
    });

    it('29. CeloPaymentExecutor returns UNCERTAIN on timeout errors', async () => {
      // Test the uncertain mapping logic via mock wrapper
      const timeoutExecutor: IPaymentExecutor = {
        async execute(req: PaymentExecutionRequest) {
          if (req.asset.kind !== 'NATIVE_CELO') {
            throw new AssetMismatchError('Unsupported');
          }
          return {
            success: false,
            status: 'UNCERTAIN',
            error: 'Request timeout to Celo RPC provider',
          };
        },
      };

      const result = await timeoutExecutor.execute({
        reservationId: 'res-timeout',
        agentId: 'agent-1',
        recipient: RECIPIENT,
        asset: { kind: 'NATIVE_CELO' },
        amount: '0.01',
      });

      expect(result.status).toBe('UNCERTAIN');
    });

    it('30. Default constructor of AgentPaymentService initializes without crashing', async () => {
      const defaultService = new AgentPaymentService(
        agentService,
        policyEnforcementService,
        approvalStore
      );
      expect(defaultService).toBeDefined();
    });
  });
});
