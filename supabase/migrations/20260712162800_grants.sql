-- Newer Supabase local images ship hardened default privileges: roles get no
-- DML on new tables. Grant table access explicitly — row isolation remains
-- enforced by the RLS policies; grants only open the tables to PostgREST.
grant usage on schema public to anon, authenticated, service_role;

grant select, insert, update, delete on all tables in schema public
  to authenticated, service_role;

alter default privileges in schema public
  grant select, insert, update, delete on tables
  to authenticated, service_role;
