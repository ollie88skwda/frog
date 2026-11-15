-- Row-level security: every table is owner-scoped via owner_id.
-- exercises/metrics additionally expose global seed rows (owner_id is null).
-- The app never uses a service-role key; RLS is the only isolation layer.

-- exercises ------------------------------------------------------------------
alter table "exercises" enable row level security;

create policy "exercises_select" on "exercises"
  for select using (owner_id = (select auth.uid()) or owner_id is null);
create policy "exercises_insert" on "exercises"
  for insert with check (owner_id = (select auth.uid()));
create policy "exercises_update" on "exercises"
  for update using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));
create policy "exercises_delete" on "exercises"
  for delete using (owner_id = (select auth.uid()));

-- metrics --------------------------------------------------------------------
alter table "metrics" enable row level security;

create policy "metrics_select" on "metrics"
  for select using (owner_id = (select auth.uid()) or owner_id is null);
create policy "metrics_insert" on "metrics"
  for insert with check (owner_id = (select auth.uid()));
create policy "metrics_update" on "metrics"
  for update using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));
create policy "metrics_delete" on "metrics"
  for delete using (owner_id = (select auth.uid()));

-- sessions -------------------------------------------------------------------
alter table "sessions" enable row level security;

create policy "sessions_select" on "sessions"
  for select using (owner_id = (select auth.uid()));
create policy "sessions_insert" on "sessions"
  for insert with check (owner_id = (select auth.uid()));
create policy "sessions_update" on "sessions"
  for update using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));
create policy "sessions_delete" on "sessions"
  for delete using (owner_id = (select auth.uid()));

-- session_exercises ------------------------------------------------------------
alter table "session_exercises" enable row level security;

create policy "session_exercises_select" on "session_exercises"
  for select using (owner_id = (select auth.uid()));
create policy "session_exercises_insert" on "session_exercises"
  for insert with check (owner_id = (select auth.uid()));
create policy "session_exercises_update" on "session_exercises"
  for update using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));
create policy "session_exercises_delete" on "session_exercises"
  for delete using (owner_id = (select auth.uid()));

-- set_logs -------------------------------------------------------------------
alter table "set_logs" enable row level security;

create policy "set_logs_select" on "set_logs"
  for select using (owner_id = (select auth.uid()));
create policy "set_logs_insert" on "set_logs"
  for insert with check (owner_id = (select auth.uid()));
create policy "set_logs_update" on "set_logs"
  for update using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));
create policy "set_logs_delete" on "set_logs"
  for delete using (owner_id = (select auth.uid()));
