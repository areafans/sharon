-- ============================================================
-- SE Content Hub — Full Database Schema
-- Run this against your Supabase project via the SQL Editor
-- or via scripts/run_migration.js
-- ============================================================

-- Enable pgvector for semantic search
create extension if not exists vector;

-- ============================================================
-- ENUMS
-- ============================================================

do $$ begin
  create type content_type_enum as enum ('deck', 'video', 'demo', 'doc', 'code');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type message_role_enum as enum ('user', 'assistant');
exception when duplicate_object then null;
end $$;

-- ============================================================
-- USERS
-- Mirrors auth.users. Populated via trigger on signup.
-- ============================================================

create table if not exists public.users (
  id          uuid primary key references auth.users(id) on delete cascade,
  email       text,
  name        text,
  avatar_url  text,
  created_at  timestamptz default now()
);

-- Trigger: auto-populate public.users when a new auth user is created
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.users (id, email, name, avatar_url)
  values (
    new.id,
    new.email,
    coalesce(
      new.raw_user_meta_data->>'full_name',
      new.raw_user_meta_data->>'name',
      split_part(new.email, '@', 1)
    ),
    new.raw_user_meta_data->>'avatar_url'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ============================================================
-- CONTENT ITEMS
-- ============================================================

create table if not exists public.content_items (
  id              uuid primary key default gen_random_uuid(),
  uploader_id     uuid references public.users(id) on delete set null,
  title           text not null,
  description     text,
  content_type    content_type_enum not null,
  file_url        text,
  is_external_url boolean default false,
  tags            text[] default '{}',
  view_count      integer default 0,
  share_count     integer default 0,
  -- File metadata
  file_name             text,
  file_size_bytes       bigint,
  file_mime_type        text,
  -- AI metadata tracking
  ai_metadata_generated boolean default false,
  -- Embedding tracking
  embedding_status      text default 'none',  -- 'none' | 'complete' | 'failed'
  embedding_chunk_count integer,
  embedding_model       text,
  chunk_size            integer,
  chunk_overlap         integer,
  embedded_at           timestamptz,
  extraction_source     text,  -- 'text' | 'pdf' | 'pptx' | 'docx' | 'vision' | 'whisper' | 'metadata'
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);

-- Backfill columns for databases created before migration v2
alter table public.content_items add column if not exists file_name             text;
alter table public.content_items add column if not exists file_size_bytes       bigint;
alter table public.content_items add column if not exists file_mime_type        text;
alter table public.content_items add column if not exists ai_metadata_generated boolean default false;
alter table public.content_items add column if not exists embedding_status      text default 'none';
alter table public.content_items add column if not exists embedding_chunk_count integer;
alter table public.content_items add column if not exists embedding_model       text;
alter table public.content_items add column if not exists chunk_size            integer;
alter table public.content_items add column if not exists chunk_overlap         integer;
alter table public.content_items add column if not exists embedded_at           timestamptz;
alter table public.content_items add column if not exists extraction_source     text;

-- Auto-update updated_at
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists content_items_updated_at on public.content_items;
create trigger content_items_updated_at
  before update on public.content_items
  for each row execute procedure public.set_updated_at();

-- ============================================================
-- CONTENT EMBEDDINGS
-- vector(1536) matches Anthropic's embedding model output
-- ============================================================

create table if not exists public.content_embeddings (
  id              uuid primary key default gen_random_uuid(),
  content_id      uuid references public.content_items(id) on delete cascade,
  chunk_index     integer not null default 0,
  chunk_text      text,
  embedding       vector(1536),
  doc_title       text,       -- denormalized from content_items for faster retrieval
  doc_description text,       -- denormalized from content_items for faster retrieval
  created_at      timestamptz default now()
);

-- Backfill columns for databases created before this migration
alter table public.content_embeddings
  add column if not exists chunk_index integer not null default 0;
alter table public.content_embeddings
  add column if not exists chunk_text text;

-- IVFFlat index for fast cosine similarity search
-- Lists value tuned for small-to-medium dataset; increase for >100k rows
create index if not exists content_embeddings_vector_idx
  on public.content_embeddings
  using ivfflat (embedding vector_cosine_ops)
  with (lists = 100);

-- ============================================================
-- RATINGS
-- One rating per user per content item (enforced by unique constraint)
-- ============================================================

create table if not exists public.ratings (
  id          uuid primary key default gen_random_uuid(),
  content_id  uuid references public.content_items(id) on delete cascade,
  user_id     uuid references public.users(id) on delete cascade,
  score       integer not null check (score >= 1 and score <= 5),
  created_at  timestamptz default now(),
  unique (content_id, user_id)
);

-- ============================================================
-- COMMENTS
-- Threaded: parent_id null = top-level, set = reply
-- ============================================================

create table if not exists public.comments (
  id          uuid primary key default gen_random_uuid(),
  content_id  uuid references public.content_items(id) on delete cascade,
  user_id     uuid references public.users(id) on delete cascade,
  parent_id   uuid references public.comments(id) on delete cascade,
  body        text not null,
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

drop trigger if exists comments_updated_at on public.comments;
create trigger comments_updated_at
  before update on public.comments
  for each row execute procedure public.set_updated_at();

-- ============================================================
-- SHARE LINKS
-- ============================================================

create table if not exists public.share_links (
  id            uuid primary key default gen_random_uuid(),
  content_id    uuid references public.content_items(id) on delete cascade,
  created_by    uuid references public.users(id) on delete set null,
  token         uuid unique default gen_random_uuid(),
  password_hash text,
  expires_at    timestamptz,
  created_at    timestamptz default now()
);

-- ============================================================
-- CHAT SESSIONS
-- One persistent session per user
-- ============================================================

create table if not exists public.chat_sessions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references public.users(id) on delete cascade unique,
  created_at  timestamptz default now()
);

-- ============================================================
-- CHAT MESSAGES
-- ============================================================

create table if not exists public.chat_messages (
  id          uuid primary key default gen_random_uuid(),
  session_id  uuid references public.chat_sessions(id) on delete cascade,
  role        message_role_enum not null,
  content     text not null,
  created_at  timestamptz default now()
);

-- ============================================================
-- IDEAS
-- AI-generated drafts; can be promoted to content_items
-- ============================================================

create table if not exists public.ideas (
  id              uuid primary key default gen_random_uuid(),
  created_by      uuid references public.users(id) on delete cascade,
  title           text,
  artifact        jsonb,
  published       boolean default false,
  content_item_id uuid references public.content_items(id) on delete set null,
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);

drop trigger if exists ideas_updated_at on public.ideas;
create trigger ideas_updated_at
  before update on public.ideas
  for each row execute procedure public.set_updated_at();

-- ============================================================
-- INDEXES
-- ============================================================

create index if not exists content_items_tags_idx     on public.content_items using gin(tags);
create index if not exists content_items_uploader_idx on public.content_items(uploader_id);
create index if not exists content_items_type_idx     on public.content_items(content_type);
create index if not exists content_items_fts_idx      on public.content_items
  using gin(to_tsvector('english', coalesce(title,'') || ' ' || coalesce(description,'')));
create index if not exists ratings_content_idx        on public.ratings(content_id);
create index if not exists comments_content_idx       on public.comments(content_id);
create index if not exists comments_parent_idx        on public.comments(parent_id);
create index if not exists chat_messages_session_idx  on public.chat_messages(session_id);
create index if not exists share_links_token_idx      on public.share_links(token);

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

alter table public.users              enable row level security;
alter table public.content_items      enable row level security;
alter table public.content_embeddings enable row level security;
alter table public.ratings            enable row level security;
alter table public.comments           enable row level security;
alter table public.share_links        enable row level security;
alter table public.chat_sessions      enable row level security;
alter table public.chat_messages      enable row level security;
alter table public.ideas              enable row level security;

-- Drop all policies before recreating so this script is safely re-runnable
do $$ declare r record; begin
  for r in select policyname, tablename
             from pg_policies
            where schemaname = 'public'
  loop
    execute format('drop policy if exists %I on public.%I', r.policyname, r.tablename);
  end loop;
end $$;

-- users
create policy "users_select_all"    on public.users for select using (true);
create policy "users_insert_own"    on public.users for insert with check (auth.uid() = id);
create policy "users_update_own"    on public.users for update using (auth.uid() = id);

-- content_items
create policy "content_select_all"  on public.content_items for select using (true);
create policy "content_insert_auth" on public.content_items for insert with check (auth.uid() = uploader_id);
create policy "content_update_own"  on public.content_items for update using (auth.uid() = uploader_id);
create policy "content_delete_own"  on public.content_items for delete using (auth.uid() = uploader_id);

-- content_embeddings
create policy "embeddings_select_all"  on public.content_embeddings for select using (true);
create policy "embeddings_insert_auth" on public.content_embeddings for insert with check (auth.uid() is not null);
create policy "embeddings_delete_auth" on public.content_embeddings for delete
  using (
    auth.uid() is not null and
    content_id in (select id from public.content_items where uploader_id = auth.uid())
  );

-- ratings
create policy "ratings_select_all"  on public.ratings for select using (true);
create policy "ratings_insert_auth" on public.ratings for insert with check (auth.uid() = user_id);
create policy "ratings_update_own"  on public.ratings for update using (auth.uid() = user_id);
create policy "ratings_delete_own"  on public.ratings for delete using (auth.uid() = user_id);

-- comments
create policy "comments_select_all"  on public.comments for select using (true);
create policy "comments_insert_auth" on public.comments for insert with check (auth.uid() = user_id);
create policy "comments_update_own"  on public.comments for update using (auth.uid() = user_id);
create policy "comments_delete_own"  on public.comments for delete using (auth.uid() = user_id);

-- share_links
create policy "share_links_select_all"  on public.share_links for select using (true);
create policy "share_links_insert_auth" on public.share_links for insert with check (auth.uid() = created_by);
create policy "share_links_delete_own"  on public.share_links for delete using (auth.uid() = created_by);

-- chat_sessions
create policy "chat_sessions_own" on public.chat_sessions for all using (auth.uid() = user_id);

-- chat_messages
create policy "chat_messages_own" on public.chat_messages for all using (
  session_id in (select id from public.chat_sessions where user_id = auth.uid())
);

-- ideas
create policy "ideas_select_all"  on public.ideas for select using (true);
create policy "ideas_insert_auth" on public.ideas for insert with check (auth.uid() = created_by);
create policy "ideas_update_own"  on public.ideas for update using (auth.uid() = created_by);
create policy "ideas_delete_own"  on public.ideas for delete using (auth.uid() = created_by);

-- ============================================================
-- STORAGE POLICIES (storage.objects for bucket: content-files)
-- ============================================================

-- Authenticated users can upload
do $$ begin
  create policy "content_files_insert"
    on storage.objects for insert
    to authenticated
    with check (bucket_id = 'content-files');
exception when duplicate_object then null;
end $$;

-- Anyone can read (supports public URLs)
do $$ begin
  create policy "content_files_select"
    on storage.objects for select
    using (bucket_id = 'content-files');
exception when duplicate_object then null;
end $$;

-- Uploaders can delete their own files
do $$ begin
  create policy "content_files_delete"
    on storage.objects for delete
    to authenticated
    using (bucket_id = 'content-files' and owner::uuid = auth.uid());
exception when duplicate_object then null;
end $$;
