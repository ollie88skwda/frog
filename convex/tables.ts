// Per-table write rules used by the generic row layer (rows.ts) and the
// admin import (admin.ts). This file is the Convex replacement for the
// Postgres constraints + RLS policies that used to live in
// supabase/migrations: foreign keys (checked against the caller's ownership,
// which is stricter than Postgres FKs were), unique keys, column defaults,
// and which columns hold storage ids.
import type { UidTable } from "./lib";
import schema from "./schema";

/** `readable` = own row OR global row; `owned` = caller's own row only. */
export type FkRule = { table: UidTable; mode: "owned" | "readable" };

export const FKS: Partial<Record<UidTable, Record<string, FkRule>>> = {
  exercises: { machineId: { table: "machines", mode: "owned" } },
  tracked_conditions: { metricId: { table: "metrics", mode: "readable" } },
  exercise_favorites: { exerciseId: { table: "exercises", mode: "readable" } },
  exercise_prefs: { exerciseId: { table: "exercises", mode: "readable" } },
  routines: { folderId: { table: "routine_folders", mode: "owned" } },
  routine_exercises: {
    routineId: { table: "routines", mode: "owned" },
    exerciseId: { table: "exercises", mode: "readable" },
  },
  routine_sets: {
    routineExerciseId: { table: "routine_exercises", mode: "owned" },
  },
  programs: { folderId: { table: "routine_folders", mode: "owned" } },
  sessions: { routineId: { table: "routines", mode: "owned" } },
  session_exercises: {
    sessionId: { table: "sessions", mode: "owned" },
    exerciseId: { table: "exercises", mode: "readable" },
    routineExerciseId: { table: "routine_exercises", mode: "owned" },
  },
  set_logs: {
    sessionExerciseId: { table: "session_exercises", mode: "owned" },
  },
  session_media: { sessionId: { table: "sessions", mode: "owned" } },
  coach_events: {
    sessionId: { table: "sessions", mode: "owned" },
  },
};

/**
 * Unique keys. `owner: true` = unique per owner (the old
 * `(owner_id, x)` unique indexes); `owner: false` = globally unique.
 */
export const UNIQUES: Partial<
  Record<UidTable, { index: string; fields: string[]; owner: boolean }[]>
> = {
  tracked_conditions: [
    { index: "by_owner_metric", fields: ["metricId"], owner: true },
  ],
  exercise_favorites: [
    { index: "by_owner_exercise", fields: ["exerciseId"], owner: true },
  ],
  exercise_prefs: [
    { index: "by_owner_exercise", fields: ["exerciseId"], owner: true },
  ],
  measurements: [
    { index: "by_owner_date", fields: ["measuredOn"], owner: true },
  ],
  user_prefs: [{ index: "by_owner", fields: [], owner: true }],
  push_subscriptions: [
    { index: "by_endpoint", fields: ["endpoint"], owner: false },
  ],
  api_tokens: [{ index: "by_hash", fields: ["tokenHash"], owner: false }],
};

/** Columns holding a Convex storage id the caller must have claimed. */
export const FILE_FIELDS: Partial<Record<UidTable, string[]>> = {
  machines: ["photoPath"],
  exercises: ["mediaPath"],
  measurements: ["photoPath"],
  session_media: ["path"],
};

/** Non-null column defaults (everything nullable defaults to null). */
export const DEFAULTS: Partial<Record<UidTable, Record<string, unknown>>> = {
  exercises: { isCustom: true, exerciseType: "weight_reps" },
  tracked_conditions: { tracked: true },
  exercise_favorites: { favorite: true },
  routine_folders: { position: 0 },
  routines: { position: 0 },
  routine_sets: { setType: "normal" },
  programs: { active: true },
  sessions: { pausedMs: 0 },
  set_logs: { setType: "normal", completed: false },
  exercise_prefs: { generatorExcluded: false },
  user_prefs: {
    // R6/R17b (redesign §9.2): warm-ups are excluded from stats for NEW
    // users; existing rows keep their stored value.
    includeWarmupsInStats: false,
    previousValuesScope: "any",
    bodyDiagram: "neutral",
  },
  session_media: { position: 0, mediaType: "photo" },
};

/** Never writable through the generic patch path. */
export const IMMUTABLE = new Set([
  "id",
  "ownerId",
  "createdBy",
  "createdAt",
  "nameLower",
  "_id",
  "_creationTime",
]);

type FieldValidator = { kind: string; members?: { kind: string }[] };

const nullableCache = new Map<string, string[]>();

/** Columns whose validator admits null (they default to null on insert). */
export function nullableFields(table: UidTable): string[] {
  const hit = nullableCache.get(table);
  if (hit) return hit;
  const fields = (
    schema.tables[table].validator as unknown as {
      fields: Record<string, FieldValidator>;
    }
  ).fields;
  const names = Object.entries(fields)
    .filter(
      ([, val]) =>
        val.kind === "union" && val.members?.some((m) => m.kind === "null"),
    )
    .map(([k]) => k);
  nullableCache.set(table, names);
  return names;
}

/** Full insertable row: null for omitted nullable columns, then defaults. */
export function withDefaults(
  table: UidTable,
  row: Record<string, unknown>,
  now: number,
): Record<string, unknown> {
  const full: Record<string, unknown> = {};
  for (const f of nullableFields(table)) full[f] = null;
  Object.assign(full, DEFAULTS[table] ?? {});
  if (table !== "api_tokens") {
    full.createdAt = now;
    full.updatedAt = now;
  } else {
    full.createdAt = now;
  }
  for (const [k, val] of Object.entries(row)) {
    if (val !== undefined) full[k] = val;
  }
  if (table === "exercises") {
    full.nameLower = String(full.name ?? "")
      .trim()
      .toLowerCase();
  }
  return full;
}
