-- Classify the 20 seed exercises: joint_actions (display labels, first =
-- primary) and muscle_targets ({muscle, tier}, first = primary — drives
-- library grouping). Keys must match packages/core/src/domain/anatomy.ts.
-- Runs as postgres so RLS on seed rows (owner_id null) doesn't apply.
-- Idempotent: plain UPDATEs by fixed seed UUID.

update "exercises" set
  joint_actions = '["knee-extension","hip-extension"]'::jsonb,
  muscle_targets = '[{"muscle":"quads","tier":"S"},{"muscle":"glutes","tier":"A"},{"muscle":"adductors","tier":"B"}]'::jsonb,
  updated_at = (extract(epoch from now()) * 1000)::bigint
where id = '00000000-0000-4000-8000-000000000001'; -- Squat

update "exercises" set
  joint_actions = '["knee-extension","hip-extension"]'::jsonb,
  muscle_targets = '[{"muscle":"quads","tier":"S"},{"muscle":"glutes","tier":"B"}]'::jsonb,
  updated_at = (extract(epoch from now()) * 1000)::bigint
where id = '00000000-0000-4000-8000-000000000002'; -- Front Squat

update "exercises" set
  joint_actions = '["knee-extension","hip-extension"]'::jsonb,
  muscle_targets = '[{"muscle":"quads","tier":"S"},{"muscle":"glutes","tier":"A"},{"muscle":"adductors","tier":"B"}]'::jsonb,
  updated_at = (extract(epoch from now()) * 1000)::bigint
where id = '00000000-0000-4000-8000-000000000003'; -- Leg Press

update "exercises" set
  joint_actions = '["hip-extension","spinal-extension"]'::jsonb,
  muscle_targets = '[{"muscle":"hamstrings","tier":"S"},{"muscle":"glutes","tier":"A"},{"muscle":"erectors","tier":"B"}]'::jsonb,
  updated_at = (extract(epoch from now()) * 1000)::bigint
where id = '00000000-0000-4000-8000-000000000004'; -- Romanian Deadlift

update "exercises" set
  joint_actions = '["hip-extension","knee-extension","spinal-extension"]'::jsonb,
  muscle_targets = '[{"muscle":"glutes","tier":"S"},{"muscle":"hamstrings","tier":"A"},{"muscle":"erectors","tier":"A"},{"muscle":"quads","tier":"B"}]'::jsonb,
  updated_at = (extract(epoch from now()) * 1000)::bigint
where id = '00000000-0000-4000-8000-000000000005'; -- Deadlift

update "exercises" set
  joint_actions = '["knee-extension"]'::jsonb,
  muscle_targets = '[{"muscle":"quads","tier":"S"}]'::jsonb,
  updated_at = (extract(epoch from now()) * 1000)::bigint
where id = '00000000-0000-4000-8000-000000000006'; -- Leg Extension

update "exercises" set
  joint_actions = '["knee-flexion"]'::jsonb,
  muscle_targets = '[{"muscle":"hamstrings","tier":"S"}]'::jsonb,
  updated_at = (extract(epoch from now()) * 1000)::bigint
where id = '00000000-0000-4000-8000-000000000007'; -- Leg Curl

update "exercises" set
  joint_actions = '["ankle-plantarflexion"]'::jsonb,
  muscle_targets = '[{"muscle":"calves","tier":"S"}]'::jsonb,
  updated_at = (extract(epoch from now()) * 1000)::bigint
where id = '00000000-0000-4000-8000-000000000008'; -- Calf Raise

update "exercises" set
  joint_actions = '["shoulder-horizontal-adduction","elbow-extension"]'::jsonb,
  muscle_targets = '[{"muscle":"pecs","tier":"S"},{"muscle":"triceps","tier":"A"},{"muscle":"front-delts","tier":"B"}]'::jsonb,
  updated_at = (extract(epoch from now()) * 1000)::bigint
where id = '00000000-0000-4000-8000-000000000009'; -- Bench Press

update "exercises" set
  joint_actions = '["shoulder-horizontal-adduction","shoulder-flexion","elbow-extension"]'::jsonb,
  muscle_targets = '[{"muscle":"upper-pecs","tier":"S"},{"muscle":"front-delts","tier":"A"},{"muscle":"triceps","tier":"B"}]'::jsonb,
  updated_at = (extract(epoch from now()) * 1000)::bigint
where id = '00000000-0000-4000-8000-00000000000a'; -- Incline Bench Press

update "exercises" set
  joint_actions = '["shoulder-horizontal-adduction","elbow-extension"]'::jsonb,
  muscle_targets = '[{"muscle":"pecs","tier":"S"},{"muscle":"triceps","tier":"A"},{"muscle":"front-delts","tier":"B"}]'::jsonb,
  updated_at = (extract(epoch from now()) * 1000)::bigint
where id = '00000000-0000-4000-8000-00000000000b'; -- Dumbbell Bench Press

update "exercises" set
  joint_actions = '["shoulder-flexion","elbow-extension"]'::jsonb,
  muscle_targets = '[{"muscle":"front-delts","tier":"S"},{"muscle":"triceps","tier":"A"},{"muscle":"upper-pecs","tier":"B"}]'::jsonb,
  updated_at = (extract(epoch from now()) * 1000)::bigint
where id = '00000000-0000-4000-8000-00000000000c'; -- Overhead Press

update "exercises" set
  joint_actions = '["shoulder-abduction"]'::jsonb,
  muscle_targets = '[{"muscle":"side-delts","tier":"S"}]'::jsonb,
  updated_at = (extract(epoch from now()) * 1000)::bigint
where id = '00000000-0000-4000-8000-00000000000d'; -- Lateral Raise

update "exercises" set
  joint_actions = '["shoulder-extension","scapular-retraction","elbow-flexion"]'::jsonb,
  muscle_targets = '[{"muscle":"lats","tier":"A"},{"muscle":"mid-traps-rhomboids","tier":"S"},{"muscle":"rear-delts","tier":"B"},{"muscle":"biceps","tier":"B"}]'::jsonb,
  updated_at = (extract(epoch from now()) * 1000)::bigint
where id = '00000000-0000-4000-8000-00000000000e'; -- Barbell Row

update "exercises" set
  joint_actions = '["shoulder-extension","scapular-retraction","elbow-flexion"]'::jsonb,
  muscle_targets = '[{"muscle":"lats","tier":"A"},{"muscle":"mid-traps-rhomboids","tier":"S"},{"muscle":"rear-delts","tier":"B"},{"muscle":"biceps","tier":"B"}]'::jsonb,
  updated_at = (extract(epoch from now()) * 1000)::bigint
where id = '00000000-0000-4000-8000-00000000000f'; -- Seated Cable Row

update "exercises" set
  joint_actions = '["shoulder-adduction","elbow-flexion"]'::jsonb,
  muscle_targets = '[{"muscle":"lats","tier":"S"},{"muscle":"biceps","tier":"A"},{"muscle":"teres-major","tier":"A"}]'::jsonb,
  updated_at = (extract(epoch from now()) * 1000)::bigint
where id = '00000000-0000-4000-8000-000000000010'; -- Lat Pulldown

update "exercises" set
  joint_actions = '["shoulder-adduction","elbow-flexion"]'::jsonb,
  muscle_targets = '[{"muscle":"lats","tier":"S"},{"muscle":"biceps","tier":"A"},{"muscle":"teres-major","tier":"A"}]'::jsonb,
  updated_at = (extract(epoch from now()) * 1000)::bigint
where id = '00000000-0000-4000-8000-000000000011'; -- Pull-Up

update "exercises" set
  joint_actions = '["elbow-flexion"]'::jsonb,
  muscle_targets = '[{"muscle":"biceps","tier":"S"},{"muscle":"brachialis-brachioradialis","tier":"B"}]'::jsonb,
  updated_at = (extract(epoch from now()) * 1000)::bigint
where id = '00000000-0000-4000-8000-000000000012'; -- Bicep Curl

update "exercises" set
  joint_actions = '["elbow-extension"]'::jsonb,
  muscle_targets = '[{"muscle":"triceps","tier":"S"}]'::jsonb,
  updated_at = (extract(epoch from now()) * 1000)::bigint
where id = '00000000-0000-4000-8000-000000000013'; -- Tricep Pushdown

update "exercises" set
  joint_actions = '["shoulder-horizontal-abduction","external-rotation","scapular-retraction"]'::jsonb,
  muscle_targets = '[{"muscle":"rear-delts","tier":"S"},{"muscle":"rotator-cuff","tier":"A"},{"muscle":"mid-traps-rhomboids","tier":"B"}]'::jsonb,
  updated_at = (extract(epoch from now()) * 1000)::bigint
where id = '00000000-0000-4000-8000-000000000014'; -- Face Pull
