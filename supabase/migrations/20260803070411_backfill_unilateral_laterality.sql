-- Backfill laterality on the global (owner_id is null) seed exercises by name
-- heuristic — see docs/DECISIONS.md 2026-08-01. `laterality` is nullable with
-- no default, so without this the unilateral-set feature is invisible until a
-- user opens the exercise editor themselves. Seed rows are read-only to every
-- user (RLS), so there is no user data to clobber.
--
-- Deliberately excluded: lunge / split squat / step-up / bulgarian rows whose
-- name does not itself say "single-leg"/"alternating" — a plain "Bulgarian
-- Split Squat" is unilateral and a plain "Walking Lunge" is alternating, but
-- the name alone doesn't say which. Those stay laterality = null.

update exercises
set laterality = 'unilateral'
where owner_id is null
  and laterality is null
  and name ~* '(one|single)[- ]?(arm|leg|side)|unilateral';

update exercises
set laterality = 'alternating'
where owner_id is null
  and laterality is null
  and name ~* 'alternat';
