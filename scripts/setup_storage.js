#!/usr/bin/env node
/**
 * Creates the 'content-files' Supabase Storage bucket and sets RLS policies
 * so authenticated users can upload and public URLs work for reads.
 *
 * Usage:
 *   node scripts/setup_storage.js
 *
 * Reads SUPABASE_SERVICE_ROLE_KEY and SUPABASE_DB_URL from .env.local.
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// ── Load .env.local ───────────────────────────────────────────
try {
  const lines = readFileSync(resolve(process.cwd(), '.env.local'), 'utf-8').split('\n');
  for (const line of lines) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const idx = t.indexOf('=');
    if (idx === -1) continue;
    const key = t.slice(0, idx).trim();
    const val = t.slice(idx + 1).trim();
    if (!process.env[key]) process.env[key] = val;
  }
} catch { /* rely on env */ }

const SUPABASE_URL     = process.env.VITE_SUPABASE_URL || 'https://roolumwwcgrpxcmcbsfs.supabase.co';
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const BUCKET           = 'content-files';

if (!SERVICE_ROLE_KEY) {
  console.error('ERROR: SUPABASE_SERVICE_ROLE_KEY not set in .env.local');
  process.exit(1);
}

// ── 1. Create bucket via Storage API ─────────────────────────
const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

console.log(`\nCreating storage bucket "${BUCKET}"...`);
const { error: bucketErr } = await supabase.storage.createBucket(BUCKET, {
  public: true,
  fileSizeLimit: 52428800, // 50 MB (free plan max)
});

if (bucketErr) {
  if (/already exist/i.test(bucketErr.message)) {
    console.log(`  ⚠  "${BUCKET}" already exists — skipping.`);
  } else {
    console.error('  ✗', bucketErr.message);
    process.exit(1);
  }
} else {
  console.log(`  ✓ Bucket "${BUCKET}" created (public, 50 MB limit).`);
}

console.log('\n✓ Bucket ready.');
console.log('  Storage RLS policies are applied via supabase/schema.sql.');
console.log('  If you haven\'t run the schema yet: Supabase SQL Editor → paste schema.sql → Run\n');
