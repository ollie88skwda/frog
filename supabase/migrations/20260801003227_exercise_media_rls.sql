-- Private storage bucket for user-uploaded exercise demo images/video.
-- Policies mirror machine-photos (owner-sub path prefix) — see AGENTS.md /
-- 20260715053951_parched_firedrake.sql for why auth.jwt()->>'sub', not
-- auth.uid(): owner_id is the Clerk JWT sub claim as text, not a Postgres
-- auth uuid.
insert into storage.buckets (id, name, public)
values ('exercise-media', 'exercise-media', false)
on conflict (id) do nothing;

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
