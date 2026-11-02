// Convex data model — the backend source of truth since the 2026-11-01
// Supabase → Convex switch (docs/DECISIONS.md). Mirrors the former Drizzle
// pg schema (packages/core/src/db/schema.ts keeps the app-facing row TYPES):
//
// - Table names stay snake_case (`set_logs`), field names are the camelCase
//   names the app's row types already use (`sessionExerciseId`).
// - Every row keeps its client-generated uuid in `id` (indexed `by_uid`);
//   foreign keys are those uuid strings, not Convex `Id`s, so relationships,
//   exports and the import from Supabase carry over unchanged. `_id` is
//   internal and never leaves a function (see `out()` in lib.ts).
// - `ownerId` is the Clerk JWT `sub` (identity.subject). `null` only on
//   global rows (seed exercises/metrics/catalog, community-shared exercises).
//   Authorization lives in every function (lib.ts), replacing RLS.
// - Nullable columns are `T | null` and always written explicitly.
import { defineSchema, defineTable } from "convex/server";
import { type GenericValidator, v } from "convex/values";

const n = <V extends GenericValidator>(x: V) => v.union(x, v.null());

const base = {
  id: v.string(),
  createdAt: v.number(),
  updatedAt: v.number(),
  deletedAt: n(v.number()),
};

const muscleTargets = n(
  v.array(
    v.object({
      muscle: v.string(),
      tier: n(v.string()),
      role: v.optional(v.string()),
    }),
  ),
);
const strings = n(v.array(v.string()));
const json = n(v.any());

export default defineSchema({
  machines: defineTable({
    ...base,
    ownerId: v.string(),
    name: v.string(),
    brand: n(v.string()),
    catalogKey: n(v.string()),
    settings: n(
      v.array(
        v.object({
          label: v.string(),
          value: n(v.number()),
          photoPath: v.optional(n(v.string())),
        }),
      ),
    ),
    notes: n(v.string()),
    photoPath: n(v.string()),
  })
    .index("by_uid", ["id"])
    .index("by_owner", ["ownerId", "createdAt"]),

  machine_catalog: defineTable({
    ...base,
    ownerId: n(v.string()),
    brand: v.string(),
    model: v.string(),
    aliases: strings,
    category: v.string(),
    mechanism: n(v.string()),
    muscleTargets,
    weightStackKg: n(v.number()),
    plateCapacityKg: n(v.number()),
    dimensions: json,
    productUrl: n(v.string()),
    introducedYear: n(v.number()),
    discontinuedYear: n(v.number()),
    sourceUrl: n(v.string()),
    sourceNote: n(v.string()),
    createdBy: n(v.string()),
  })
    .index("by_uid", ["id"])
    .index("by_owner", ["ownerId", "createdAt"]),

  exercises: defineTable({
    ...base,
    ownerId: n(v.string()),
    createdBy: n(v.string()),
    name: v.string(),
    // lower(trim(name)) — the publish dedupe backstop key. Internal: stripped
    // by out() so the app-facing Exercise shape is unchanged.
    nameLower: v.string(),
    tags: strings,
    isCustom: v.boolean(),
    machineId: n(v.string()),
    jointActions: strings,
    muscleTargets,
    imageUrl: n(v.string()),
    imageAttribution: n(v.string()),
    exerciseType: v.string(),
    equipment: n(v.string()),
    instructions: strings,
    imageUrls: strings,
    mechanic: n(v.string()),
    movementPattern: n(v.string()),
    laterality: n(v.string()),
    defaultRepsMin: n(v.number()),
    defaultRepsMax: n(v.number()),
    defaultRestSec: n(v.number()),
    notes: n(v.string()),
    aliases: strings,
    mediaPath: n(v.string()),
    mediaType: n(v.string()),
  })
    .index("by_uid", ["id"])
    .index("by_owner", ["ownerId", "createdAt"])
    .index("by_owner_name", ["ownerId", "nameLower"])
    .index("by_created_by", ["createdBy", "createdAt"])
    .index("by_owner_machine", ["ownerId", "machineId"]),

  metrics: defineTable({
    ...base,
    ownerId: n(v.string()),
    name: v.string(),
    type: v.string(),
    scope: v.string(),
    unit: n(v.string()),
    exerciseIds: strings,
  })
    .index("by_uid", ["id"])
    .index("by_owner", ["ownerId", "createdAt"]),

  tracked_conditions: defineTable({
    ...base,
    ownerId: v.string(),
    metricId: v.string(),
    tracked: v.boolean(),
    position: n(v.number()),
  })
    .index("by_uid", ["id"])
    .index("by_owner", ["ownerId", "createdAt"])
    .index("by_owner_metric", ["ownerId", "metricId"]),

  exercise_favorites: defineTable({
    ...base,
    ownerId: v.string(),
    exerciseId: v.string(),
    favorite: v.boolean(),
  })
    .index("by_uid", ["id"])
    .index("by_owner", ["ownerId", "createdAt"])
    .index("by_owner_exercise", ["ownerId", "exerciseId"]),

  routine_folders: defineTable({
    ...base,
    ownerId: v.string(),
    name: v.string(),
    position: v.number(),
  })
    .index("by_uid", ["id"])
    .index("by_owner", ["ownerId", "createdAt"]),

  routines: defineTable({
    ...base,
    ownerId: v.string(),
    name: v.string(),
    folderId: n(v.string()),
    position: v.number(),
    description: n(v.string()),
  })
    .index("by_uid", ["id"])
    .index("by_owner", ["ownerId", "createdAt"])
    .index("by_owner_folder", ["ownerId", "folderId"]),

  routine_exercises: defineTable({
    ...base,
    ownerId: v.string(),
    routineId: v.string(),
    exerciseId: v.string(),
    orderIndex: v.number(),
    supersetGroup: n(v.number()),
    restSec: n(v.number()),
    note: n(v.string()),
  })
    .index("by_uid", ["id"])
    .index("by_owner", ["ownerId", "createdAt"])
    .index("by_routine", ["routineId"]),

  routine_sets: defineTable({
    ...base,
    ownerId: v.string(),
    routineExerciseId: v.string(),
    setNo: v.number(),
    setType: v.string(),
    targetWeightKg: n(v.number()),
    targetReps: n(v.number()),
    targetRepsMax: n(v.number()),
    targetDurationSec: n(v.number()),
    targetDistanceM: n(v.number()),
    targetRirMin: n(v.number()),
    targetRirMax: n(v.number()),
    laterality: n(v.string()),
  })
    .index("by_uid", ["id"])
    .index("by_owner", ["ownerId", "createdAt"])
    .index("by_routine_exercise", ["routineExerciseId"]),

  programs: defineTable({
    ...base,
    ownerId: v.string(),
    source: v.string(),
    libraryKey: n(v.string()),
    config: json,
    folderId: v.string(),
    active: v.boolean(),
  })
    .index("by_uid", ["id"])
    .index("by_owner", ["ownerId", "createdAt"]),

  sessions: defineTable({
    ...base,
    ownerId: v.string(),
    title: n(v.string()),
    startedAt: v.number(),
    endedAt: n(v.number()),
    conditionValues: json,
    notes: n(v.string()),
    routineId: n(v.string()),
    pausedMs: v.number(),
    shareSlug: n(v.string()),
  })
    .index("by_uid", ["id"])
    .index("by_owner", ["ownerId", "createdAt"])
    .index("by_owner_started", ["ownerId", "startedAt"])
    .index("by_owner_ended", ["ownerId", "endedAt", "startedAt"]),

  session_exercises: defineTable({
    ...base,
    ownerId: v.string(),
    sessionId: v.string(),
    exerciseId: v.string(),
    orderIndex: v.number(),
    supersetGroup: n(v.number()),
    restSec: n(v.number()),
    note: n(v.string()),
    routineExerciseId: n(v.string()),
  })
    .index("by_uid", ["id"])
    .index("by_owner", ["ownerId", "createdAt"])
    .index("by_session", ["sessionId"])
    // Ghost prefill / note carry-forward: the owner's latest block of an
    // exercise. Owner-first so a lookup can never see another user's rows.
    .index("by_owner_exercise", ["ownerId", "exerciseId", "createdAt"]),

  set_logs: defineTable({
    ...base,
    ownerId: v.string(),
    sessionExerciseId: v.string(),
    setNo: v.number(),
    setType: v.string(),
    weightKg: n(v.number()),
    reps: n(v.number()),
    durationSec: n(v.number()),
    distanceM: n(v.number()),
    rir: n(v.number()),
    rirMin: n(v.number()),
    rirMax: n(v.number()),
    rpe: n(v.number()),
    note: n(v.string()),
    restSec: n(v.number()),
    metricValues: json,
    completed: v.boolean(),
    side: n(v.string()),
  })
    .index("by_uid", ["id"])
    .index("by_owner", ["ownerId", "createdAt"])
    .index("by_session_exercise", ["sessionExerciseId"]),

  measurements: defineTable({
    ...base,
    ownerId: v.string(),
    measuredOn: v.string(),
    bodyweightKg: n(v.number()),
    bodyfatPct: n(v.number()),
    neckCm: n(v.number()),
    shouldersCm: n(v.number()),
    chestCm: n(v.number()),
    waistCm: n(v.number()),
    abdomenCm: n(v.number()),
    hipsCm: n(v.number()),
    bicepLCm: n(v.number()),
    bicepRCm: n(v.number()),
    forearmLCm: n(v.number()),
    forearmRCm: n(v.number()),
    thighLCm: n(v.number()),
    thighRCm: n(v.number()),
    calfLCm: n(v.number()),
    calfRCm: n(v.number()),
    photoPath: n(v.string()),
  })
    .index("by_uid", ["id"])
    .index("by_owner", ["ownerId", "createdAt"])
    .index("by_owner_date", ["ownerId", "measuredOn"]),

  exercise_prefs: defineTable({
    ...base,
    ownerId: v.string(),
    exerciseId: v.string(),
    weightUnit: n(v.string()),
    generatorExcluded: v.boolean(),
  })
    .index("by_uid", ["id"])
    .index("by_owner", ["ownerId", "createdAt"])
    .index("by_owner_exercise", ["ownerId", "exerciseId"]),

  user_prefs: defineTable({
    ...base,
    ownerId: v.string(),
    includeWarmupsInStats: v.boolean(),
    defaultRestSec: n(v.number()),
    previousValuesScope: v.string(),
    bodyDiagram: v.string(),
    plateConfig: json,
    displayName: n(v.string()),
    bio: n(v.string()),
  })
    .index("by_uid", ["id"])
    .index("by_owner", ["ownerId", "createdAt"]),

  session_media: defineTable({
    ...base,
    ownerId: v.string(),
    sessionId: v.string(),
    path: v.string(),
    position: v.number(),
    mediaType: v.string(),
  })
    .index("by_uid", ["id"])
    .index("by_owner", ["ownerId", "createdAt"])
    .index("by_session", ["sessionId"]),

  push_subscriptions: defineTable({
    ...base,
    ownerId: v.string(),
    endpoint: v.string(),
    keys: v.object({ p256dh: v.string(), auth: v.string() }),
  })
    .index("by_uid", ["id"])
    .index("by_owner", ["ownerId", "createdAt"])
    .index("by_endpoint", ["endpoint"]),

  api_tokens: defineTable({
    id: v.string(),
    createdAt: v.number(),
    lastUsedAt: n(v.number()),
    revokedAt: n(v.number()),
    ownerId: v.string(),
    name: v.string(),
    tokenHash: v.string(),
  })
    .index("by_uid", ["id"])
    .index("by_owner", ["ownerId", "createdAt"])
    .index("by_hash", ["tokenHash"]),

  // Who uploaded each storage object. Every `*Path`/`path` field above holds a
  // Convex storage id; a function only accepts an id the caller has claimed
  // here (claimed right after upload), so nobody can attach — or read the URL
  // of — another user's file. Replaces the storage RLS path-prefix policies.
  files: defineTable({
    storageId: v.id("_storage"),
    ownerId: v.string(),
    createdAt: v.number(),
    // "<bucket>/<path>" of the Supabase Storage object this blob was copied
    // from (scripts/import-from-supabase.ts) — makes re-running the import
    // reuse the blob instead of uploading a duplicate. Absent for app uploads.
    importKey: v.optional(v.string()),
  })
    .index("by_storage", ["storageId"])
    .index("by_owner", ["ownerId"])
    .index("by_import_key", ["importKey"]),
});
