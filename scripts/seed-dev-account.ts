// Seeds a developer test account with fabricated training history.
//
// Dev tooling only — never imported by the app. It writes with the Supabase
// SERVICE ROLE key (bypasses RLS) and sets `owner_id` explicitly, because the
// account's identity is a Clerk user id and there is no way to mint a Clerk
// JWT from a script.
//
//   bun scripts/seed-dev-account.ts --owner user_xxx                 # local
//   SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… bun scripts/seed-dev-account.ts \
//     --owner user_xxx --confirm-reset user_xxx                      # hosted
//
// Without --confirm-reset the script refuses to run against an owner that owns
// ANY row in the tables it writes, so it can never silently double-seed (or
// touch a real account). Reset is a HARD delete scoped to one owner_id —
// deliberate: this is a disposable account, and soft-deleted rows would keep
// skewing counts.

import { execSync } from "node:child_process";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { SEED_CONDITIONS as C } from "../packages/core/src/db/seed-ids";
import {
  type ExerciseType,
  TYPE_FIELDS,
} from "../packages/core/src/domain/exercise-types";

// ── args ────────────────────────────────────────────────────────────────────
function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? undefined : process.argv[i + 1];
}
const OWNER = arg("owner");
const CONFIRM_RESET = arg("confirm-reset");
const WEEKS = Number(arg("weeks") ?? 24);
if (!OWNER) {
  console.error(
    "usage: --owner <clerk-user-id|uuid> [--confirm-reset <same>] [--weeks 16]",
  );
  process.exit(1);
}

// ── connection ──────────────────────────────────────────────────────────────
function local(): { url: string; key: string } {
  const raw = execSync("supabase status -o json", { encoding: "utf8" });
  // The CLI may print warnings (e.g. "Stopped services: ...") before the JSON.
  const s = JSON.parse(raw.slice(raw.indexOf("{")));
  const url: string = s.API_URL ?? s.api_url;
  const key: string = s.SERVICE_ROLE_KEY ?? s.service_role_key;
  if (!url || !key) {
    throw new Error(
      `unexpected supabase status output: ${Object.keys(s).join(", ")}`,
    );
  }
  return { url, key };
}
const conn =
  process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY
    ? {
        url: process.env.SUPABASE_URL,
        key: process.env.SUPABASE_SERVICE_ROLE_KEY,
      }
    : local();
const db: SupabaseClient = createClient(conn.url, conn.key, {
  auth: { persistSession: false },
});
const hosted = !conn.url.includes("127.0.0.1");

// ── deterministic RNG (mulberry32) — reruns produce the same numbers ────────
let _s = 0x9e3779b9;
function rnd(): number {
  _s |= 0;
  _s = (_s + 0x6d2b79f5) | 0;
  let t = Math.imul(_s ^ (_s >>> 15), 1 | _s);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const jitter = (spread: number) => (rnd() - 0.5) * 2 * spread;
const pick = <T>(xs: T[]): T => xs[Math.floor(rnd() * xs.length)];
const round = (v: number, step: number) => Math.round(v / step) * step;
const uuid = () => crypto.randomUUID();

// ── the program ─────────────────────────────────────────────────────────────
// Weight is the week-1 working weight in kg; gain is kg added per week.
type Slot = {
  name: string;
  sets: number;
  reps: number;
  repsMax?: number;
  kg: number;
  gain: number;
  warmups?: number;
  rest: number;
};
const ROUTINES: { name: string; slots: Slot[] }[] = [
  {
    name: "Upper A — Press",
    slots: [
      {
        name: "Bench Press",
        sets: 4,
        reps: 5,
        kg: 82.5,
        gain: 0.9,
        warmups: 2,
        rest: 180,
      },
      {
        name: "Overhead Press",
        sets: 3,
        reps: 8,
        kg: 47.5,
        gain: -0.05,
        rest: 150,
      }, // → PLATEAU
      {
        name: "Bent Over Barbell Row",
        sets: 4,
        reps: 8,
        kg: 70,
        gain: 0.7,
        rest: 150,
      },
      {
        name: "Triceps Pushdown",
        sets: 3,
        reps: 12,
        repsMax: 15,
        kg: 32.5,
        gain: 0.35,
        rest: 90,
      },
      { name: "Face Pull", sets: 3, reps: 15, kg: 22.5, gain: 0.2, rest: 60 },
    ],
  },
  {
    name: "Lower A — Squat",
    slots: [
      {
        name: "Barbell Squat",
        sets: 4,
        reps: 5,
        kg: 105,
        gain: 1.2,
        warmups: 2,
        rest: 210,
      },
      {
        name: "Romanian Deadlift",
        sets: 3,
        reps: 8,
        kg: 90,
        gain: 0.9,
        rest: 180,
      },
      { name: "Leg Press", sets: 3, reps: 12, kg: 160, gain: 2.5, rest: 120 },
      {
        name: "Lying Leg Curls",
        sets: 3,
        reps: 12,
        repsMax: 15,
        kg: 45,
        gain: 0.5,
        rest: 90,
      },
      {
        name: "Hanging Leg Raise",
        sets: 3,
        reps: 12,
        kg: 0,
        gain: 0,
        rest: 60,
      },
    ],
  },
  {
    name: "Upper B — Pull",
    slots: [
      { name: "Pullups", sets: 4, reps: 8, kg: 0, gain: 0, rest: 150 },
      {
        name: "Incline Dumbbell Press",
        sets: 4,
        reps: 8,
        repsMax: 10,
        kg: 30,
        gain: 0.35,
        rest: 150,
      },
      {
        name: "Seated Cable Rows",
        sets: 3,
        reps: 10,
        kg: 65,
        gain: 0.6,
        rest: 120,
      },
      { name: "Lat Pulldown", sets: 3, reps: 12, kg: 60, gain: 0.6, rest: 90 },
      {
        name: "Barbell Curl",
        sets: 3,
        reps: 10,
        repsMax: 12,
        kg: 34,
        gain: -0.18,
        rest: 75,
      }, // → REGRESSING
    ],
  },
  {
    name: "Lower B — Deadlift",
    slots: [
      {
        name: "Barbell Deadlift",
        sets: 3,
        reps: 3,
        kg: 140,
        gain: 1.5,
        warmups: 2,
        rest: 240,
      },
      {
        name: "Dumbbell Lunges",
        sets: 3,
        reps: 10,
        kg: 22.5,
        gain: 0.3,
        rest: 120,
      },
      {
        name: "Leg Extensions",
        sets: 3,
        reps: 15,
        kg: 50,
        gain: 0.6,
        rest: 90,
      },
      {
        name: "Standing Military Press",
        sets: 3,
        reps: 8,
        kg: 42.5,
        gain: 0.4,
        rest: 120,
      },
      // The library types Plank as bodyweight_reps, so a set is one hold.
      { name: "Plank", sets: 3, reps: 1, kg: 0, gain: 0, rest: 60 },
    ],
  },
];
// Mon / Tue / Thu / Fri — routine index by weekday (0=Sun).
const DAY_PLAN: Record<number, number> = { 1: 0, 2: 1, 4: 2, 5: 3 };
// Weeks (1-based, counting back from the newest) that are deliberately empty:
// a holiday gap, so "longest streak" and "current streak" differ on the
// profile screen instead of being trivially equal.
const SKIPPED_WEEKS = new Set([6, 17]);
// Deload weeks: ~10% lighter at higher RIR, SAME set count. Cutting sets on a
// deload was the first version and it poisoned the findings: a deload drops
// session tonnage ~25%, the deload weeks all landed on one side of the sleep
// median, and the low-sleep bucket ended up carrying every deload — reporting
// a 20-33% "sleep effect" against the 5% actually encoded. An intensity-only
// deload keeps per-session tonnage within ~10%, so which bucket it lands in
// stops mattering.
const DELOAD_WEEKS = new Set([4, 12, 20]);
// Fridays skipped outright — life happens, and the calendar heat-map needs
// some weeks that aren't a perfect 4/4.
const MISSED_FRIDAY_WEEKS = new Set([3, 9, 14, 22]);
// PLATEAU / REGRESSING come from a lift's `gain` being ~0 or negative for the
// WHOLE history, not from a late stall: `robustTrend` fits every logged
// session with no recency window, so 12 good weeks then 12 flat ones still
// reads PROGRESSING. Overhead Press (gain ≈ 0) and Barbell Curl (negative)
// are the two lifts tuned to produce the other two verdicts.

// Condition values come from a STRATIFIED DESIGN (see the `stratify` pass
// below), not independent random draws. Each condition has a low and a high
// level; which one a session gets is decided by the design, and the exact
// value inside that level rotates through these four so the numbers don't
// repeat visibly.
//
// Only sleep and stress carry an encoded effect on performance. Carbs and
// caffeine are decoys that SHOULD produce no finding — that is what
// demonstrates the engine's guardrails rather than just its output.
const LEVELS = {
  sleep: { lo: [5.6, 6.2, 5.9, 6.4], hi: [7.6, 8.2, 7.4, 8.5] },
  stress: { lo: [2, 3, 3, 4], hi: [6, 7, 8, 7] },
  carbs: { lo: [15, 30, 20, 35], hi: [90, 115, 100, 130] },
  caffeine: { lo: [0, 0, 100, 100], hi: [200, 300, 200, 300] },
};

// ── helpers ─────────────────────────────────────────────────────────────────
const DAY = 86_400_000;
function at(daysAgo: number, hour: number, min: number): number {
  const d = new Date();
  d.setHours(hour, min, 0, 0);
  return d.getTime() - daysAgo * DAY;
}
/** Days back from today to `dow` in the calendar week `week`-1 weeks ago.
 * Anchored to the week's FIRST_WEEKDAY (Sunday) start — a naive
 * "(todayDow - dow + 7) % 7" pushes any weekday later than today into the
 * previous calendar week, which silently backfills the gap weeks. */
function daysAgoFor(week: number, dow: number): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const sundayThisWeek = today.getTime() - today.getDay() * DAY;
  const target = sundayThisWeek - (week - 1) * 7 * DAY + dow * DAY;
  return Math.round((today.getTime() - target) / DAY);
}
function dateKey(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// ── main ────────────────────────────────────────────────────────────────────
// Every owner-scoped table this script touches, children before parents (FKs
// are not ON DELETE CASCADE). One list drives both the pre-flight probe and
// the reset delete, so the guard can never be narrower than the write: four of
// these carry owner-scoped UNIQUE indexes (user_prefs, tracked_conditions,
// exercise_favorites, measurements), and a plain insert over a pre-existing
// row would otherwise abort mid-run and leave the account half-seeded.
const OWNED_TABLES = [
  "set_logs",
  "session_exercises",
  "session_media",
  "sessions",
  "routine_sets",
  "routine_exercises",
  "programs",
  "routines",
  "routine_folders",
  "measurements",
  "tracked_conditions",
  "exercise_favorites",
  "exercise_prefs",
  "user_prefs",
];

const existing: string[] = [];
for (const table of OWNED_TABLES) {
  const { count, error } = await db
    .from(table)
    .select("id", { count: "exact", head: true })
    .eq("owner_id", OWNER);
  if (error) throw new Error(`${table}: ${error.message}`);
  if ((count ?? 0) > 0) existing.push(`${table} ${count}`);
}

if (existing.length) {
  if (CONFIRM_RESET !== OWNER) {
    console.error(
      `Owner ${OWNER} already has data: ${existing.join(", ")}.\n` +
        `Re-run with --confirm-reset ${OWNER} to wipe and reseed (HARD delete, dev accounts only).`,
    );
    process.exit(1);
  }
  console.log(`Resetting existing rows for ${OWNER}: ${existing.join(", ")}…`);
  for (const table of OWNED_TABLES) {
    const { error } = await db.from(table).delete().eq("owner_id", OWNER);
    if (error) throw new Error(`${table}: ${error.message}`);
  }
}

// Resolve library exercises by NAME (never hardcode seed uuids).
const wanted = [
  ...new Set(ROUTINES.flatMap((r) => r.slots.map((s) => s.name))),
];
const { data: exRows, error: lookupErr } = await db
  .from("exercises")
  .select("id,name,exercise_type")
  .is("owner_id", null)
  .in("name", wanted);
if (lookupErr) throw new Error(lookupErr.message);
const exId = new Map(
  (exRows ?? []).map((r) => [r.name as string, r.id as string]),
);
const missing = wanted.filter((n) => !exId.has(n));
if (missing.length)
  throw new Error(`library exercises not found: ${missing.join(", ")}`);

// The library row's exercise_type — not the slot — decides which set columns
// carry a value. Writing a shape the type doesn't use (a duration on a
// bodyweight_reps lift, say) logs rows the app renders as blank, excludes from
// volume, and never counts for records.
const exType = new Map(
  (exRows ?? []).map((r) => [r.name as string, r.exercise_type as ExerciseType]),
);
for (const [name, type] of exType) {
  if (!TYPE_FIELDS[type]) throw new Error(`${name}: unknown type ${type}`);
}
for (const s of ROUTINES.flatMap((r) => r.slots)) {
  const f = TYPE_FIELDS[exType.get(s.name)!];
  if (!f.reps) throw new Error(`${s.name}: rep-based slot on a non-rep type`);
  if (!f.weight && s.kg !== 0)
    throw new Error(`${s.name}: weight on a type that carries none`);
}

const now = Date.now();
const rows = {
  routine_folders: [] as Record<string, unknown>[],
  programs: [] as Record<string, unknown>[],
  routines: [] as Record<string, unknown>[],
  routine_exercises: [] as Record<string, unknown>[],
  routine_sets: [] as Record<string, unknown>[],
  sessions: [] as Record<string, unknown>[],
  session_exercises: [] as Record<string, unknown>[],
  set_logs: [] as Record<string, unknown>[],
  measurements: [] as Record<string, unknown>[],
  tracked_conditions: [] as Record<string, unknown>[],
  exercise_favorites: [] as Record<string, unknown>[],
  user_prefs: [] as Record<string, unknown>[],
};
const stamp = (t: number) => ({
  owner_id: OWNER,
  created_at: t,
  updated_at: t,
});

// Program shell.
const folderId = uuid();
rows.routine_folders.push({
  id: folderId,
  ...stamp(now - WEEKS * 7 * DAY),
  name: "Upper / Lower 4×",
  position: 0,
});
rows.programs.push({
  id: uuid(),
  ...stamp(now - WEEKS * 7 * DAY),
  source: "library",
  library_key: "upper-lower-4x",
  config: { daysPerWeek: 4, goal: "hypertrophy", experience: "intermediate" },
  folder_id: folderId,
  active: true,
});
const routineId: string[] = [];
ROUTINES.forEach((r, i) => {
  const id = uuid();
  routineId.push(id);
  rows.routines.push({
    id,
    ...stamp(now - WEEKS * 7 * DAY),
    name: r.name,
    folder_id: folderId,
    position: i,
    description: null,
  });
  r.slots.forEach((s, j) => {
    const reId = uuid();
    rows.routine_exercises.push({
      id: reId,
      ...stamp(now - WEEKS * 7 * DAY),
      routine_id: id,
      exercise_id: exId.get(s.name),
      order_index: j,
      rest_sec: s.rest,
      note: null,
    });
    for (let n = 0; n < s.sets; n++) {
      rows.routine_sets.push({
        id: uuid(),
        ...stamp(now - WEEKS * 7 * DAY),
        routine_exercise_id: reId,
        set_no: n,
        set_type: "normal",
        target_weight_kg: TYPE_FIELDS[exType.get(s.name)!].weight
          ? round(s.kg + s.gain * WEEKS * 0.6, 2.5)
          : null,
        target_reps: s.reps,
        target_reps_max: s.repsMax ?? null,
      });
    }
  });
});

// ── pass 1: lay out the calendar ────────────────────────────────────────────
type Planned = {
  week: number;
  weekIdx: number;
  rIdx: number;
  daysAgo: number;
  deload: boolean;
};
const planned: Planned[] = [];
for (let week = WEEKS; week >= 1; week--) {
  if (SKIPPED_WEEKS.has(week)) continue;
  for (const [dowStr, rIdx] of Object.entries(DAY_PLAN)) {
    const dow = Number(dowStr);
    const daysAgo = daysAgoFor(week, dow);
    if (daysAgo < 0) continue;
    // Missed Fridays — deterministic, not random: a random drop changes how
    // many sessions each routine gets, which unbalances the condition design.
    if (dow === 5 && MISSED_FRIDAY_WEEKS.has(week)) continue;
    planned.push({
      week,
      weekIdx: WEEKS - week,
      rIdx,
      daysAgo,
      deload: DELOAD_WEEKS.has(week),
    });
  }
}

// ── pass 2: assign the condition design ─────────────────────────────────────
// Recursive stratification, per routine, over that routine's sessions in
// chronological order. At each level the list is split by alternating index:
// that keeps every bit (a) balanced in COUNT within the stratum above it —
// which is what makes the four conditions mutually orthogonal — and (b)
// balanced in TIME, which is the part a fixed 0..7 cycle gets wrong.
//
// Time balance is not a nicety. Weights climb ~25% across the history, so a
// bucket that leans two sessions later is two sessions richer in heavy
// sessions. With a truncated cycle the high-sleep bucket landed a mean of 1.6
// positions later than the low bucket out of 15 and inflated a 5% encoded
// sleep effect into a reported 9.6%.
const bits = new Map<Planned, [number, number, number]>();
for (const p of planned) bits.set(p, [0, 0, 0]);
for (const rIdx of [0, 1, 2, 3]) {
  const own = planned.filter((p) => p.rIdx === rIdx); // already chronological
  const stratify = (list: Planned[], depth: number) => {
    if (depth > 2) return;
    const a: Planned[] = [];
    const b: Planned[] = [];
    list.forEach((p, i) => {
      if (i % 2 === 0) a.push(p);
      else b.push(p);
    });
    for (const p of b) bits.get(p)![depth] = 1;
    stratify(a, depth + 1);
    stratify(b, depth + 1);
  };
  stratify(own, 0);
}

// ── pass 3: materialise ─────────────────────────────────────────────────────
let sessionCount = 0;
const seen: Record<number, number> = {};
for (const plan of planned) {
  const { weekIdx, rIdx, daysAgo, deload } = plan;
  const startedAt = at(
    daysAgo,
    17 + Math.floor(rnd() * 2),
    Math.floor(rnd() * 55),
  );
  if (startedAt > now) continue;

  // Sleep and stress carry a real encoded effect; carbs and caffeine
  // deliberately carry none, so the Findings screen also demonstrates the
  // guardrails refusing to call a correlation that isn't there.
  const [b0, b1, b2] = bits.get(plan)!;
  seen[rIdx] = (seen[rIdx] ?? 0) + 1;
  const rep = seen[rIdx] % 4; // which value within the level
  const lvl = (m: { lo: number[]; hi: number[] }, hi: number) =>
    (hi ? m.hi : m.lo)[rep];
  const sleepH = Math.round((lvl(LEVELS.sleep, b0) + jitter(0.2)) * 10) / 10;
  const stress = lvl(LEVELS.stress, b0 ^ b1);
  const carbs = Math.max(
    0,
    Math.round((lvl(LEVELS.carbs, b1) + jitter(6)) / 5) * 5,
  );
  const caffeine = lvl(LEVELS.caffeine, b2);
  // NOTE: only write condition values you want ANALYSED. `conditionFindings`
  // reads every numeric condition present on a session, tracked or not.
  // Two conditions were deliberately removed from this object after seeing
  // what they did to the Findings screen:
  //   * "Last meal (h before)", idly jittered, added ~15 junk findings that
  //     cleared the 3% threshold on noise alone.
  //   * "Bodyweight" is worse than noise — it is a proxy for TIME. Every lift
  //     also trends with time, so a median split on a drifting bodyweight is
  //     an early-vs-late split that re-reports the progression curve as a
  //     correlation: 15 rows at +10..17% ("Leg Press e1RM +16.9% on high
  //     Bodyweight days"), crowding the real sleep effect off the screen.
  //     Bodyweight lives in `measurements` (its canonical store) instead.
  //
  // The fabricated effect the Findings engine is meant to rediscover:
  // ~5% top-set performance across the sleep split, ~2.5% across stress. Set
  // deliberately above MIN_EFFECT_PCT (3%) with room to spare, because
  // routine-to-routine tonnage variance is large noise for a median split.
  const form =
    1 +
    ((sleepH - 7) / 1.6) * 0.045 -
    ((stress - 5) / 5) * 0.025 +
    jitter(0.01);

  const sessionId = uuid();
  const durationMin = 52 + Math.round(jitter(14)) + (deload ? -10 : 0);
  sessionCount++;
  rows.sessions.push({
    id: sessionId,
    ...stamp(startedAt),
    title: ROUTINES[rIdx].name,
    started_at: startedAt,
    ended_at: startedAt + durationMin * 60_000,
    routine_id: routineId[rIdx],
    paused_ms: rnd() < 0.2 ? Math.round(rnd() * 240_000) : 0,
    condition_values: {
      [C.sleepH]: sleepH,
      [C.stress]: stress,
      [C.preCarbsG]: carbs,
      [C.caffeineMg]: caffeine,
      ...(rnd() < 0.25
        ? {
            [C.mealNote]: pick([
              "oats + banana",
              "rice + chicken",
              "protein shake only",
              "big lunch, felt heavy",
            ]),
          }
        : {}),
    },
    notes:
      rnd() < 0.18
        ? pick([
            "Bar speed felt good.",
            "Left shoulder cranky on the last set.",
            "Gym was packed, rushed the accessories.",
            "Deload — kept everything crisp.",
          ])
        : null,
  });

  ROUTINES[rIdx].slots.forEach((s, j) => {
    const seId = uuid();
    rows.session_exercises.push({
      id: seId,
      ...stamp(startedAt),
      session_id: sessionId,
      exercise_id: exId.get(s.name),
      order_index: j,
      rest_sec: s.rest,
      note: j === 0 && rnd() < 0.15 ? "Pause on the chest, no bounce." : null,
    });

    const fields = TYPE_FIELDS[exType.get(s.name)!];
    const base = s.kg + s.gain * weekIdx;
    const working = fields.weight
      ? round(base * form * (deload ? 0.9 : 1), 2.5)
      : 0;
    let setNo = 0;
    // Warm-ups on the main lift only.
    for (let w = 0; w < (s.warmups ?? 0); w++) {
      rows.set_logs.push({
        id: uuid(),
        ...stamp(startedAt),
        session_exercise_id: seId,
        set_no: setNo++,
        set_type: "warmup",
        weight_kg: fields.weight ? round(working * (0.5 + 0.15 * w), 2.5) : null,
        reps: 5,
        rir: null,
        rest_sec: 60,
        completed: true,
      });
    }
    const workSets = s.sets;
    for (let n = 0; n < workSets; n++) {
      // Reps drift down / RIR drops as the sets accumulate.
      const reps = Math.max(
        1,
        s.reps - (n >= 2 ? 1 : 0) + (rnd() < 0.25 ? 1 : 0),
      );
      const rir = deload
        ? 3 + (n === 0 ? 1 : 0)
        : Math.max(0, 3 - n - (rnd() < 0.3 ? 1 : 0));
      rows.set_logs.push({
        id: uuid(),
        ...stamp(startedAt),
        session_exercise_id: seId,
        set_no: setNo++,
        set_type:
          rir === 0 && n === workSets - 1 && rnd() < 0.25
            ? "failure"
            : "normal",
        weight_kg: !fields.weight
          ? null
          : n === 0
            ? working
            : round(working * (1 - 0.02 * n), 2.5),
        reps,
        rir,
        rest_sec: s.rest,
        note: null,
        completed: true,
      });
    }
  });
}

// Weekly body measurement (Sunday), including the skipped weeks — stepping on
// the scale is not the same habit as training, and Measures having its own
// cadence is part of what makes the account look lived-in.
for (let week = WEEKS; week >= 1; week--) {
  const weekIdx = WEEKS - week;
  const mDaysAgo = daysAgoFor(week, 0);
  if (mDaysAgo < 0) continue;
  rows.measurements.push({
    id: uuid(),
    ...stamp(at(mDaysAgo, 8, 0)),
    measured_on: dateKey(at(mDaysAgo, 8, 0)),
    bodyweight_kg:
      Math.round((79.5 + Math.sin(weekIdx / 3.5) * 0.8 + jitter(0.3)) * 10) /
      10,
    bodyfat_pct: Math.round((15.5 - weekIdx * 0.05 + jitter(0.4)) * 10) / 10,
    waist_cm: Math.round((83 - weekIdx * 0.05 + jitter(0.5)) * 10) / 10,
    chest_cm: Math.round((104 + weekIdx * 0.06 + jitter(0.4)) * 10) / 10,
    bicep_l_cm: Math.round((37.5 + weekIdx * 0.03 + jitter(0.3)) * 10) / 10,
    bicep_r_cm: Math.round((37.8 + weekIdx * 0.03 + jitter(0.3)) * 10) / 10,
    thigh_l_cm: Math.round((60 + weekIdx * 0.04 + jitter(0.4)) * 10) / 10,
    thigh_r_cm: Math.round((60.2 + weekIdx * 0.04 + jitter(0.4)) * 10) / 10,
  });
}

// Tracked conditions: the four numeric ones written onto sessions above
// (Bodyweight is deliberately not one of them — see the note there), so
// Findings has something to correlate the moment the account is opened.
[C.sleepH, C.stress, C.preCarbsG, C.caffeineMg].forEach((metricId, i) => {
  rows.tracked_conditions.push({
    id: uuid(),
    ...stamp(now),
    metric_id: metricId,
    tracked: true,
    position: i,
  });
});
["Bench Press", "Barbell Squat", "Barbell Deadlift", "Pullups"].forEach((n) => {
  rows.exercise_favorites.push({
    id: uuid(),
    ...stamp(now),
    exercise_id: exId.get(n),
    favorite: true,
  });
});
rows.user_prefs.push({
  id: uuid(),
  ...stamp(now),
  include_warmups_in_stats: false,
  default_rest_sec: 150,
  previous_values_scope: "any",
  body_diagram: "neutral",
  display_name: "Frog Dev",
});

// ── write ───────────────────────────────────────────────────────────────────
const ORDER: (keyof typeof rows)[] = [
  "routine_folders",
  "routines",
  "routine_exercises",
  "routine_sets",
  "programs",
  "sessions",
  "session_exercises",
  "set_logs",
  "measurements",
  "tracked_conditions",
  "exercise_favorites",
  "user_prefs",
];
for (const table of ORDER) {
  const batch = rows[table];
  for (let i = 0; i < batch.length; i += 500) {
    const { error } = await db.from(table).insert(batch.slice(i, i + 500));
    if (error) throw new Error(`${table}: ${error.message}`);
  }
  console.log(`  ${table.padEnd(20)} ${batch.length}`);
}
console.log(
  `\nSeeded ${sessionCount} sessions / ${rows.set_logs.length} sets over ${WEEKS} weeks ` +
    `for ${OWNER} on ${hosted ? "HOSTED" : "local"} ${conn.url}`,
);
