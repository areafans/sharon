#!/usr/bin/env node
/**
 * Applies incremental SQL migrations in supabase/migrate_v*.sql against the
 * Supabase Postgres database, skipping any that have already been applied.
 *
 * A lightweight tracking table (schema_migrations) is created on first run.
 * Each applied migration is recorded there so subsequent runs are safe to
 * re-run without re-applying finished work.
 *
 * Usage:
 *   DB_PASSWORD='yourpassword' node scripts/run_migration.js
 *
 * Or, if SUPABASE_DB_URL is set in .env.local, the script reads it from there
 * automatically (no DB_PASSWORD needed in that case).
 */

import { readFileSync, readdirSync } from 'fs';
import { join, dirname, basename } from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';

const { Client } = pg;
const __dirname = dirname(fileURLToPath(import.meta.url));
const supabaseDir = join(__dirname, '../supabase');

// ---------------------------------------------------------------------------
// Connection — prefer SUPABASE_DB_URL, fall back to individual env vars
// ---------------------------------------------------------------------------

function loadEnvLocal() {
  try {
    const envFile = readFileSync(join(__dirname, '../.env.local'), 'utf8');
    for (const line of envFile.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const idx = trimmed.indexOf('=');
      if (idx === -1) continue;
      const key = trimmed.slice(0, idx).trim();
      const val = trimmed.slice(idx + 1).trim().replace(/^["']|["']$/g, '');
      if (!process.env[key]) process.env[key] = val;
    }
  } catch {
    // .env.local is optional in CI / production environments
  }
}

loadEnvLocal();

let clientConfig;
if (process.env.SUPABASE_DB_URL) {
  clientConfig = { connectionString: process.env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false } };
} else {
  const password = process.env.DB_PASSWORD;
  if (!password) {
    console.error('ERROR: provide credentials via SUPABASE_DB_URL or DB_PASSWORD');
    console.error('  SUPABASE_DB_URL=\'postgres://...\' node scripts/run_migration.js');
    console.error('  DB_PASSWORD=\'your_db_password\' node scripts/run_migration.js');
    process.exit(1);
  }
  clientConfig = {
    host: 'db.roolumwwcgrpxcmcbsfs.supabase.co',
    port: 5432,
    database: 'postgres',
    user: 'postgres',
    password,
    ssl: { rejectUnauthorized: false },
  };
}

// ---------------------------------------------------------------------------
// Discover migration files — migrate_v2.sql, migrate_v3.sql, … sorted by N
// ---------------------------------------------------------------------------

function getMigrationFiles() {
  const files = readdirSync(supabaseDir)
    .filter(f => /^migrate_v\d+\.sql$/.test(f))
    .sort((a, b) => {
      const numA = parseInt(a.match(/\d+/)[0], 10);
      const numB = parseInt(b.match(/\d+/)[0], 10);
      return numA - numB;
    });
  return files;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const client = new Client(clientConfig);

console.log('Connecting to Supabase Postgres...');
await client.connect();
console.log('Connected.');

// Ensure tracking table exists
await client.query(`
  CREATE TABLE IF NOT EXISTS schema_migrations (
    filename   TEXT PRIMARY KEY,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );
`);

// Fetch already-applied migrations
const { rows } = await client.query('SELECT filename FROM schema_migrations');
const applied = new Set(rows.map(r => r.filename));

const migrationFiles = getMigrationFiles();

if (migrationFiles.length === 0) {
  console.log('No migration files found in supabase/.');
  await client.end();
  process.exit(0);
}

let pendingCount = 0;

for (const file of migrationFiles) {
  if (applied.has(file)) {
    console.log(`  skip  ${file}  (already applied)`);
    continue;
  }

  const sql = readFileSync(join(supabaseDir, file), 'utf8');
  console.log(`  apply ${file} …`);

  try {
    await client.query('BEGIN');
    await client.query(sql);
    await client.query('INSERT INTO schema_migrations (filename) VALUES ($1)', [file]);
    await client.query('COMMIT');
    console.log(`  ✓     ${file}`);
    pendingCount++;
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(`  ✗     ${file}  FAILED: ${err.message}`);
    await client.end();
    process.exit(1);
  }
}

if (pendingCount === 0) {
  console.log('Nothing to apply — database is already up to date.');
} else {
  console.log(`\n✓ Applied ${pendingCount} migration(s).`);
}

await client.end();
