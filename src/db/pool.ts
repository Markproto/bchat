/**
 * PostgreSQL connection pool.
 */

import { Pool, PoolConfig } from 'pg';

const isProduction = process.env.NODE_ENV === 'production';

const config: PoolConfig = {
  connectionString: process.env.DATABASE_URL || 'postgresql://bchat:bchat@localhost:5432/bchat',
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
  ssl: isProduction ? { rejectUnauthorized: false } : false,
};

export const pool = new Pool(config);

pool.on('error', (err) => {
  console.error('[DB] Unexpected pool error:', err.message);
  if (err.message.includes('ENOTFOUND') || err.message.includes('getaddrinfo')) {
    console.error('[DB] Hostname resolution failed. Check DATABASE_URL is set correctly.');
    console.error('[DB] Current connectionString host may be unreachable.');
  }
});

export async function query(text: string, params?: unknown[]) {
  return pool.query(text, params);
}
