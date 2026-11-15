-- Public exercise publishing (frog-community-direction phase 1,
-- docs/DECISIONS.md 2026-08-08). The captain-approved population phase:
-- "when I add an exercise to the exercise library, it adds to everyone's
-- library." A published exercise is an ordinary seed-posture row —
-- owner_id null (RLS: readable by every authenticated user, writable by no
-- one) + is_custom true + created_by = the publisher's JWT `sub`.
--
-- Why an RPC instead of relaxing the exercises insert policy? The RLS policy
-- template in 20260715053951_parched_firedrake.sql is a documented security
-- contract — "`or owner_id is null` must never appear outside the two
-- seedable SELECTs; it would let any user create/edit global seed rows
-- visible to everyone". Relaxing it is a two-line hack that must be reverted
-- later anyway. This SECURITY DEFINER function is the smaller deviation and
-- the permanent home for everything the shared-insert path needs in one
-- place: payload validation, the dedupe backstop, a generous dev-mode rate
-- limit, and the revocable off-switch (revoke execute — see below).
--
-- SECURITY DEFINER means the body runs as the migration's owner (postgres),
-- bypassing RLS on exercises — which is exactly the point: only this function
-- can write owner_id null rows, and only through its validated field
-- whitelist. The signature IS the whitelist: machine_id / media_path /
-- media_type are not parameters (both are owner-private per the plan —
-- photos and machine links must never ride a shared row), and the caller's
-- identity comes from auth.jwt()->>'sub', never from a parameter.
--
-- Revert story (dev phase off-switch): `revoke execute on function
-- public.publish_exercise(...) from authenticated` stops new shared rows at
-- the server; COMMUNITY_SHARING = false in packages/core/src/config.ts stops
-- the app offering the path. Existing shared rows stay — they are ordinary
-- seed-posture rows. A full rollback of created rows would be a soft-delete
-- migration, never a hard delete.
--
-- Language is plpgsql, not the sql the repo's read-only RPCs use: validation
-- and the rate limit need control flow (raises), which a pure-SQL function
-- cannot express. Security posture is identical (security definer +
-- search_path pinned).
create or replace function public.publish_exercise(
  p_id uuid,
  p_name text,
  p_tags jsonb default null,
  p_joint_actions jsonb default null,
  p_muscle_targets jsonb default null,
  p_exercise_type text default 'weight_reps',
  p_equipment text default null,
  p_instructions jsonb default null,
  p_image_urls jsonb default null,
  p_mechanic text default null,
  p_movement_pattern text default null,
  p_laterality text default null,
  p_default_reps_min int default null,
  p_default_reps_max int default null,
  p_default_rest_sec int default null,
  p_notes text default null,
  p_aliases jsonb default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_author text := auth.jwt()->>'sub';
  v_now bigint := (extract(epoch from now()) * 1000)::bigint;
  v_existing uuid;
  v_recent int;
begin
  -- Author must be signed in — the function is authenticated-granted, but
  -- state it explicitly: an anonymous JWT would otherwise slip through as a
  -- created_by null row (the same failure the template guards against).
  if v_author is null or v_author = '' then
    raise exception 'publish_exercise: not signed in';
  end if;

  -- Validation. Names are trimmed, budgeted (the longest seed name is ~40
  -- chars; 80 leaves room) and HTML-free (they render in the editor).
  p_name := btrim(p_name);
  if p_name = '' then
    raise exception 'publish_exercise: name is required';
  end if;
  if char_length(p_name) > 80 then
    raise exception 'publish_exercise: name is too long';
  end if;
  if p_name like '%<%' or p_name like '%>%' then
    raise exception 'publish_exercise: name may not contain HTML';
  end if;
  if p_notes is not null and (p_notes like '%<%' or p_notes like '%>%') then
    raise exception 'publish_exercise: notes may not contain HTML';
  end if;

  -- Shape checks on the jsonb fields (the app validates fully; this bounds
  -- the abuse surface for direct RPC callers).
  if p_muscle_targets is not null then
    if jsonb_typeof(p_muscle_targets) <> 'array' then
      raise exception 'publish_exercise: muscle_targets must be an array';
    end if;
    if exists (
      select 1 from jsonb_array_elements(p_muscle_targets) el
      where el->>'muscle' is null or el->>'muscle' = ''
    ) then
      raise exception 'publish_exercise: muscle_targets entries need a muscle';
    end if;
  end if;
  if p_aliases is not null then
    if jsonb_typeof(p_aliases) <> 'array' then
      raise exception 'publish_exercise: aliases must be an array';
    end if;
    if exists (
      select 1 from jsonb_array_elements_text(p_aliases) a
      where a = '' or a like '%<%' or a like '%>%'
    ) then
      raise exception 'publish_exercise: aliases must be non-empty plain text';
    end if;
  end if;

  -- Rate limit (dev-mode generous; Phase 4 of the plan tunes this before any
  -- non-friends launch — see docs/DECISIONS.md 2026-08-08). 1000/hour is not
  -- a coincidence: the E2E suite publishes ~100 rows in a single ~10-minute
  -- run (one uniquely-named exercise per spec, all inside the 1-hour window),
  -- so the limit must clear that with headroom or the suite itself trips it
  -- (voice-log's "Rear Delt Flyes" was the 101st publish and got refused).
  select count(*) into v_recent
  from exercises
  where created_by = v_author
    and deleted_at is null
    and created_at > v_now - 3600000;
  if v_recent >= 1000 then
    raise exception 'publish_exercise: too many exercises shared recently — try again later';
  end if;

  -- Dedupe backstop: a case-insensitive name hit among the existing global
  -- rows returns the canonical row's id instead of inserting a duplicate.
  -- (The client warns first via matchExerciseName — this is the server side
  -- of the same warn + backstop story.)
  select e.id into v_existing
  from exercises e
  where e.owner_id is null
    and e.deleted_at is null
    and lower(e.name) = lower(p_name)
  limit 1;
  if v_existing is not null then
    return v_existing;
  end if;

  -- Insert, idempotent on the client-generated uuid (the Repo.logSet
  -- contract: retries must not duplicate — on conflict the row already
  -- landed, and the caller just needs its id back).
  insert into exercises (
    id, created_at, updated_at, owner_id, created_by, name, tags, is_custom,
    joint_actions, muscle_targets, exercise_type, equipment, instructions,
    image_urls, mechanic, movement_pattern, laterality,
    default_reps_min, default_reps_max, default_rest_sec, notes, aliases
  ) values (
    p_id, v_now, v_now, null, v_author, p_name, p_tags, true,
    p_joint_actions, p_muscle_targets, p_exercise_type, p_equipment, p_instructions,
    p_image_urls, p_mechanic, p_movement_pattern, p_laterality,
    p_default_reps_min, p_default_reps_max, p_default_rest_sec, p_notes, p_aliases
  )
  on conflict (id) do nothing;

  -- The conflict path: the id already exists (a retried publish that landed,
  -- or — astronomically — a uuid collision). Return that id so the caller
  -- resolves to the real row either way.
  select e.id into v_existing
  from exercises e
  where e.id = p_id and e.deleted_at is null;
  return coalesce(v_existing, p_id);
end;
$$;

-- Same grant pattern as search_machine_catalog / list_machine_categories:
-- execute-granted to `authenticated` only. `anon` has zero table privileges
-- (20260716051430_revoke_anon_grants.sql), so an unauthenticated call fails
-- closed; the function's own signed-in check backs that up.
grant execute on function public.publish_exercise(
  uuid, text, jsonb, jsonb, jsonb, text, text, jsonb, jsonb,
  text, text, text, int, int, int, text, jsonb
) to authenticated;
