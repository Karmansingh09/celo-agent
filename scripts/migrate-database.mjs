import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const { Pool } = pg;
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const migration = await readFile(resolve(root, 'db/migrations/001_initial.sql'), 'utf8');

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is required to run database migrations');
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_SSL === 'require'
    ? { rejectUnauthorized: process.env.DATABASE_SSL_REJECT_UNAUTHORIZED !== 'false' }
    : undefined,
});

try {
  await pool.query(migration);
  console.log('Applied CeloAgent database migration 001_initial.sql');
} finally {
  await pool.end();
}
