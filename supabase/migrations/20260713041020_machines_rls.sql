-- machines: owner-scoped, no seed rows.
alter table "machines" enable row level security;

create policy "machines_select" on "machines"
  for select using (owner_id = (select auth.uid()));
create policy "machines_insert" on "machines"
  for insert with check (owner_id = (select auth.uid()));
create policy "machines_update" on "machines"
  for update using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));
create policy "machines_delete" on "machines"
  for delete using (owner_id = (select auth.uid()));

-- machine-photos: private storage bucket for user-taken machine photos.
-- Object paths are namespaced per user: <uid>/<machineId>.jpg
insert into storage.buckets (id, name, public)
values ('machine-photos', 'machine-photos', false)
on conflict (id) do nothing;

create policy "machine_photos_select" on storage.objects
  for select using (
    bucket_id = 'machine-photos'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
create policy "machine_photos_insert" on storage.objects
  for insert with check (
    bucket_id = 'machine-photos'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
create policy "machine_photos_update" on storage.objects
  for update using (
    bucket_id = 'machine-photos'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
create policy "machine_photos_delete" on storage.objects
  for delete using (
    bucket_id = 'machine-photos'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
