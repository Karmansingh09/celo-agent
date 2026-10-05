import 'server-only';
import { InMemoryAgentStore } from './in-memory-agent-store';
import { AgentService } from './service';

/**
 * Phase 7.5.1: Shared Agent Service Singleton Wiring
 * 
 * Provides centralized singleton access to the AgentStore and AgentService.
 * Attaches instances to `globalThis` to preserve active agent state across Next.js
 * development hot-module reloads (HMR).
 * 
 * ARCHITECTURAL & DEPLOYMENT LIMITATIONS:
 * 1. Process-Local & Non-Durable:
 *    - All agent records are held ephemerally in single-process JavaScript memory.
 *    - Server restarts, crashes, or new deployments will wipe stored agents.
 * 2. Multi-Instance / Serverless Limitation:
 *    - In-memory state is NOT synchronized across independent serverless instances
 *      (e.g., Vercel Lambdas) or multiple server containers.
 *    - Requests hitting different instances will see divergent agent datasets.
 * 3. Production Requirement:
 *    - Production multi-instance deployments MUST replace InMemoryAgentStore with an
 *      ACID-compliant persistent database implementation of IAgentStore (e.g., PostgreSQL).
 */

declare global {
  // eslint-disable-next-line no-var
  var __celoAgentStore: InMemoryAgentStore | undefined;
  // eslint-disable-next-line no-var
  var __celoAgentService: AgentService | undefined;
}

/**
 * Returns the singleton InMemoryAgentStore instance.
 * Preserves the instance across development hot-reloads via globalThis.
 */
export function getAgentStore(): InMemoryAgentStore {
  if (!globalThis.__celoAgentStore) {
    globalThis.__celoAgentStore = new InMemoryAgentStore();
  }
  return globalThis.__celoAgentStore;
}

/**
 * Returns the singleton AgentService instance configured with the shared AgentStore.
 * Preserves the instance across development hot-reloads via globalThis.
 */
export function getAgentService(): AgentService {
  if (!globalThis.__celoAgentService) {
    globalThis.__celoAgentService = new AgentService(getAgentStore());
  }
  return globalThis.__celoAgentService;
}
