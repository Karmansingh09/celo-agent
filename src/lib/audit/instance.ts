import 'server-only';

import { assertDurableStorageConfigured, isDatabaseConfigured } from '../db/postgres';
import { InMemoryAuditEventStore } from './in-memory-audit-store';
import { PostgresAuditEventStore } from './postgres-audit-store';
import { IAuditEventStore } from './types';

declare global {
  // eslint-disable-next-line no-var
  var __celoAuditEventStore: InMemoryAuditEventStore | PostgresAuditEventStore | undefined;
}

export function getAuditEventStore(): IAuditEventStore {
  assertDurableStorageConfigured();
  if (!globalThis.__celoAuditEventStore) {
    globalThis.__celoAuditEventStore = isDatabaseConfigured()
      ? new PostgresAuditEventStore()
      : new InMemoryAuditEventStore();
  }
  return globalThis.__celoAuditEventStore;
}
