import 'server-only';

import { Pool, PoolClient, QueryResult, QueryResultRow } from 'pg';

export type SqlClient = Pick<Pool, 'query'> | Pick<PoolClient, 'query'>;

declare global {
  // eslint-disable-next-line no-var
  var __celoPostgresPool: Pool | undefined;
}

/** Returns whether the application has been configured for durable storage. */
export function isDatabaseConfigured(): boolean {
  return typeof process.env.DATABASE_URL === 'string' && process.env.DATABASE_URL.trim().length > 0;
}

export function assertDurableStorageConfigured(): void {
  if (process.env.NODE_ENV === 'production' && !isDatabaseConfigured()) {
    throw new Error('DATABASE_URL is required in production; process-local storage is disabled');
  }
}

/**
 * Returns the process-shared PostgreSQL pool.
 * The pool contains connections only; financial state always remains in PostgreSQL.
 */
export function getDatabasePool(): Pool {
  if (!isDatabaseConfigured()) {
    throw new Error('DATABASE_URL is required for PostgreSQL-backed application storage');
  }

  if (!globalThis.__celoPostgresPool) {
    globalThis.__celoPostgresPool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: Number(process.env.DATABASE_POOL_MAX || 10),
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 10_000,
      ssl:
        process.env.DATABASE_SSL === 'require'
          ? { rejectUnauthorized: process.env.DATABASE_SSL_REJECT_UNAUTHORIZED !== 'false' }
          : undefined,
    });
  }

  return globalThis.__celoPostgresPool;
}

export async function withDatabaseTransaction<T>(
  operation: (client: PoolClient) => Promise<T>
): Promise<T> {
  const client = await getDatabasePool().connect();
  try {
    await client.query('BEGIN');
    const result = await operation(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

export function isUniqueViolation(error: unknown): boolean {
  return Boolean(error && typeof error === 'object' && (error as { code?: string }).code === '23505');
}

export function isSerializationFailure(error: unknown): boolean {
  return Boolean(error && typeof error === 'object' && (error as { code?: string }).code === '40001');
}

export type Rows<T extends QueryResultRow> = QueryResult<T>['rows'];
