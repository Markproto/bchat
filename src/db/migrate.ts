/**
 * Simple migration runner — applies schema.sql to the database.
 */

import { readFileSync } from 'fs';
import { join } from 'path';
import { pool } from './pool';

async function migrate() {
  const schemaPath = join(__dirname, 'schema.sql');
  const sql = readFileSync(schemaPath, 'utf-8');

  try {
    await pool.query(sql);
    console.log('[Migrate] Schema applied successfully');
  } catch (err) {
    console.error('[Migrate] Failed:', err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

migrate();
