-- ============================================================
-- SE Content Hub — Migration v4
-- Supports multiple chat sessions per user
--
-- Run via Supabase SQL Editor or:
--   DB_PASSWORD='...' node scripts/run_migration.js supabase/migrate_v4.sql
-- ============================================================

-- 1. Drop the unique constraint so users can have many sessions
alter table public.chat_sessions
  drop constraint if exists chat_sessions_user_id_key;

-- 2. Add title (auto-generated from first message)
alter table public.chat_sessions
  add column if not exists title text;

-- 3. Add updated_at for sorting by most-recently-active
alter table public.chat_sessions
  add column if not exists updated_at timestamptz default now();

-- 4. Back-fill updated_at on existing rows from latest message
update public.chat_sessions cs
set updated_at = coalesce(
  (select max(created_at) from public.chat_messages cm where cm.session_id = cs.id),
  cs.created_at
);

-- 5. Index for fast per-user history queries
create index if not exists chat_sessions_user_updated_idx
  on public.chat_sessions(user_id, updated_at desc);
