-- Defense in depth: strip the `anon` role's table privileges in public.
--
-- Why this exists: local Supabase images ship hardened default privileges
-- (anon gets no DML on new tables), but a HOSTED project grants anon full
-- DML — SELECT/INSERT/UPDATE/DELETE/TRUNCATE — on every table in public, with
-- RLS as the only thing between the public anon key and the data.
-- 20260712162800_grants.sql only ever *added* grants for authenticated, so it
-- never noticed the difference and the posture silently diverged by
-- environment (verified 2026-07-15: anon could read seed rows on hosted while
-- being denied locally).
--
-- Nothing in Frog uses the anon role: the web client sends a Clerk token
-- (role=authenticated) on every request, and the PAT API runs service-role.
-- An unauthenticated request should fail closed on privileges rather than
-- lean on every policy evaluating `owner_id = null` to false — that keeps a
-- future table with RLS forgotten, or one malformed policy, from becoming a
-- breach.
--
-- Schema USAGE stays granted (harmless without table privileges, and
-- PostgREST needs it to resolve names before the JWT's role is applied).

revoke all on all tables in schema public from anon;
--> statement-breakpoint
revoke all on all sequences in schema public from anon;
--> statement-breakpoint

-- Future tables must not silently re-grant anon. Default privileges are
-- per-granting-role, so cover the roles that create objects here.
alter default privileges in schema public revoke all on tables from anon;
--> statement-breakpoint
alter default privileges in schema public revoke all on sequences from anon;
--> statement-breakpoint
alter default privileges for role postgres in schema public revoke all on tables from anon;
--> statement-breakpoint
alter default privileges for role postgres in schema public revoke all on sequences from anon;
--> statement-breakpoint

-- Assert: anon must hold zero table privileges in public afterwards.
do $$
declare n int;
begin
  select count(*) into n
  from information_schema.role_table_grants
  where table_schema = 'public' and grantee = 'anon';
  if n > 0 then
    raise exception 'anon still holds % table privileges in public', n;
  end if;
end $$;
