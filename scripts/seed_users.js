#!/usr/bin/env node
/**
 * Creates 3 test users in Supabase Auth using the Admin API.
 * Requires the SERVICE ROLE key (not anon key).
 *
 * Usage:
 *   SUPABASE_SERVICE_ROLE_KEY='your_service_role_key' node scripts/seed_users.js
 *
 * Find your service role key:
 *   Supabase Dashboard > Settings > API > service_role (click "Reveal")
 */

import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load .env.local if present
try {
  const envPath = resolve(__dirname, '../.env.local');
  const lines = readFileSync(envPath, 'utf8').split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const val = trimmed.slice(eqIdx + 1).trim();
    if (!(key in process.env)) process.env[key] = val;
  }
} catch { /* .env.local not found, rely on environment */ }

const SUPABASE_URL = 'https://roolumwwcgrpxcmcbsfs.supabase.co';
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SERVICE_ROLE_KEY || SERVICE_ROLE_KEY === 'REPLACE_WITH_REAL_SERVICE_ROLE_KEY') {
  console.error('ERROR: set SUPABASE_SERVICE_ROLE_KEY env var before running this script');
  console.error('  Get it from: Supabase Dashboard > Settings > API > service_role key');
  console.error('  SUPABASE_SERVICE_ROLE_KEY=\'eyJ...\' node scripts/seed_users.js');
  process.exit(1);
}

const TEST_USERS = [
  { email: 'admin@secontenthub.com',  password: 'Admin1234!',  name: 'Admin' },
  { email: 'connor@secontenthub.com', password: 'Connor1234!', name: 'Connor' },
  { email: 'jason@secontenthub.com',  password: 'Jason1234!',  name: 'Jason' },
];

async function createUser(user) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': SERVICE_ROLE_KEY,
      'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
    },
    body: JSON.stringify({
      email: user.email,
      password: user.password,
      email_confirm: true,
      user_metadata: { full_name: user.name },
    }),
  });

  const data = await res.json();

  if (!res.ok) {
    if (data.msg?.includes('already been registered') || data.code === 'email_exists') {
      console.log(`  ⚠ ${user.email} already exists — skipping`);
      return;
    }
    throw new Error(`Failed to create ${user.email}: ${JSON.stringify(data)}`);
  }

  console.log(`  ✓ Created ${user.name} <${user.email}>`);
}

console.log('Creating test users...');
for (const user of TEST_USERS) {
  await createUser(user);
}
console.log('\nDone. Test users:');
console.log('  admin@secontenthub.com  / Admin1234!');
console.log('  connor@secontenthub.com / Connor1234!');
console.log('  jason@secontenthub.com  / Jason1234!');
