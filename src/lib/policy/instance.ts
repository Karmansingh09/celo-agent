import 'server-only';
import { InMemoryBudgetStore } from './in-memory-budget-store';
import { PolicyEnforcementService } from './enforcement-service';

/**
 * Phase 8.1: Shared Policy & Budget Service Singleton Wiring
 * 
 * Provides centralized singleton access to the BudgetStore and PolicyEnforcementService.
 * Attaches instances to `globalThis` to preserve active budget state, daily ledger allocations,
 * and pending reservations across Next.js development hot-module reloads (HMR).
 * 
 * ARCHITECTURAL & DEPLOYMENT LIMITATIONS:
 * 1. Process-Local & Non-Durable:
 *    - All budget ledgers, reservation states, and idempotency mappings are held ephemerally
 *      in single-process JavaScript memory.
 *    - Server restarts, crashes, or new deployments will wipe stored budget states.
 * 2. Multi-Instance / Serverless Limitation:
 *    - In-memory state is NOT synchronized across independent serverless instances
 *      (e.g., Vercel Lambdas) or multiple server containers.
 *    - Requests hitting different instances will see divergent budget accounting.
 * 3. Production Requirement:
 *    - Production multi-instance deployments MUST replace InMemoryBudgetStore with an
 *      ACID-compliant persistent database implementation of IBudgetStore (e.g., PostgreSQL).
 */

declare global {
  // eslint-disable-next-line no-var
  var __celoBudgetStore: InMemoryBudgetStore | undefined;
  // eslint-disable-next-line no-var
  var __celoPolicyEnforcementService: PolicyEnforcementService | undefined;
}

/**
 * Returns the singleton InMemoryBudgetStore instance.
 * Preserves the instance across development hot-reloads via globalThis.
 */
export function getBudgetStore(): InMemoryBudgetStore {
  if (!globalThis.__celoBudgetStore) {
    globalThis.__celoBudgetStore = new InMemoryBudgetStore();
  }
  return globalThis.__celoBudgetStore;
}

/**
 * Returns the singleton PolicyEnforcementService instance configured with the shared BudgetStore.
 * Preserves the instance across development hot-reloads via globalThis.
 */
export function getPolicyEnforcementService(): PolicyEnforcementService {
  if (!globalThis.__celoPolicyEnforcementService) {
    globalThis.__celoPolicyEnforcementService = new PolicyEnforcementService(getBudgetStore());
  }
  return globalThis.__celoPolicyEnforcementService;
}
