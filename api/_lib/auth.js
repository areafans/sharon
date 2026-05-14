// Shared auth + request hardening for Vercel functions.
//
// Files prefixed with `_` are NOT routed by Vercel — this module is import-only.
//
// Every server function that calls a paid upstream (Anthropic, OpenAI, etc.)
// must call `guardRequest(req)` before forwarding. The guard:
//   1. Rejects requests whose Origin isn't on the allow-list.
//   2. Requires a Supabase JWT in the Authorization header and validates it
//      with `supabase.auth.getUser()`. Returns the user record on success.
//   3. Provides clamp helpers for max_tokens and an allow-list for model
//      names so an attacker can't pick the most expensive model and the
//      largest output to maximise cost per call.

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
const SUPABASE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ??
  process.env.SUPABASE_ANON_KEY ??
  process.env.VITE_SUPABASE_ANON_KEY;

// Built once and reused across warm function invocations.
let _supabase = null;
function getSupabase() {
  if (_supabase) return _supabase;
  if (!SUPABASE_URL || !SUPABASE_KEY) return null;
  _supabase = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } });
  return _supabase;
}

// Comma-separated allow-list, e.g.
//   ALLOWED_ORIGINS=https://sharon.example.com,https://sharon-staging.vercel.app
// Defaults cover the local Vite dev server ports.
const DEFAULT_ALLOWED_ORIGINS = [
  'http://localhost:5173',
  'http://localhost:5174',
  'http://localhost:4173',
  'http://127.0.0.1:5173',
];

function getAllowedOrigins() {
  const raw = process.env.ALLOWED_ORIGINS;
  if (!raw) return DEFAULT_ALLOWED_ORIGINS;
  return raw.split(',').map(s => s.trim()).filter(Boolean);
}

function checkOrigin(req) {
  const origin = req.headers?.origin;
  // Same-origin requests (e.g. server-side fetch) won't send an Origin header.
  // Allow them through — the JWT check is the real gate.
  if (!origin) return { ok: true };
  const allowed = getAllowedOrigins();
  if (allowed.includes(origin)) return { ok: true };
  return { ok: false, status: 403, error: `Origin ${origin} not allowed` };
}

async function checkAuth(req) {
  const header = req.headers?.authorization || req.headers?.Authorization;
  if (!header || typeof header !== 'string' || !header.startsWith('Bearer ')) {
    return { ok: false, status: 401, error: 'Missing or malformed Authorization header' };
  }
  const token = header.slice('Bearer '.length).trim();
  if (!token) return { ok: false, status: 401, error: 'Empty bearer token' };

  const supabase = getSupabase();
  if (!supabase) {
    return { ok: false, status: 500, error: 'Supabase is not configured on the server' };
  }

  try {
    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data?.user) {
      return { ok: false, status: 401, error: 'Invalid or expired token' };
    }
    return { ok: true, user: data.user };
  } catch (err) {
    return { ok: false, status: 401, error: `Token verification failed: ${err.message}` };
  }
}

/**
 * Run all hardening checks. Call at the top of every public POST handler.
 *
 * @returns {{ok: true, user: object} | {ok: false, status: number, error: string}}
 */
export async function guardRequest(req) {
  const originResult = checkOrigin(req);
  if (!originResult.ok) return originResult;

  const authResult = await checkAuth(req);
  if (!authResult.ok) return authResult;

  return { ok: true, user: authResult.user };
}

// ────────────────────────────────────────────────────────────────────────────
// Cost-control helpers — the body of an AI call is attacker-controlled, so we
// clamp the bits that drive cost (model + max output tokens) to safe values.
// ────────────────────────────────────────────────────────────────────────────

// Add new entries here when LD AI Configs introduce them. Anything not in this
// list is rejected so a forged body can't pick `claude-opus-4` to maximise spend.
const ALLOWED_CLAUDE_MODELS = new Set([
  'claude-haiku-4-5-20251001',
  'claude-sonnet-4-5-20250929',
  'claude-3-5-haiku-20241022',
  'claude-3-5-sonnet-20241022',
  'claude-3-haiku-20240307',
]);

const MAX_TOKENS_CEILING = 4096;

export function isAllowedClaudeModel(name) {
  return typeof name === 'string' && ALLOWED_CLAUDE_MODELS.has(name);
}

export function clampMaxTokens(n) {
  const num = typeof n === 'number' ? n : Number.parseInt(n, 10);
  if (!Number.isFinite(num) || num <= 0) return 1024;
  return Math.min(num, MAX_TOKENS_CEILING);
}
