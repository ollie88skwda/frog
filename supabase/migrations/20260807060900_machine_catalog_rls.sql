-- machine_catalog: global reference catalog, mirrors the `exercises`/`metrics`
-- seed-row posture exactly (docs/DECISIONS.md 2026-07-12: seed rows readable
-- by all, writable only by migrations). v1 has no owner-authored rows — every
-- row is owner_id null, seeded by 20260807060910_seed_machine_catalog.sql —
-- but the policies still admit an owner-authored row for parity with
-- exercises/metrics in case a later phase allows user-submitted entries.
--
-- Policy template per 20260715053951_parched_firedrake.sql (post-Clerk-switch
-- convention — owner_id is text, compared against the JWT `sub` claim, NOT
-- auth.uid() which casts to uuid and fails for Clerk's "user_…" ids):
--   select: owner_id = (select auth.jwt()->>'sub') or owner_id is null
--   insert/update/delete: owner_id = (select auth.jwt()->>'sub')
alter table "machine_catalog" enable row level security;

create policy "machine_catalog_select" on "machine_catalog"
  for select using (owner_id = (select auth.jwt()->>'sub') or owner_id is null);
create policy "machine_catalog_insert" on "machine_catalog"
  for insert with check (owner_id = (select auth.jwt()->>'sub'));
create policy "machine_catalog_update" on "machine_catalog"
  for update using (owner_id = (select auth.jwt()->>'sub'))
  with check (owner_id = (select auth.jwt()->>'sub'));
create policy "machine_catalog_delete" on "machine_catalog"
  for delete using (owner_id = (select auth.jwt()->>'sub'));
