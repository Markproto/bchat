/**
 * PostgreSQL connection pool.
 */

import { Pool, PoolConfig } from 'pg';

const config: PoolConfig = {
  connectionString: process.env.DATABASE_URL || 'postgresql://bchat:bchat@localhost:5432/bchat',
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
};

export const pool = new Pool(config);

pool.on('error', (err) => {
  console.error('[DB] Unexpected pool error:', err.message);
});

export async function query(text: string, params?: unknown[]) {
  return pool.query(text, params);
}
