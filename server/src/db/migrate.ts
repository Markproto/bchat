/**
 * Migration runner — applies all SQL schema files in order.
 *
 * Order: schema.sql first (base tables), then numbered phase migrations (005–009).
 * Every statement uses CREATE TABLE IF NOT EXISTS, so re-running is safe.
 *
 * Usage:
 *   npm run migrate          (standalone)
 *   docker-entrypoint.sh     (called before server start)
 */

import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { pool, query } from './pool';

export async function runMigrations() {
  const dbDir = __dirname;

  // Collect SQL files: schema.sql first, then numbered migrations in order
  const files = readdirSync(dbDir)
    .filter(f => f.endsWith('.sql'))
    .sort((a, b) => {
      if (a === 'schema.sql') return -1;
      if (b === 'schema.sql') return 1;
      return a.localeCompare(b);
    });

  // PG15+ schema permission grant — try separately so it doesn't block
  // table creation if the user already has permissions or can't GRANT.
  try {
    await query('GRANT ALL ON SCHEMA public TO CURRENT_USER');
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[Migrate] GRANT on public schema skipped: ${msg}`);
  }

  for (const file of files) {
    const filePath = join(dbDir, file);
    let sql = readFileSync(filePath, 'utf-8');

    // Remove GRANT lines (handled above)
    sql = sql.replace(/^GRANT ALL ON SCHEMA public TO CURRENT_USER;?\s*/gm, '');

    if (!sql.trim()) continue;

    try {
      await query(sql);
      console.log(`[Migrate] Applied: ${file}`);
    } catch (err) {
      console.error(`[Migrate] Failed on ${file}:`, err);
      throw err;
    }
  }

  console.log('[Migrate] All migrations applied successfully');
}

// Run standalone if called directly (npm run migrate)
if (require.main === module) {
  runMigrations()
    .then(() => pool.end())
    .catch(() => process.exit(1));
}
