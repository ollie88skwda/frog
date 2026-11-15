-- Clerk third-party auth: owner_id uuid → text, keyed on the JWT `sub` claim.
-- Clerk user IDs ("user_…") are not uuids, so auth.uid() (which casts sub to
-- uuid) no longer works. Policies compare owner_id to auth.jwt()->>'sub' as
-- text — correct for both Clerk tokens and Supabase-native (E2E) sessions,
-- whose sub is the user's uuid as a string.
--
-- Policy template (per security review — do not deviate):
--   select: owner_id = (select auth.jwt()->>'sub')
--           [+ `or owner_id is null` ONLY on exercises/metrics seed reads]
--   insert: with check (owner_id = (select auth.jwt()->>'sub'))
--   update: BOTH using AND with check
--   delete: using
-- `or owner_id is null` must never appear outside the two seedable SELECTs —
-- it would let any user create/edit global seed rows visible to everyone.
-- anon keeps zero table grants (see 20260712162800_grants.sql); a missing
-- token fails closed. Never grant anon SELECT to "fix" boot-time auth races.

-- 1. Drop every RLS policy (they depend on owner_id and block the type change).
do $$
declare p record;
begin
  for p in
    select schemaname, tablename, policyname from pg_policies
    where schemaname = 'public'
       or (schemaname = 'storage' and tablename = 'objects')
  loop
    execute format('drop policy %I on %I.%I', p.policyname, p.schemaname, p.tablename);
  end loop;
end $$;
--> statement-breakpoint

-- 2. owner_id: drop uuid default, retype to text, set the jwt-sub default.
do $$
declare c record;
begin
  for c in
    select table_name from information_schema.columns
    where table_schema = 'public' and column_name = 'owner_id'
  loop
    execute format('alter table public.%I alter column owner_id drop default', c.table_name);
    execute format('alter table public.%I alter column owner_id set data type text using owner_id::text', c.table_name);
    execute format('alter table public.%I alter column owner_id set default (auth.jwt()->>''sub'')', c.table_name);
  end loop;
end $$;
--> statement-breakpoint

-- 3. Recreate table policies from the template above.
do $$
declare
  t record;
  sub constant text := '(select auth.jwt()->>''sub'')';
  seed_or text;
begin
  for t in
    select table_name from information_schema.columns
    where table_schema = 'public' and column_name = 'owner_id'
  loop
    seed_or := case
      when t.table_name in ('exercises', 'metrics') then ' or owner_id is null'
      else ''
    end;
    execute format(
      'create policy %I on public.%I for select using (owner_id = %s%s)',
      t.table_name || '_select', t.table_name, sub, seed_or);
    execute format(
      'create policy %I on public.%I for insert with check (owner_id = %s)',
      t.table_name || '_insert', t.table_name, sub);
    execute format(
      'create policy %I on public.%I for update using (owner_id = %s) with check (owner_id = %s)',
      t.table_name || '_update', t.table_name, sub, sub);
    execute format(
      'create policy %I on public.%I for delete using (owner_id = %s)',
      t.table_name || '_delete', t.table_name, sub);
  end loop;
end $$;
--> statement-breakpoint

-- 4. Recreate storage policies (owner-sub path prefix, private buckets).
create policy "machine_photos_select" on storage.objects
  for select using (
    bucket_id = 'machine-photos'
    and (storage.foldername(name))[1] = (select auth.jwt()->>'sub')
  );
--> statement-breakpoint
create policy "machine_photos_insert" on storage.objects
  for insert with check (
    bucket_id = 'machine-photos'
    and (storage.foldername(name))[1] = (select auth.jwt()->>'sub')
  );
--> statement-breakpoint
create policy "machine_photos_update" on storage.objects
  for update using (
    bucket_id = 'machine-photos'
    and (storage.foldername(name))[1] = (select auth.jwt()->>'sub')
  );
--> statement-breakpoint
create policy "machine_photos_delete" on storage.objects
  for delete using (
    bucket_id = 'machine-photos'
    and (storage.foldername(name))[1] = (select auth.jwt()->>'sub')
  );
--> statement-breakpoint
create policy "session_media_storage_select" on storage.objects
  for select using (
    bucket_id = 'session-media'
    and (storage.foldername(name))[1] = (select auth.jwt()->>'sub')
  );
--> statement-breakpoint
create policy "session_media_storage_insert" on storage.objects
  for insert with check (
    bucket_id = 'session-media'
    and (storage.foldername(name))[1] = (select auth.jwt()->>'sub')
  );
--> statement-breakpoint
create policy "session_media_storage_delete" on storage.objects
  for delete using (
    bucket_id = 'session-media'
    and (storage.foldername(name))[1] = (select auth.jwt()->>'sub')
  );
--> statement-breakpoint
create policy "progress_photos_storage_select" on storage.objects
  for select using (
    bucket_id = 'progress-photos'
    and (storage.foldername(name))[1] = (select auth.jwt()->>'sub')
  );
--> statement-breakpoint
create policy "progress_photos_storage_insert" on storage.objects
  for insert with check (
    bucket_id = 'progress-photos'
    and (storage.foldername(name))[1] = (select auth.jwt()->>'sub')
  );
--> statement-breakpoint
create policy "progress_photos_storage_delete" on storage.objects
  for delete using (
    bucket_id = 'progress-photos'
    and (storage.foldername(name))[1] = (select auth.jwt()->>'sub')
  );
--> statement-breakpoint

-- 5. Post-migration asserts: fail loudly if anything was missed.
do $$
declare n int;
begin
  select count(*) into n from pg_policies
  where (schemaname = 'public' or (schemaname = 'storage' and tablename = 'objects'))
    and (coalesce(qual, '') like '%auth.uid()%' or coalesce(with_check, '') like '%auth.uid()%');
  if n > 0 then
    raise exception 'migration incomplete: % policies still reference auth.uid()', n;
  end if;

  select count(*) into n from information_schema.columns
  where table_schema = 'public' and column_name = 'owner_id' and data_type <> 'text';
  if n > 0 then
    raise exception 'migration incomplete: % owner_id columns are not text', n;
  end if;

  select count(*) into n from pg_policies where schemaname = 'public';
  if n <> 76 then
    raise exception 'expected 76 table policies (19 tables x 4), found %', n;
  end if;

  select count(*) into n from pg_policies
  where schemaname = 'storage' and tablename = 'objects';
  if n <> 10 then
    raise exception 'expected 10 storage policies, found %', n;
  end if;

  select count(*) into n from pg_policies
  where schemaname = 'public'
    and coalesce(qual, '') like '%owner_id is null%'
    and policyname not in ('exercises_select', 'metrics_select');
  if n > 0 then
    raise exception 'owner_id-is-null clause leaked beyond the seedable SELECTs (% policies)', n;
  end if;

  select count(*) into n from pg_policies
  where schemaname = 'public'
    and coalesce(with_check, '') like '%owner_id is null%';
  if n > 0 then
    raise exception 'owner_id-is-null clause leaked into a WITH CHECK (% policies)', n;
  end if;
end $$;
