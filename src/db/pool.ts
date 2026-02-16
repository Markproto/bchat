/**
 * PostgreSQL connection pool.
 */

import { Pool, PoolConfig } from 'pg';

const connectionString = process.env.DATABASE_URL || 'postgresql://bchat:bchat@localhost:5432/bchat';

// Enable SSL for any non-localhost database (managed DBs like Digital Ocean
// require SSL and use self-signed certs, so rejectUnauthorized must be false).
const isRemoteDb = !connectionString.includes('localhost') && !connectionString.includes('127.0.0.1');

const config: PoolConfig = {
  connectionString,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
  ssl: isRemoteDb ? { rejectUnauthorized: false } : false,
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
