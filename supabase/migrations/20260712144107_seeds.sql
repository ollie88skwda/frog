-- Global seed rows (owner_id null): readable by every user via RLS, never
-- writable by clients. Fixed UUIDs so re-running environments stay stable.

-- Seed exercises (~20 common lifts; is_custom = false).
insert into "exercises" (id, created_at, updated_at, owner_id, name, is_custom)
values
  ('00000000-0000-4000-8000-000000000001', (extract(epoch from now()) * 1000)::bigint, (extract(epoch from now()) * 1000)::bigint, null, 'Squat', false),
  ('00000000-0000-4000-8000-000000000002', (extract(epoch from now()) * 1000)::bigint, (extract(epoch from now()) * 1000)::bigint, null, 'Front Squat', false),
  ('00000000-0000-4000-8000-000000000003', (extract(epoch from now()) * 1000)::bigint, (extract(epoch from now()) * 1000)::bigint, null, 'Leg Press', false),
  ('00000000-0000-4000-8000-000000000004', (extract(epoch from now()) * 1000)::bigint, (extract(epoch from now()) * 1000)::bigint, null, 'Romanian Deadlift', false),
  ('00000000-0000-4000-8000-000000000005', (extract(epoch from now()) * 1000)::bigint, (extract(epoch from now()) * 1000)::bigint, null, 'Deadlift', false),
  ('00000000-0000-4000-8000-000000000006', (extract(epoch from now()) * 1000)::bigint, (extract(epoch from now()) * 1000)::bigint, null, 'Leg Extension', false),
  ('00000000-0000-4000-8000-000000000007', (extract(epoch from now()) * 1000)::bigint, (extract(epoch from now()) * 1000)::bigint, null, 'Leg Curl', false),
  ('00000000-0000-4000-8000-000000000008', (extract(epoch from now()) * 1000)::bigint, (extract(epoch from now()) * 1000)::bigint, null, 'Calf Raise', false),
  ('00000000-0000-4000-8000-000000000009', (extract(epoch from now()) * 1000)::bigint, (extract(epoch from now()) * 1000)::bigint, null, 'Bench Press', false),
  ('00000000-0000-4000-8000-00000000000a', (extract(epoch from now()) * 1000)::bigint, (extract(epoch from now()) * 1000)::bigint, null, 'Incline Bench Press', false),
  ('00000000-0000-4000-8000-00000000000b', (extract(epoch from now()) * 1000)::bigint, (extract(epoch from now()) * 1000)::bigint, null, 'Dumbbell Bench Press', false),
  ('00000000-0000-4000-8000-00000000000c', (extract(epoch from now()) * 1000)::bigint, (extract(epoch from now()) * 1000)::bigint, null, 'Overhead Press', false),
  ('00000000-0000-4000-8000-00000000000d', (extract(epoch from now()) * 1000)::bigint, (extract(epoch from now()) * 1000)::bigint, null, 'Lateral Raise', false),
  ('00000000-0000-4000-8000-00000000000e', (extract(epoch from now()) * 1000)::bigint, (extract(epoch from now()) * 1000)::bigint, null, 'Barbell Row', false),
  ('00000000-0000-4000-8000-00000000000f', (extract(epoch from now()) * 1000)::bigint, (extract(epoch from now()) * 1000)::bigint, null, 'Seated Cable Row', false),
  ('00000000-0000-4000-8000-000000000010', (extract(epoch from now()) * 1000)::bigint, (extract(epoch from now()) * 1000)::bigint, null, 'Lat Pulldown', false),
  ('00000000-0000-4000-8000-000000000011', (extract(epoch from now()) * 1000)::bigint, (extract(epoch from now()) * 1000)::bigint, null, 'Pull-Up', false),
  ('00000000-0000-4000-8000-000000000012', (extract(epoch from now()) * 1000)::bigint, (extract(epoch from now()) * 1000)::bigint, null, 'Bicep Curl', false),
  ('00000000-0000-4000-8000-000000000013', (extract(epoch from now()) * 1000)::bigint, (extract(epoch from now()) * 1000)::bigint, null, 'Tricep Pushdown', false),
  ('00000000-0000-4000-8000-000000000014', (extract(epoch from now()) * 1000)::bigint, (extract(epoch from now()) * 1000)::bigint, null, 'Face Pull', false)
on conflict (id) do nothing;

-- Seed session-condition metrics (PRD §6.2). Values live in
-- sessions.condition_values keyed by these ids.
insert into "metrics" (id, created_at, updated_at, owner_id, name, type, scope)
values
  ('00000000-0000-4000-8000-0000000000a1', (extract(epoch from now()) * 1000)::bigint, (extract(epoch from now()) * 1000)::bigint, null, 'Sleep (h)', 'number', 'session'),
  ('00000000-0000-4000-8000-0000000000a2', (extract(epoch from now()) * 1000)::bigint, (extract(epoch from now()) * 1000)::bigint, null, 'Bodyweight', 'number', 'session'),
  ('00000000-0000-4000-8000-0000000000a3', (extract(epoch from now()) * 1000)::bigint, (extract(epoch from now()) * 1000)::bigint, null, 'Pre-workout carbs (g)', 'number', 'session'),
  ('00000000-0000-4000-8000-0000000000a4', (extract(epoch from now()) * 1000)::bigint, (extract(epoch from now()) * 1000)::bigint, null, 'Caffeine (mg)', 'number', 'session'),
  ('00000000-0000-4000-8000-0000000000a5', (extract(epoch from now()) * 1000)::bigint, (extract(epoch from now()) * 1000)::bigint, null, 'Stress (1–10)', 'scale', 'session'),
  ('00000000-0000-4000-8000-0000000000a6', (extract(epoch from now()) * 1000)::bigint, (extract(epoch from now()) * 1000)::bigint, null, 'Last meal (h before)', 'number', 'session'),
  ('00000000-0000-4000-8000-0000000000a7', (extract(epoch from now()) * 1000)::bigint, (extract(epoch from now()) * 1000)::bigint, null, 'Meal note', 'text', 'session')
on conflict (id) do nothing;
