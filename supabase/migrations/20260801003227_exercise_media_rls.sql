-- Private storage bucket for user-uploaded exercise demo images/video.
-- Policies mirror machine-photos (owner-sub path prefix) — see AGENTS.md /
-- 20260715053951_parched_firedrake.sql for why auth.jwt()->>'sub', not
-- auth.uid(): owner_id is the Clerk JWT sub claim as text, not a Postgres
-- auth uuid.
-- A demo clip is uploaded byte-for-byte (only images are resized client-side),
-- so the bucket carries the same 50 MB ceiling the editor refuses above —
-- storage is the authority, the client check is only there to say so while
-- the sheet is still open.
insert into storage.buckets (id, name, public, file_size_limit)
values ('exercise-media', 'exercise-media', false, 52428800)
on conflict (id) do update set file_size_limit = excluded.file_size_limit;

create policy "exercise_media_storage_select" on storage.objects
  for select using (
    bucket_id = 'exercise-media'
    and (storage.foldername(name))[1] = (select auth.jwt()->>'sub')
  );
create policy "exercise_media_storage_insert" on storage.objects
  for insert with check (
    bucket_id = 'exercise-media'
    and (storage.foldername(name))[1] = (select auth.jwt()->>'sub')
  );
create policy "exercise_media_storage_update" on storage.objects
  for update using (
    bucket_id = 'exercise-media'
    and (storage.foldername(name))[1] = (select auth.jwt()->>'sub')
  );
create policy "exercise_media_storage_delete" on storage.objects
  for delete using (
    bucket_id = 'exercise-media'
    and (storage.foldername(name))[1] = (select auth.jwt()->>'sub')
  );
