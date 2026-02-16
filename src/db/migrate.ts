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

  try {
    await query(sql);
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
