-- ============================================================
-- SE Content Hub — Migration v2: Content metadata columns
-- Run this in: Supabase Dashboard → SQL Editor → New query
-- Or via: node scripts/run_migration.js  (it's safe to re-run)
-- ============================================================

-- ── New columns on content_items ─────────────────────────────────────────────

-- File metadata captured at upload time
alter table public.content_items
  add column if not exists file_name      text;
alter table public.content_items
  add column if not exists file_size_bytes bigint;
alter table public.content_items
  add column if not exists file_mime_type  text;

-- Whether the title/description/tags were AI-generated
alter table public.content_items
  add column if not exists ai_metadata_generated boolean default false;

-- Embedding lifecycle tracking
alter table public.content_items
  add column if not exists embedding_status      text default 'none';  -- 'none' | 'complete' | 'failed'
alter table public.content_items
  add column if not exists embedding_chunk_count integer;
alter table public.content_items
  add column if not exists embedding_model       text;                  -- e.g. 'text-embedding-3-small'
alter table public.content_items
  add column if not exists chunk_size            integer;               -- characters per chunk
alter table public.content_items
  add column if not exists chunk_overlap         integer;               -- overlap characters
alter table public.content_items
  add column if not exists embedded_at           timestamptz;
alter table public.content_items
  add column if not exists extraction_source     text;                  -- 'text' | 'pdf' | 'pptx' | 'docx' | 'vision' | 'whisper' | 'metadata'

-- ── Fix: backfill missing columns on content_embeddings ──────────────────────
-- These were added to schema.sql but may not exist in databases provisioned
-- before that change.  "add column if not exists" makes this safe to re-run.

alter table public.content_embeddings
  add column if not exists chunk_index integer not null default 0;
alter table public.content_embeddings
  add column if not exists chunk_text text;

-- ── Fix: add DELETE policy to content_embeddings ─────────────────────────────
-- Without this, the "replace existing embeddings on re-upload" delete was silently
-- blocked by RLS, causing old chunks to pile up.

drop policy if exists "embeddings_delete_auth" on public.content_embeddings;
create policy "embeddings_delete_auth"
  on public.content_embeddings for delete
  using (
    auth.uid() is not null and
    content_id in (
      select id from public.content_items where uploader_id = auth.uid()
    )
  );
