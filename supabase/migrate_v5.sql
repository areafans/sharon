-- ============================================================
-- SE Content Hub — Migration v5
-- Store doc title and description on each embedding chunk
-- for faster retrieval without a join at query time.
--
-- Run via Supabase SQL Editor or:
--   DB_PASSWORD='...' node scripts/run_migration.js supabase/migrate_v5.sql
-- ============================================================

-- 1. Add doc_title and doc_description to each chunk row
alter table public.content_embeddings
  add column if not exists doc_title text;

alter table public.content_embeddings
  add column if not exists doc_description text;

-- 2. Back-fill existing rows from their parent content_items
update public.content_embeddings ce
set
  doc_title       = ci.title,
  doc_description = ci.description
from public.content_items ci
where ce.content_id = ci.id;
