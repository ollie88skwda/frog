-- Sample user data for the import round-trip check
-- (scripts/convex/import-roundtrip.ts). Applied on top of the replayed
-- migrations, so the seed rows exist too. Two owners, every user table,
-- soft-deleted rows, a unilateral pair, json columns and a file path.
-- Owner ids use the e2e- prefix so the local test sweep can tidy them.
insert into machines (id, owner_id, created_at, updated_at, name, brand, settings, photo_path)
values ('11111111-0000-4000-8000-000000000001', 'e2e-import-a', 1783900000000, 1783900000000,
        'Leg Press', 'Hammer', '[{"label":"Seat","value":4},{"label":"Pad","value":null}]', null);

insert into exercises (id, owner_id, created_by, created_at, updated_at, name, is_custom, machine_id, muscle_targets, aliases)
values
  ('11111111-0000-4000-8000-000000000002', 'e2e-import-a', null, 1783900000001, 1783900000001,
   'Import Press', true, '11111111-0000-4000-8000-000000000001',
   '[{"muscle":"quads","tier":"A","role":"primary"}]', '["IP"]'),
  ('11111111-0000-4000-8000-000000000003', null, 'e2e-import-a', 1783900000002, 1783900000002,
   'Import Shared Lift', true, null, null, null);

insert into metrics (id, owner_id, created_at, updated_at, name, type, scope, unit)
values ('11111111-0000-4000-8000-000000000004', 'e2e-import-a', 1783900000003, 1783900000003,
        'Water', 'number', 'session', 'ml');

insert into tracked_conditions (id, owner_id, created_at, updated_at, metric_id, tracked)
values ('11111111-0000-4000-8000-000000000005', 'e2e-import-a', 1783900000004, 1783900000004,
        '11111111-0000-4000-8000-000000000004', true);

insert into routine_folders (id, owner_id, created_at, updated_at, name, position)
values ('11111111-0000-4000-8000-000000000006', 'e2e-import-a', 1783900000005, 1783900000005, 'Legs', 0);

insert into routines (id, owner_id, created_at, updated_at, name, folder_id, position)
values ('11111111-0000-4000-8000-000000000007', 'e2e-import-a', 1783900000006, 1783900000006,
        'Leg Day', '11111111-0000-4000-8000-000000000006', 0);

insert into routine_exercises (id, owner_id, created_at, updated_at, routine_id, exercise_id, order_index, rest_sec)
values ('11111111-0000-4000-8000-000000000008', 'e2e-import-a', 1783900000007, 1783900000007,
        '11111111-0000-4000-8000-000000000007', '11111111-0000-4000-8000-000000000002', 0, 120);

insert into routine_sets (id, owner_id, created_at, updated_at, routine_exercise_id, set_no, target_weight_kg, target_reps, laterality)
values ('11111111-0000-4000-8000-000000000009', 'e2e-import-a', 1783900000008, 1783900000008,
        '11111111-0000-4000-8000-000000000008', 0, 140.5, 8, 'unilateral');

insert into programs (id, owner_id, created_at, updated_at, source, folder_id, active)
values ('11111111-0000-4000-8000-00000000000a', 'e2e-import-a', 1783900000009, 1783900000009,
        'generated', '11111111-0000-4000-8000-000000000006', true);

insert into sessions (id, owner_id, created_at, updated_at, started_at, ended_at, title, routine_id, condition_values, notes)
values
  ('11111111-0000-4000-8000-00000000000b', 'e2e-import-a', 1783900000010, 1783900000010,
   1783900000010, 1783903600000, 'Imported legs', '11111111-0000-4000-8000-000000000007',
   '{"00000000-0000-4000-8000-000000000101": 7.5}', 'felt strong'),
  ('11111111-0000-4000-8000-00000000000c', 'e2e-import-a', 1783900000011, 1783900000999,
   1783900000011, null, 'Abandoned', null, null, null);
update sessions set deleted_at = 1783900000999 where id = '11111111-0000-4000-8000-00000000000c';

insert into session_exercises (id, owner_id, created_at, updated_at, session_id, exercise_id, order_index, routine_exercise_id)
values ('11111111-0000-4000-8000-00000000000d', 'e2e-import-a', 1783900000012, 1783900000012,
        '11111111-0000-4000-8000-00000000000b', '11111111-0000-4000-8000-000000000002', 0,
        '11111111-0000-4000-8000-000000000008');

insert into set_logs (id, owner_id, created_at, updated_at, session_exercise_id, set_no, side, weight_kg, reps, rir, completed)
values
  ('11111111-0000-4000-8000-00000000000e', 'e2e-import-a', 1783900000013, 1783900000013,
   '11111111-0000-4000-8000-00000000000d', 0, 'left', 70, 10, 2, true),
  ('11111111-0000-4000-8000-00000000000f', 'e2e-import-a', 1783900000014, 1783900000014,
   '11111111-0000-4000-8000-00000000000d', 0, 'right', 67.5, 9, null, true);

insert into measurements (id, owner_id, created_at, updated_at, measured_on, bodyweight_kg, waist_cm, photo_path)
values ('11111111-0000-4000-8000-000000000010', 'e2e-import-a', 1783900000015, 1783900000015,
        '2026-07-14', 82.3, 84, 'e2e-import-a/2026-07-14.jpg');

insert into exercise_prefs (id, owner_id, created_at, updated_at, exercise_id, weight_unit, generator_excluded)
values ('11111111-0000-4000-8000-000000000011', 'e2e-import-a', 1783900000016, 1783900000016,
        '00000000-0000-4000-8000-000000000001', 'lb', true);

insert into exercise_favorites (id, owner_id, created_at, updated_at, exercise_id, favorite)
values ('11111111-0000-4000-8000-000000000012', 'e2e-import-a', 1783900000017, 1783900000017,
        '00000000-0000-4000-8000-000000000001', true);

insert into user_prefs (id, owner_id, created_at, updated_at, display_name, body_diagram)
values ('11111111-0000-4000-8000-000000000013', 'e2e-import-a', 1783900000018, 1783900000018, 'Importer', 'female');

insert into push_subscriptions (id, owner_id, created_at, updated_at, endpoint, keys)
values ('11111111-0000-4000-8000-000000000014', 'e2e-import-a', 1783900000019, 1783900000019,
        'https://push.example/import', '{"p256dh":"a","auth":"b"}');

insert into api_tokens (id, owner_id, created_at, name, token_hash, last_used_at)
values ('11111111-0000-4000-8000-000000000015', 'e2e-import-a', 1783900000020, 'cli',
        'aa11bb22cc33dd44ee55ff6600778899aa11bb22cc33dd44ee55ff6600778899', null);

-- A second owner: nothing of A's may become B's or vice versa.
insert into sessions (id, owner_id, created_at, updated_at, started_at, title)
values ('22222222-0000-4000-8000-000000000001', 'e2e-import-b', 1783900000021, 1783900000021,
        1783900000021, 'B session');
