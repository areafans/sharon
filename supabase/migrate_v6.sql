-- ============================================================
-- SE Content Hub — Migration v6
-- Allow any authenticated user to delete any content item.
-- This is an internal tool; restricting deletes to the uploader
-- only creates friction without meaningful security benefit.
-- ============================================================

-- Drop the uploader-only delete policy and replace with auth-only
drop policy if exists "content_delete_own" on public.content_items;

create policy "content_delete_auth"
  on public.content_items
  for delete
  using (auth.uid() is not null);
