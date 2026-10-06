import 'server-only';
import { InMemoryPendingApprovalStore, IPendingApprovalStore } from './pending-approval-store';
import { AgentPaymentService } from './service';
import { getAgentService } from '../agent/instance';
import { getPolicyEnforcementService } from '../policy/instance';

/**
 * Phase 8.4: Shared Agent Payment Service Singleton Wiring
 * 
 * Provides centralized singleton access to the PendingApprovalStore and AgentPaymentService.
 * Attaches instances to `globalThis` to preserve active pending approvals and in-flight
 * execution locks across Next.js development hot-module reloads (HMR).
 * 
 * ARCHITECTURAL & DEPLOYMENT LIMITATIONS:
 * 1. Process-Local & Non-Durable:
 *    - All pending approval records and in-flight locks are held ephemerally in single-process memory.
 *    - Server restarts or deployments will wipe stored pending approvals.
 * 2. Multi-Instance / Serverless Limitation:
 *    - In-memory state is NOT synchronized across independent serverless instances
 *      (e.g., Vercel Lambdas) or multiple server containers.
 * 3. Production Requirement:
 *    - Production multi-instance deployments MUST replace InMemoryPendingApprovalStore with an
 *      ACID-compliant persistent database implementation of IPendingApprovalStore (e.g., PostgreSQL).
 */

declare global {
  // eslint-disable-next-line no-var
  var __celoPendingApprovalStore: IPendingApprovalStore | undefined;
  // eslint-disable-next-line no-var
  var __celoAgentPaymentService: AgentPaymentService | undefined;
}

/**
 * Returns the singleton IPendingApprovalStore instance.
 * Preserves the instance across development hot-reloads via globalThis.
 */
export function getPendingApprovalStore(): IPendingApprovalStore {
  if (!globalThis.__celoPendingApprovalStore) {
    globalThis.__celoPendingApprovalStore = new InMemoryPendingApprovalStore();
  }
  return globalThis.__celoPendingApprovalStore;
}

/**
 * Returns the singleton AgentPaymentService instance configured with
 * shared AgentService, PolicyEnforcementService, and PendingApprovalStore.
 * Preserves the instance across development hot-reloads via globalThis.
 */
export function getAgentPaymentService(): AgentPaymentService {
  if (!globalThis.__celoAgentPaymentService) {
    globalThis.__celoAgentPaymentService = new AgentPaymentService(
      getAgentService(),
      getPolicyEnforcementService(),
      getPendingApprovalStore()
    );
  }
  return globalThis.__celoAgentPaymentService;
}
