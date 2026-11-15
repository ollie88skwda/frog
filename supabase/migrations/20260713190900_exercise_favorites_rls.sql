-- exercise_favorites: owner-scoped, no seed rows. Works on shared seed
-- exercises too since favoriting lives in its own table, not a column on
-- the shared exercise row.
alter table "exercise_favorites" enable row level security;

create policy "exercise_favorites_select" on "exercise_favorites"
  for select using (owner_id = (select auth.uid()));
create policy "exercise_favorites_insert" on "exercise_favorites"
  for insert with check (owner_id = (select auth.uid()));
create policy "exercise_favorites_update" on "exercise_favorites"
  for update using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));
create policy "exercise_favorites_delete" on "exercise_favorites"
  for delete using (owner_id = (select auth.uid()));
