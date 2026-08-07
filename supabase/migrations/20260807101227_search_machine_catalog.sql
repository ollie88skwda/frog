-- Server-side machine-catalog search for the lookup-UX phase (machine-DB plan
-- §6, docs/DECISIONS.md 2026-08-07 "machine-catalog phase 3").
--
-- Why an RPC function instead of PostgREST filters: the search must match a
-- whitespace term against brand / model / category AND any element of the
-- `aliases` jsonb array (a user may type a model code like "G628" that appears
-- only in aliases). PostgREST's `or()` filter cannot express ILIKE over a
-- jsonb array element, and the phase-1 RLS migration already grants the
-- `authenticated` role full DML gated by policy — a SECURITY INVOKER function
-- reads through the same RLS, so seed rows (owner_id null) resolve and nothing
-- is exposed that the table's own select policy would not admit.
--
-- Deliberately NOT pg_trgm: at 867 rows a seq scan is sub-millisecond and the
-- search is plain AND-ed ILIKE (the same interaction the static array's
-- searchCatalog had), not similarity ranking. The trigram index stays deferred
-- (as the phase-1 decision promised) until the catalog grows enough or ranked
-- results are wanted — measured, not guessed.
--
-- Terms are AND-ed: every whitespace-separated term must hit brand, model,
-- category, or an alias. An empty/whitespace query returns the category
-- filter's full set (browse mode). The filter parameter is named `cat`, not
-- `category`, because an unqualified identifier in a SQL-function body
-- resolves to the COLUMN first (PostgreSQL precedence) — `category is null`
-- would have read the column and silently disabled the filter.
create or replace function public.search_machine_catalog(
  q text,
  cat text default null,
  max_rows int default 20
)
returns table (
  id uuid,
  brand text,
  model text,
  aliases jsonb,
  category text
)
language sql
stable
security invoker
set search_path = public
as $$
  with terms as (
    select regexp_split_to_table(lower(btrim(q)), '\s+') as term
  )
  select mc.id, mc.brand, mc.model, mc.aliases, mc.category
  from machine_catalog mc
  where mc.deleted_at is null
    and (cat is null or mc.category = cat)
    and (
      q is null
      or btrim(q) = ''
      or not exists (
        select 1 from terms t
        where not (
          mc.brand ilike '%' || t.term || '%'
          or mc.model ilike '%' || t.term || '%'
          or mc.category ilike '%' || t.term || '%'
          or exists (
            select 1 from jsonb_array_elements_text(mc.aliases) a
            where a ilike '%' || t.term || '%'
          )
        )
      )
    )
  order by mc.brand, mc.model
  limit max_rows;
$$;

-- Browse-by-category needs the distinct category set; a plain PostgREST
-- select can't dedupe, so the SQL does.
create or replace function public.list_machine_categories()
returns table (category text)
language sql
stable
security invoker
set search_path = public
as $$
  select distinct mc.category
  from machine_catalog mc
  where mc.deleted_at is null
  order by mc.category;
$$;

-- Read-only lookups used only by the app's authenticated requests (Clerk
-- session token → role=authenticated). Execute stays default-granted to
-- PUBLIC but the function's table reads fail closed for `anon` (zero table
-- privileges per 20260716051430_revoke_anon_grants.sql), so stating the
-- authenticated grant keeps the posture explicit.
grant execute on function public.search_machine_catalog(text, text, int) to authenticated;
grant execute on function public.list_machine_categories() to authenticated;
