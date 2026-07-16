-- Hevy-parity schema batch: RLS for all new tables, storage buckets for
-- workout/progress photos, and seed-stamp of exercise type/equipment on the
-- 20 curated seed exercises.
-- All new tables are strictly owner-scoped (no seed rows); policy pattern
-- follows exercise_favorites_rls.

-- routine_folders
alter table "routine_folders" enable row level security;
create policy "routine_folders_select" on "routine_folders"
  for select using (owner_id = (select auth.uid()));
create policy "routine_folders_insert" on "routine_folders"
  for insert with check (owner_id = (select auth.uid()));
create policy "routine_folders_update" on "routine_folders"
  for update using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));
create policy "routine_folders_delete" on "routine_folders"
  for delete using (owner_id = (select auth.uid()));

-- routines
alter table "routines" enable row level security;
create policy "routines_select" on "routines"
  for select using (owner_id = (select auth.uid()));
create policy "routines_insert" on "routines"
  for insert with check (owner_id = (select auth.uid()));
create policy "routines_update" on "routines"
  for update using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));
create policy "routines_delete" on "routines"
  for delete using (owner_id = (select auth.uid()));

-- routine_exercises
alter table "routine_exercises" enable row level security;
create policy "routine_exercises_select" on "routine_exercises"
  for select using (owner_id = (select auth.uid()));
create policy "routine_exercises_insert" on "routine_exercises"
  for insert with check (owner_id = (select auth.uid()));
create policy "routine_exercises_update" on "routine_exercises"
  for update using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));
create policy "routine_exercises_delete" on "routine_exercises"
  for delete using (owner_id = (select auth.uid()));

-- routine_sets
alter table "routine_sets" enable row level security;
create policy "routine_sets_select" on "routine_sets"
  for select using (owner_id = (select auth.uid()));
create policy "routine_sets_insert" on "routine_sets"
  for insert with check (owner_id = (select auth.uid()));
create policy "routine_sets_update" on "routine_sets"
  for update using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));
create policy "routine_sets_delete" on "routine_sets"
  for delete using (owner_id = (select auth.uid()));

-- programs
alter table "programs" enable row level security;
create policy "programs_select" on "programs"
  for select using (owner_id = (select auth.uid()));
create policy "programs_insert" on "programs"
  for insert with check (owner_id = (select auth.uid()));
create policy "programs_update" on "programs"
  for update using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));
create policy "programs_delete" on "programs"
  for delete using (owner_id = (select auth.uid()));

-- measurements
alter table "measurements" enable row level security;
create policy "measurements_select" on "measurements"
  for select using (owner_id = (select auth.uid()));
create policy "measurements_insert" on "measurements"
  for insert with check (owner_id = (select auth.uid()));
create policy "measurements_update" on "measurements"
  for update using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));
create policy "measurements_delete" on "measurements"
  for delete using (owner_id = (select auth.uid()));

-- exercise_prefs
alter table "exercise_prefs" enable row level security;
create policy "exercise_prefs_select" on "exercise_prefs"
  for select using (owner_id = (select auth.uid()));
create policy "exercise_prefs_insert" on "exercise_prefs"
  for insert with check (owner_id = (select auth.uid()));
create policy "exercise_prefs_update" on "exercise_prefs"
  for update using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));
create policy "exercise_prefs_delete" on "exercise_prefs"
  for delete using (owner_id = (select auth.uid()));

-- user_prefs
alter table "user_prefs" enable row level security;
create policy "user_prefs_select" on "user_prefs"
  for select using (owner_id = (select auth.uid()));
create policy "user_prefs_insert" on "user_prefs"
  for insert with check (owner_id = (select auth.uid()));
create policy "user_prefs_update" on "user_prefs"
  for update using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));
create policy "user_prefs_delete" on "user_prefs"
  for delete using (owner_id = (select auth.uid()));

-- session_media
alter table "session_media" enable row level security;
create policy "session_media_select" on "session_media"
  for select using (owner_id = (select auth.uid()));
create policy "session_media_insert" on "session_media"
  for insert with check (owner_id = (select auth.uid()));
create policy "session_media_update" on "session_media"
  for update using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));
create policy "session_media_delete" on "session_media"
  for delete using (owner_id = (select auth.uid()));

-- push_subscriptions
alter table "push_subscriptions" enable row level security;
create policy "push_subscriptions_select" on "push_subscriptions"
  for select using (owner_id = (select auth.uid()));
create policy "push_subscriptions_insert" on "push_subscriptions"
  for insert with check (owner_id = (select auth.uid()));
create policy "push_subscriptions_update" on "push_subscriptions"
  for update using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));
create policy "push_subscriptions_delete" on "push_subscriptions"
  for delete using (owner_id = (select auth.uid()));

-- Private storage buckets for workout photos + progress photos; policies
-- mirror machine-photos (owner-uuid path prefix).
insert into storage.buckets (id, name, public)
values
  ('session-media', 'session-media', false),
  ('progress-photos', 'progress-photos', false)
on conflict (id) do nothing;

create policy "session_media_storage_select" on storage.objects
  for select using (
    bucket_id = 'session-media'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
create policy "session_media_storage_insert" on storage.objects
  for insert with check (
    bucket_id = 'session-media'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
create policy "session_media_storage_delete" on storage.objects
  for delete using (
    bucket_id = 'session-media'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "progress_photos_storage_select" on storage.objects
  for select using (
    bucket_id = 'progress-photos'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
create policy "progress_photos_storage_insert" on storage.objects
  for insert with check (
    bucket_id = 'progress-photos'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
create policy "progress_photos_storage_delete" on storage.objects
  for delete using (
    bucket_id = 'progress-photos'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

-- Seed-stamp equipment + exercise type on the 20 curated seeds.
-- All stay the default weight_reps except Pull-Up (weighted_bodyweight:
-- volume = reps × (bodyweight + added weight)).
update "exercises" set "equipment" = 'barbell'
  where owner_id is null and name in (
    'Squat','Front Squat','Romanian Deadlift','Deadlift','Bench Press',
    'Incline Bench Press','Overhead Press','Barbell Row'
  );
update "exercises" set "equipment" = 'dumbbell'
  where owner_id is null and name in (
    'Dumbbell Bench Press','Lateral Raise','Bicep Curl'
  );
update "exercises" set "equipment" = 'machine'
  where owner_id is null and name in (
    'Leg Press','Leg Extension','Leg Curl','Calf Raise'
  );
update "exercises" set "equipment" = 'cable'
  where owner_id is null and name in (
    'Seated Cable Row','Lat Pulldown','Tricep Pushdown','Face Pull'
  );
update "exercises"
  set "equipment" = 'bodyweight', "exercise_type" = 'weighted_bodyweight'
  where owner_id is null and name = 'Pull-Up';
