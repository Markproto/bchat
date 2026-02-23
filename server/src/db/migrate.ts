/**
 * Simple migration runner — applies schema.sql to the database.
 * Can be run standalone (npm run migrate) or called from server startup.
 */

import { readFileSync } from 'fs';
import { join } from 'path';
import { pool, query } from './pool';

export async function runMigrations(): Promise<void> {
  const schemaPath = join(__dirname, 'schema.sql');
  const sql = readFileSync(schemaPath, 'utf-8');

  // PG15+ schema permission grant — try separately so it doesn't block
  // table creation if the user already has permissions or can't GRANT.
  try {
    await query('GRANT ALL ON SCHEMA public TO CURRENT_USER');
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[Migrate] GRANT on public schema skipped: ${msg}`);
  }

  // Remove the GRANT line from the schema SQL since we handled it above
  const schemaSql = sql.replace(/^GRANT ALL ON SCHEMA public TO CURRENT_USER;?\s*/m, '');

  try {
    await query(schemaSql);
    console.log('[Migrate] Schema applied successfully');
  } catch (err) {
    console.error('[Migrate] Failed:', err);
    throw err;
  }
}

// Run standalone if called directly (npm run migrate)
if (require.main === module) {
  runMigrations()
    .then(() => pool.end())
    .catch(() => process.exit(1));
}
