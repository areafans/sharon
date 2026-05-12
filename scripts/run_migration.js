#!/usr/bin/env node
/**
 * Runs supabase/schema.sql against the Supabase Postgres database.
 * Uses the direct connection string (requires the db password).
 *
 * Usage:
 *   DB_PASSWORD='yourpassword' node scripts/run_migration.js
 */

import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';

const { Client } = pg;

const __dirname = dirname(fileURLToPath(import.meta.url));

const password = process.env.DB_PASSWORD;
if (!password) {
  console.error('ERROR: set DB_PASSWORD env var before running this script');
  console.error('  DB_PASSWORD=\'your_db_password\' node scripts/run_migration.js');
  process.exit(1);
}

const client = new Client({
  host: 'db.roolumwwcgrpxcmcbsfs.supabase.co',
  port: 5432,
  database: 'postgres',
  user: 'postgres',
  password,
  ssl: { rejectUnauthorized: false },
});

const sql = readFileSync(join(__dirname, '../supabase/schema.sql'), 'utf8');

console.log('Connecting to Supabase Postgres...');
try {
  await client.connect();
  console.log('Connected. Running migration...');
  await client.query(sql);
  console.log('✓ Migration complete.');
} catch (err) {
  console.error('Migration failed:', err.message);
  process.exit(1);
} finally {
  await client.end();
}
