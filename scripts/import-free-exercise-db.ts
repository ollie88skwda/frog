// Generates a Supabase seed migration from the public-domain free-exercise-db
// (github.com/yuhonas/free-exercise-db, Unlicense — see
// docs/hevy-parity/free-exercise-db-license.md). Maps each exercise to an Frog
// seed row (owner_id null, is_custom false) and prints the SQL to stdout:
//
//   bun scripts/import-free-exercise-db.ts > supabase/migrations/<ts>_seed_free_exercise_db.sql
//
// Deterministic: the row id is derived from the source slug so re-running is
// idempotent (`on conflict (id) do nothing`) even as the upstream set grows.
// Pass a local exercises.json path as argv[2] to import offline; otherwise the
// pinned dist file is fetched from the repo's main branch.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { MUSCLES } from "../packages/core/src/domain/anatomy";
import { EQUIPMENT_KINDS } from "../packages/core/src/domain/exercise-types";

const DATASET_URL =
  "https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/dist/exercises.json";
// jsDelivr CDN mirror of the same public-domain repo (proper caching; avoids
// raw.githubusercontent.com's no-cache/throttling for production hotlinking).
const IMAGE_BASE =
  "https://cdn.jsdelivr.net/gh/yuhonas/free-exercise-db@main/exercises/";
const ATTRIBUTION = "free-exercise-db (Unlicense)";
const ID_PREFIX = "00000000-0000-4000-9000-"; // 9000 block: avoids the curated 8000 seeds
const BATCH = 50;

// Curated seed names (supabase/migrations/20260712144107_seeds.sql) stay
// canonical — skip any free-exercise-db entry that collides (case-insensitive).
const CURATED_NAMES = new Set(
  [
    "Squat",
    "Front Squat",
    "Leg Press",
    "Romanian Deadlift",
    "Deadlift",
    "Leg Extension",
    "Leg Curl",
    "Calf Raise",
    "Bench Press",
    "Incline Bench Press",
    "Dumbbell Bench Press",
    "Overhead Press",
    "Lateral Raise",
    "Barbell Row",
    "Seated Cable Row",
    "Lat Pulldown",
    "Pull-Up",
    "Bicep Curl",
    "Tricep Pushdown",
    "Face Pull",
  ].map((n) => n.toLowerCase()),
);

// free-exercise-db muscle string -> Frog muscle key (packages/core anatomy.ts).
// "neck" has no Frog key and is intentionally absent (dropped, not mapped).
// "shoulders" is a generic deltoid tag; front-delts is the single best
// representative (pressing dominates the tagged set) — see the report.
const MUSCLE_MAP: Record<string, string> = {
  abdominals: "abs",
  abductors: "glute-med",
  adductors: "adductors",
  biceps: "biceps",
  calves: "calves",
  chest: "pecs",
  forearms: "forearms",
  glutes: "glutes",
  hamstrings: "hamstrings",
  lats: "lats",
  "lower back": "erectors",
  "middle back": "mid-traps-rhomboids",
  quadriceps: "quads",
  shoulders: "front-delts",
  traps: "upper-traps",
  triceps: "triceps",
};

// free-exercise-db equipment string -> Frog EQUIPMENT_KINDS. null equipment
// stays null (unknown); unlisted kinds (medicine ball, foam roll, …) -> "other".
const EQUIPMENT_MAP: Record<string, string> = {
  barbell: "barbell",
  dumbbell: "dumbbell",
  machine: "machine",
  cable: "cable",
  bands: "band",
  kettlebells: "kettlebell",
  "body only": "bodyweight",
  "e-z curl bar": "ez_bar",
};

type SourceExercise = {
  id: string; // slug
  name: string;
  equipment: string | null;
  primaryMuscles: string[];
  secondaryMuscles: string[];
  instructions: string[];
  category: string;
  images: string[];
};

function idFor(slug: string): string {
  const hex = createHash("sha1").update(slug).digest("hex").slice(0, 12);
  return ID_PREFIX + hex;
}

// Primary muscles first, then secondaries; deduped by Frog key; tier is null
// (these seeds carry no evidence-tier — untiered sorts below the curated 20).
function muscleTargetsFor(
  e: SourceExercise,
): { muscle: string; tier: null }[] | null {
  const keys: string[] = [];
  for (const m of [...e.primaryMuscles, ...e.secondaryMuscles]) {
    const key = MUSCLE_MAP[m];
    if (key && !keys.includes(key)) keys.push(key);
  }
  if (keys.length === 0) return null;
  return keys.map((muscle) => ({ muscle, tier: null }));
}

function equipmentFor(e: SourceExercise): string | null {
  if (e.equipment == null) return null;
  return EQUIPMENT_MAP[e.equipment] ?? "other";
}

function exerciseTypeFor(e: SourceExercise): string {
  if (e.category === "cardio") return "distance_duration";
  if (e.category === "stretching") return "duration";
  if (e.equipment === "body only" && e.category === "strength")
    return "bodyweight_reps";
  return "weight_reps";
}

function instructionsFor(e: SourceExercise): string[] | null {
  const steps = (e.instructions ?? [])
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  return steps.length > 0 ? steps : null;
}

// SQL single-quoted literal (standard_conforming_strings on: only ' is special).
function sqlStr(s: string): string {
  return `'${s.replace(/'/g, "''")}'`;
}

function sqlJson(value: unknown): string {
  return `${sqlStr(JSON.stringify(value))}::jsonb`;
}

const TS = "(extract(epoch from now()) * 1000)::bigint";

function rowSql(e: SourceExercise): string {
  const muscles = muscleTargetsFor(e);
  const equipment = equipmentFor(e);
  const instructions = instructionsFor(e);
  const imageUrls = e.images.map((p) => IMAGE_BASE + p);
  const cols = [
    sqlStr(idFor(e.id)),
    TS,
    TS,
    "null", // owner_id: global seed row
    sqlStr(e.name),
    "false", // is_custom
    sqlStr(exerciseTypeFor(e)),
    equipment == null ? "null" : sqlStr(equipment),
    muscles == null ? "null" : sqlJson(muscles),
    instructions == null ? "null" : sqlJson(instructions),
    sqlStr(imageUrls[0]),
    sqlJson(imageUrls),
    sqlStr(ATTRIBUTION),
  ];
  return `  (${cols.join(", ")})`;
}

async function main() {
  const localPath = process.argv[2];
  const raw = localPath
    ? readFileSync(localPath, "utf8")
    : await fetch(DATASET_URL).then((r) => {
        if (!r.ok) throw new Error(`fetch ${DATASET_URL} -> ${r.status}`);
        return r.text();
      });
  const all = JSON.parse(raw) as SourceExercise[];

  const rows = all.filter((e) => !CURATED_NAMES.has(e.name.toLowerCase()));

  // Guard: derived ids must be unique (48-bit slug hash — collision would
  // silently drop a row under `on conflict do nothing`).
  const seen = new Set<string>();
  for (const e of rows) {
    const id = idFor(e.id);
    if (seen.has(id))
      throw new Error(`id collision for slug "${e.id}" (${id})`);
    seen.add(id);
  }

  const skipped = all.length - rows.length;
  const out: string[] = [];
  out.push(
    "-- Seed exercises from the public-domain free-exercise-db (Unlicense).",
    "-- Generated by scripts/import-free-exercise-db.ts — do not edit by hand.",
    "-- Source: github.com/yuhonas/free-exercise-db · images hotlinked from the jsDelivr CDN mirror.",
    `-- ${rows.length} rows (${skipped} skipped as curated-name collisions). owner_id null = global seed row.`,
    "",
  );

  const columns =
    'insert into "exercises" (id, created_at, updated_at, owner_id, name, is_custom, exercise_type, equipment, muscle_targets, instructions, image_url, image_urls, image_attribution)';
  for (let i = 0; i < rows.length; i += BATCH) {
    const values = rows
      .slice(i, i + BATCH)
      .map(rowSql)
      .join(",\n");
    out.push(columns, "values", `${values}\non conflict (id) do nothing;`, "");
  }

  process.stdout.write(out.join("\n"));

  // Coverage stats -> stderr so stdout stays pure SQL.
  const frogKeys = new Set(MUSCLES.map((m) => m.key));
  for (const v of Object.values(MUSCLE_MAP)) {
    if (!frogKeys.has(v))
      throw new Error(`MUSCLE_MAP target "${v}" not in MUSCLES`);
  }
  for (const v of Object.values(EQUIPMENT_MAP)) {
    if (!(EQUIPMENT_KINDS as readonly string[]).includes(v))
      throw new Error(`EQUIPMENT_MAP target "${v}" not in EQUIPMENT_KINDS`);
  }
  console.error(`seeded ${rows.length} exercises, skipped ${skipped}`);
}

await main();
