-- ============================================================
-- Sharon — Complete Database Schema
-- Generated from schema.sql + migrate_v2 through migrate_v6
--
-- Use this file for a brand-new Supabase project instead of
-- running individual migration files manually.
--
-- Steps:
--   1. Open your Supabase project → SQL Editor
--   2. Paste and run this entire file
--   3. Run:  npm run storage:setup
--   4. You are done — DO NOT run npm run db:migrate after this.
--      The schema_migrations table is pre-populated so the
--      migration runner knows all files are already applied.
-- ============================================================


-- ============================================================
-- EXTENSIONS
-- ============================================================

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
-- ORGANIZATIONS (added in v7)
-- ============================================================

create table if not exists public.organizations (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  created_at timestamptz default now()
);


-- ============================================================
-- USERS
-- Mirrors auth.users; populated via trigger on signup.
-- org_id / role added in v7.
-- ============================================================

create table if not exists public.users (
  id          uuid primary key references auth.users(id) on delete cascade,
  email       text,
  name        text,
  avatar_url  text,
  org_id      uuid references public.organizations(id) on delete set null,
  role        text not null default 'member' check (role in ('admin', 'member')),
  created_at  timestamptz default now()
);

create index if not exists users_org_idx on public.users(org_id);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_org_id uuid;
begin
  -- Check for a pending invitation matching this email (v7)
  select org_id into v_org_id
  from public.org_invitations
  where email = new.email
    and status = 'pending'
  order by created_at desc
  limit 1;

  if v_org_id is not null then
    update public.org_invitations
    set status = 'accepted'
    where email = new.email
      and status = 'pending';
  end if;

  insert into public.users (id, email, name, avatar_url, org_id, role)
  values (
    new.id,
    new.email,
    coalesce(
      new.raw_user_meta_data->>'full_name',
      new.raw_user_meta_data->>'name',
      split_part(new.email, '@', 1)
    ),
    new.raw_user_meta_data->>'avatar_url',
    v_org_id,
    case when v_org_id is not null then 'member' else 'member' end
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
-- Includes all columns added through migrate_v2
-- ============================================================

create table if not exists public.content_items (
  id            uuid primary key default gen_random_uuid(),
  uploader_id   uuid references public.users(id) on delete set null,
  title         text not null,
  description   text,
  content_type  content_type_enum not null,
  file_url      text,
  is_external_url boolean default false,
  tags          text[] default '{}',
  view_count    integer default 0,
  share_count   integer default 0,
  -- File metadata (added in v2)
  file_name             text,
  file_size_bytes       bigint,
  file_mime_type        text,
  -- AI metadata (added in v2)
  ai_metadata_generated boolean default false,
  -- Embedding tracking (added in v2)
  embedding_status      text default 'none',  -- 'none' | 'complete' | 'failed'
  embedding_chunk_count integer,
  embedding_model       text,
  chunk_size            integer,
  chunk_overlap         integer,
  embedded_at           timestamptz,
  extraction_source     text,  -- 'text' | 'pdf' | 'pptx' | 'docx' | 'vision' | 'whisper' | 'metadata'
  created_at    timestamptz default now(),
  updated_at    timestamptz default now()
);

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
-- Includes doc_title / doc_description added in v5
-- ============================================================

create table if not exists public.content_embeddings (
  id              uuid primary key default gen_random_uuid(),
  content_id      uuid references public.content_items(id) on delete cascade,
  chunk_index     integer not null default 0,
  chunk_text      text,
  embedding       vector(1536),
  doc_title       text,        -- denormalized from content_items (added in v5)
  doc_description text,        -- denormalized from content_items (added in v5)
  created_at      timestamptz default now()
);

-- IVFFlat index for cosine similarity search
create index if not exists content_embeddings_vector_idx
  on public.content_embeddings
  using ivfflat (embedding vector_cosine_ops)
  with (lists = 100);


-- ============================================================
-- VECTOR SEARCH RPC (added in v3)
-- ============================================================

create or replace function public.match_content(
  query_embedding vector(1536),
  match_count     int  default 5,
  filter_user_id  uuid default null
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
    1 - (ce.embedding <=> query_embedding) as similarity,
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


-- ============================================================
-- RATINGS
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
-- ORG INVITATIONS (added in v7)
-- ============================================================

create table if not exists public.org_invitations (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references public.organizations(id) on delete cascade,
  email      text not null,
  invited_by uuid references public.users(id) on delete set null,
  status     text not null default 'pending'
    check (status in ('pending', 'accepted', 'revoked')),
  created_at timestamptz default now()
);


-- ============================================================
-- CHAT SESSIONS
-- Unique constraint on user_id removed in v4 (multiple sessions per user).
-- title and updated_at added in v4.
-- ============================================================

create table if not exists public.chat_sessions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references public.users(id) on delete cascade,
  title       text,
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

drop trigger if exists chat_sessions_updated_at on public.chat_sessions;
create trigger chat_sessions_updated_at
  before update on public.chat_sessions
  for each row execute procedure public.set_updated_at();


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

create index if not exists content_items_tags_idx          on public.content_items using gin(tags);
create index if not exists content_items_uploader_idx      on public.content_items(uploader_id);
create index if not exists content_items_type_idx          on public.content_items(content_type);
create index if not exists content_items_fts_idx           on public.content_items
  using gin(to_tsvector('english', coalesce(title,'') || ' ' || coalesce(description,'')));
create index if not exists ratings_content_idx             on public.ratings(content_id);
create index if not exists comments_content_idx            on public.comments(content_id);
create index if not exists comments_parent_idx             on public.comments(parent_id);
create index if not exists chat_messages_session_idx       on public.chat_messages(session_id);
create index if not exists chat_sessions_user_updated_idx  on public.chat_sessions(user_id, updated_at desc);
create index if not exists share_links_token_idx           on public.share_links(token);


-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

alter table public.organizations      enable row level security;
alter table public.users              enable row level security;
alter table public.content_items      enable row level security;
alter table public.content_embeddings enable row level security;
alter table public.ratings            enable row level security;
alter table public.comments           enable row level security;
alter table public.share_links        enable row level security;
alter table public.chat_sessions      enable row level security;
alter table public.chat_messages      enable row level security;
alter table public.ideas              enable row level security;
alter table public.org_invitations    enable row level security;

-- Drop all policies before recreating so this script is safely re-runnable
do $$ declare r record; begin
  for r in select policyname, tablename
             from pg_policies
            where schemaname = 'public'
  loop
    execute format('drop policy if exists %I on public.%I', r.policyname, r.tablename);
  end loop;
end $$;

-- organizations
create policy "orgs_select_member" on public.organizations
  for select using (
    id in (select org_id from public.users where id = auth.uid())
  );
create policy "orgs_update_admin" on public.organizations
  for update using (
    id in (select org_id from public.users where id = auth.uid() and role = 'admin')
  );

-- users
create policy "users_select_all" on public.users for select using (true);
create policy "users_insert_own" on public.users for insert with check (auth.uid() = id);
create policy "users_update_own" on public.users for update using (auth.uid() = id);

-- content_items
create policy "content_select_all"  on public.content_items for select using (true);
create policy "content_insert_auth" on public.content_items for insert with check (auth.uid() = uploader_id);
create policy "content_update_own"  on public.content_items for update using (auth.uid() = uploader_id);
-- v6: any authenticated user can delete (internal tool, not restricting to uploader)
create policy "content_delete_auth" on public.content_items for delete using (auth.uid() is not null);

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

-- org_invitations
create policy "invitations_select_org" on public.org_invitations
  for select using (
    org_id in (select org_id from public.users where id = auth.uid())
  );
create policy "invitations_insert_admin" on public.org_invitations
  for insert with check (
    org_id in (
      select org_id from public.users
      where id = auth.uid() and role = 'admin'
    )
  );
create policy "invitations_update_admin" on public.org_invitations
  for update using (
    org_id in (
      select org_id from public.users
      where id = auth.uid() and role = 'admin'
    )
  );


-- ============================================================
-- STORAGE POLICIES (storage.objects, bucket: content-files)
-- ============================================================

do $$ begin
  create policy "content_files_insert"
    on storage.objects for insert
    to authenticated
    with check (bucket_id = 'content-files');
exception when duplicate_object then null;
end $$;

do $$ begin
  create policy "content_files_select"
    on storage.objects for select
    using (bucket_id = 'content-files');
exception when duplicate_object then null;
end $$;

do $$ begin
  create policy "content_files_delete"
    on storage.objects for delete
    to authenticated
    using (bucket_id = 'content-files' and owner::uuid = auth.uid());
exception when duplicate_object then null;
end $$;


-- ============================================================
-- MIGRATION TRACKING
-- Pre-populate so that npm run db:migrate knows all incremental
-- files have already been applied via this full-schema install.
-- ============================================================

create table if not exists schema_migrations (
  filename   text primary key,
  applied_at timestamptz not null default now()
);

insert into schema_migrations (filename) values
  ('migrate_v2.sql'),
  ('migrate_v3.sql'),
  ('migrate_v4.sql'),
  ('migrate_v5.sql'),
  ('migrate_v6.sql'),
  ('migrate_v7.sql')
on conflict (filename) do nothing;
