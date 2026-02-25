/**
 * PostgreSQL connection pool.
 *
 * Digital Ocean managed databases require SSL with self-signed certs.
 * Their DATABASE_URL includes ?sslmode=require, which can conflict with
 * the `ssl` config option in node-postgres. We strip sslmode from the URL
 * and set SSL explicitly to avoid the conflict.
 */

import { Pool, PoolConfig } from 'pg';

const rawUrl = process.env.DATABASE_URL || 'postgresql://bchat:bchat@localhost:5432/bchat';

// DATABASE_SSL env var overrides auto-detection (needed for Docker where hostname is "db")
const sslEnv = process.env.DATABASE_SSL;
const isRemoteDb = sslEnv !== undefined
  ? sslEnv === 'true'
  : !rawUrl.includes('localhost') && !rawUrl.includes('127.0.0.1');

// Strip sslmode from connection string — we manage SSL via the pool config.
// Leaving sslmode in the URL causes node-postgres to create a TLS connection
// with Node's default rejectUnauthorized=true, which rejects DO's self-signed cert.
const connectionString = rawUrl.replace(/[?&]sslmode=[^&]*/g, '').replace(/\?$/, '');

const config: PoolConfig = {
  connectionString,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
  ssl: isRemoteDb ? { rejectUnauthorized: false } : false,
};

// Log connection config at startup (mask credentials)
const maskedUrl = connectionString.replace(/:([^@]+)@/, ':***@');
console.log(`[DB] Connecting to: ${maskedUrl}`);
console.log(`[DB] SSL: ${isRemoteDb ? 'enabled (rejectUnauthorized: false)' : 'disabled (localhost)'}`);

export const pool = new Pool(config);

pool.on('error', (err) => {
  console.error('[DB] Unexpected pool error:', err.message);
  if (err.message.includes('ENOTFOUND') || err.message.includes('getaddrinfo')) {
    console.error('[DB] Hostname resolution failed. Check DATABASE_URL is set correctly.');
    console.error('[DB] Current connectionString host may be unreachable.');
  }
  if (err.message.includes('self-signed') || err.message.includes('SSL')) {
    console.error('[DB] SSL certificate error. The sslmode may need adjustment.');
  }
});

export async function query(text: string, params?: unknown[]) {
  return pool.query(text, params);
}
