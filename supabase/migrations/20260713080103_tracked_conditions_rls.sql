-- tracked_conditions: owner-scoped, no seed rows. Each row is a user's explicit
-- choice to track (or hide) a condition; the default set lives in app code.
alter table "tracked_conditions" enable row level security;

create policy "tracked_conditions_select" on "tracked_conditions"
  for select using (owner_id = (select auth.uid()));
create policy "tracked_conditions_insert" on "tracked_conditions"
  for insert with check (owner_id = (select auth.uid()));
create policy "tracked_conditions_update" on "tracked_conditions"
  for update using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));
create policy "tracked_conditions_delete" on "tracked_conditions"
  for delete using (owner_id = (select auth.uid()));
