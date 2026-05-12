-- ============================================================
-- SE Content Hub — Migration v3
-- Adds the match_content RPC for vector similarity search
--
-- Run via Supabase SQL Editor or:
--   DB_PASSWORD='...' node scripts/run_migration.js supabase/migrate_v3.sql
-- ============================================================

create or replace function public.match_content(
  query_embedding vector(1536),
  match_count     int  default 5,
  filter_user_id  uuid default null   -- null = search all content; set to a user id to restrict to their uploads
)
returns table (
  content_id   uuid,
  chunk_index  int,
  chunk_text   text,
  similarity   float,
  title        text,
  content_type text,
  file_url     text
)
language sql stable
as $$
  select
    ce.content_id,
    ce.chunk_index,
    ce.chunk_text,
    1 - (ce.embedding <=> query_embedding)  as similarity,
    ci.title,
    ci.content_type::text,
    ci.file_url
  from public.content_embeddings ce
  join public.content_items ci on ci.id = ce.content_id
  where filter_user_id is null
     or ci.uploader_id = filter_user_id
  order by ce.embedding <=> query_embedding
  limit match_count;
$$;
