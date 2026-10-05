import { CURRENT_CHAIN } from '../celo/config';
import { AuthConfig } from './types';
import { InMemoryNonceStore } from './nonce-store';
import { InMemorySessionStore } from './session-store';
import { AuthService } from './verifier';

/**
 * Phase 7.4: Shared Authentication Service Singleton
 * 
 * Attaches stores to `globalThis` to preserve nonces and sessions across Next.js
 * development hot-module reloads.
 */

declare global {
  // eslint-disable-next-line no-var
  var __celoAuthNonceStore: InMemoryNonceStore | undefined;
  // eslint-disable-next-line no-var
  var __celoAuthSessionStore: InMemorySessionStore | undefined;
  // eslint-disable-next-line no-var
  var __celoAuthService: AuthService | undefined;
}

export function getDefaultAuthConfig(): AuthConfig {
  const appUrl = process.env.APP_URL || process.env.NEXTAUTH_URL || 'http://localhost:3000';
  const url = new URL(appUrl);

  const chainIdEnv = process.env.CELO_CHAIN_ID;
  const expectedChainId = chainIdEnv ? parseInt(chainIdEnv, 10) : CURRENT_CHAIN.id;

  return {
    expectedOrigin: url.origin,
    expectedDomain: url.host,
    expectedChainId,
    nonceTtlMs: 300_000, // 5 minutes
    sessionTtlMs: 86_400_000, // 24 hours
    clockToleranceMs: 60_000, // 1 minute
  };
}

export function getNonceStore(): InMemoryNonceStore {
  if (!globalThis.__celoAuthNonceStore) {
    globalThis.__celoAuthNonceStore = new InMemoryNonceStore();
  }
  return globalThis.__celoAuthNonceStore;
}

export function getSessionStore(): InMemorySessionStore {
  if (!globalThis.__celoAuthSessionStore) {
    globalThis.__celoAuthSessionStore = new InMemorySessionStore();
  }
  return globalThis.__celoAuthSessionStore;
}

export function getAuthService(customConfig?: Partial<AuthConfig>): AuthService {
  if (!globalThis.__celoAuthService || customConfig) {
    const baseConfig = getDefaultAuthConfig();
    const config: AuthConfig = {
      ...baseConfig,
      ...customConfig,
    };
    const service = new AuthService(getNonceStore(), getSessionStore(), config);
    if (!customConfig) {
      globalThis.__celoAuthService = service;
    }
    return service;
  }
  return globalThis.__celoAuthService;
}
