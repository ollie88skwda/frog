// Pure helpers behind the program builder UI (F8, F11, F14). No React, so
// they are unit-tested in logic.test.ts. Every number that encodes a research
// rule comes from PROGRAM_RULES (R8b/R10/R15); nothing is hard-coded here.

import {
  type BuilderAnswers,
  DEFAULT_ANSWERS,
  type EquipmentKind,
  type GeneratorConfig,
  jointActionLabel,
  MUSCLE_REGION_LABELS,
  type MuscleSets,
  type MuscleTarget,
  muscleLabel,
  type ProgramGoal,
  type ProgramSchedule,
  type ProgramView,
  type ProgramWeekday,
  primaryMuscles,
  PROGRAM_RULES as R,
  type ResolvedProgram,
  regionOf,
  type SlotOverride,
  type SlotPrescription,
  type SlotTemplate,
  secondaryMuscles,
  sessionsPerWeek,
  type TrainingStatus,
} from "@frog/core";

export type ScheduleOption = {
  id: string;
  label: string;
  hint: string;
  schedule: ProgramSchedule;
};

const days = (...d: ProgramWeekday[]): ProgramSchedule => ({
  kind: "weekdays",
  days: d,
});

/** Question 1. Every other day is Oliver's method and the pre-selected default. */
export const SCHEDULE_OPTIONS: readonly ScheduleOption[] = [
  {
    id: "eod",
    label: "Every other day",
    hint: "About 3-4 a week. Oliver's method.",
    schedule: { kind: "interval", everyDays: 2 },
  },
  {
    id: "3",
    label: "3 fixed days",
    hint: "Mon, Wed, Fri",
    schedule: days(1, 3, 5),
  },
  {
    id: "4",
    label: "4 days",
    hint: "Mon, Tue, Thu, Fri",
    schedule: days(1, 2, 4, 5),
  },
  {
    id: "5",
    label: "5 days",
    hint: "Mon to Fri",
    schedule: days(1, 2, 3, 4, 5),
  },
  { id: "2", label: "2 days", hint: "Mon, Thu", schedule: days(1, 4) },
  {
    id: "custom",
    label: "Pick weekdays",
    hint: "Choose your own",
    schedule: days(1, 3, 5),
  },
];

export const WEEKDAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const sameDays = (a: readonly number[], b: readonly number[]) =>
  a.length === b.length && a.every((d, i) => d === b[i]);

/** Which option chip a schedule corresponds to (custom for anything else). */
export function scheduleOptionId(s: ProgramSchedule): string {
  if (s.kind === "interval") return s.everyDays === 2 ? "eod" : "custom";
  const sorted = [...s.days].sort();
  const hit = SCHEDULE_OPTIONS.find(
    (o) =>
      o.id !== "custom" &&
      o.schedule.kind === "weekdays" &&
      sameDays(o.schedule.days, sorted),
  );
  return hit?.id ?? "custom";
}

const fmtN = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

export function scheduleLabel(s: ProgramSchedule): string {
  const per = `${fmtN(sessionsPerWeek(s))}×/wk`;
  if (s.kind === "interval") {
    return `${s.everyDays === 1 ? "Every day" : s.everyDays === 2 ? "Every other day" : "Every third day"} · ${per}`;
  }
  return `${[...s.days]
    .sort()
    .map((d) => WEEKDAY_SHORT[d])
    .join(", ")} · ${per}`;
}

export const GOAL_OPTIONS: readonly {
  id: ProgramGoal;
  label: string;
  hint: string;
}[] = [
  {
    id: "muscle",
    label: "Build muscle",
    hint: "Most sets near 1-3 reps in reserve",
  },
  { id: "strength", label: "Get stronger", hint: "Heavier, lower reps" },
  { id: "general", label: "Both", hint: "A balanced mix" },
  {
    id: "maintain",
    label: "Maintain",
    hint: "About a third of the sets, for busy weeks",
  },
];

export const STATUS_OPTIONS: readonly {
  id: TrainingStatus;
  label: string;
  hint: string;
}[] = [
  { id: "new", label: "New", hint: "Under 6 months" },
  { id: "intermediate", label: "Some experience", hint: "6 months to 2 years" },
  { id: "experienced", label: "Experienced", hint: "2 years or more" },
];

export const MINUTE_OPTIONS = [30, 45, 60, 75, 90] as const;

const ALL_GYM: EquipmentKind[] = DEFAULT_ANSWERS.equipment;

export const EQUIPMENT_PRESETS: readonly {
  id: string;
  label: string;
  hint: string;
  equipment: EquipmentKind[];
}[] = [
  {
    id: "gym",
    label: "Full gym",
    hint: "Barbells, machines, cables",
    equipment: ALL_GYM,
  },
  {
    id: "home",
    label: "Home dumbbells",
    hint: "Dumbbells and bodyweight",
    equipment: ["dumbbell", "bodyweight", "other"],
  },
  {
    id: "bodyweight",
    label: "Bodyweight",
    hint: "No equipment",
    equipment: ["bodyweight"],
  },
];

export function equipmentPresetId(equipment: readonly string[]): string {
  const set = new Set(equipment);
  const hit = EQUIPMENT_PRESETS.find(
    (p) =>
      p.equipment.length === set.size && p.equipment.every((e) => set.has(e)),
  );
  return hit?.id ?? "custom";
}

/** The wizard's seed: saved prefs where they exist, else Oliver's defaults. */
export function answersFromPrefs(
  base: BuilderAnswers,
  prefs: { goal: string | null; trainingStatus: string | null },
): BuilderAnswers {
  return {
    ...base,
    goal: prefs.goal === "maintain" ? "maintain" : base.goal,
    status:
      prefs.trainingStatus === "new" ||
      prefs.trainingStatus === "intermediate" ||
      prefs.trainingStatus === "experienced"
        ? prefs.trainingStatus
        : base.status,
  };
}

/** Prefs to write back after a save; only fields that map cleanly and are unset. */
export function prefsFromAnswers(
  a: BuilderAnswers,
  prefs: { goal: string | null; trainingStatus: string | null },
): { goal?: "build" | "maintain"; trainingStatus?: TrainingStatus } {
  const out: { goal?: "build" | "maintain"; trainingStatus?: TrainingStatus } =
    {};
  if (prefs.goal == null) {
    if (a.goal === "muscle") out.goal = "build";
    else if (a.goal === "maintain") out.goal = "maintain";
  }
  if (prefs.trainingStatus == null) out.trainingStatus = a.status;
  return out;
}

/** The older UL/PPL generator config, for answers no template covers (F8 "More templates"). */
export function toGeneratorConfig(a: BuilderAnswers): GeneratorConfig {
  const n = Math.round(sessionsPerWeek(a.schedule));
  return {
    goal: a.goal === "maintain" ? "general" : a.goal,
    experience:
      a.status === "new"
        ? "beginner"
        : a.status === "experienced"
          ? "advanced"
          : "intermediate",
    equipment: a.equipment,
    daysPerWeek: Math.min(6, Math.max(2, n)) as GeneratorConfig["daysPerWeek"],
    minutesPerWorkout: a.minutes,
  };
}

// ---- overrides --------------------------------------------------------

const sameTarget = (a: SlotOverride, b: SlotOverride) =>
  a.slot === b.slot && (a.session ?? null) === (b.session ?? null);

/** Merge one edit into the list; the latest value per field wins. */
export function upsertOverride(
  list: readonly SlotOverride[],
  o: SlotOverride,
): SlotOverride[] {
  const i = list.findIndex((x) => sameTarget(x, o));
  if (i < 0) return [...list, o];
  const next = [...list];
  next[i] = { ...list[i], ...o };
  return next;
}

/** Apply a validator one-tap fix (a ProgramPatch) to the override list. */
export function applyPatch(
  list: readonly SlotOverride[],
  patch: readonly SlotOverride[],
): SlotOverride[] {
  return patch.reduce<SlotOverride[]>(
    (acc, o) => upsertOverride(acc, o),
    [...list],
  );
}

// ---- presets (R8b, R10) -----------------------------------------------

export type RepPreset = { id: string; label: string; reps: [number, number] };
export const REP_PRESETS: readonly RepPreset[] = [
  { id: "compound", label: "Compound 4-8", reps: [...R.repsMost] },
  { id: "heaviest", label: "Heaviest 4-7", reps: [...R.repsHeaviest] },
  { id: "iso-heavy", label: "Isolation 4-8", reps: [...R.repsMost] },
  { id: "iso", label: "Isolation 10-15", reps: [...R.repsIsolation] },
];

export type RirPreset = { id: string; label: string; rir: [number, number] };
export const RIR_PRESETS: readonly RirPreset[] = [
  { id: "default", label: "1-3 (default)", rir: [...R.rirDefault] },
  {
    id: "last-iso",
    label: "0-1 (last isolation set)",
    rir: [...R.rirLastIsolationSet],
  },
  { id: "deload", label: "3-4 (deload)", rir: [...R.deloadRir] },
];

const range = (r: readonly [number, number]) =>
  r[0] === r[1] ? `${r[0]}` : `${r[0]}-${r[1]}`;

export const formatReps = range;

export function formatRest(sec: readonly [number, number]): string {
  const m = (s: number) =>
    s % 60 === 0 ? `${s / 60}` : `${(s / 60).toFixed(1)}`;
  return sec[0] === sec[1]
    ? `${m(sec[0])} min`
    : `${m(sec[0])}-${m(sec[1])} min`;
}

/** "3 × 4-8 · RIR 1-3 · rest 2-3 min" (report 8.4 slot row). */
export function prescriptionText(rx: SlotPrescription): string {
  return `${rx.sets} × ${range(rx.reps)} · RIR ${range(rx.rir)} · rest ${formatRest(rx.restSec)}`;
}

// ---- grouping (F14, D2) ----------------------------------------------

export type Grouping = "joint_action" | "region";

/** The heading a slot sits under: joint action (default) or muscle region. */
export function groupLabel(
  slot: Pick<SlotTemplate, "jointActions" | "credits">,
  grouping: Grouping,
): string {
  if (grouping === "joint_action") {
    const a = slot.jointActions[0];
    return a ? jointActionLabel(a) : "Other";
  }
  const m = slot.credits.direct[0];
  const r = m ? regionOf(m) : null;
  return r ? MUSCLE_REGION_LABELS[r] : "Other";
}

/** Keeps first-seen order; a single heading is returned as one group. */
export function groupBy<T>(
  items: readonly T[],
  label: (t: T) => string,
): { label: string; items: T[] }[] {
  const out: { label: string; items: T[] }[] = [];
  for (const it of items) {
    const l = label(it);
    const g = out.find((x) => x.label === l);
    if (g) g.items.push(it);
    else out.push({ label: l, items: [it] });
  }
  return out;
}

export type MeterRow = { muscle: string; label: string } & MuscleSets;

/** Weekly meter rows, biggest first (R6/R7). */
export function meterRows(weekly: Record<string, MuscleSets>): MeterRow[] {
  return Object.entries(weekly)
    .map(([muscle, w]) => ({ muscle, label: muscleLabel(muscle), ...w }))
    .sort((a, b) => b.total - a.total || a.label.localeCompare(b.label));
}

/** How many muscles sit in the 10-20 starting band (R6), for the collapsed rail. */
export function inBandCount(rows: readonly MeterRow[]): number {
  return rows.filter(
    (r) => r.total >= R.weeklySets[0] && r.total <= R.weeklySets[1],
  ).length;
}

/** R7b: a one-time info chip shows once a session has this many direct sets. */
export const CAP_CHIP_AT = R.directPerSession[1] + 1;

/** Highest-direct-set muscle per session with the R7b chip decision. */
export function sessionStrip(top: { muscle: string; sets: number } | null) {
  if (!top) return null;
  return {
    label: muscleLabel(top.muscle),
    sets: top.sets,
    // The planning range is 2-5; at 6 an info chip appears. Never a cap (C13).
    chip: top.sets >= CAP_CHIP_AT,
  };
}

// ---- swaps keep the meter honest (F14) --------------------------------

/** The slice of a library exercise credits are read from. */
export type CreditSource = {
  id: string;
  name: string;
  muscleTargets: readonly MuscleTarget[] | null;
};

/**
 * After a swap the template's credits no longer describe the lift. Re-read the
 * pinned exercise's primary (direct) and secondary (indirect, R7) muscles so
 * the weekly meter reflects what will actually be saved.
 */
export function withPinnedCredits(
  view: ProgramView,
  overrides: readonly SlotOverride[],
  byId: ReadonlyMap<string, CreditSource>,
): ProgramView {
  return {
    ...view,
    sessions: view.sessions.map((s) => ({
      ...s,
      slots: s.slots.map((slot) => {
        const pin = [...overrides]
          .reverse()
          .find(
            (o) =>
              o.slot === slot.slot &&
              o.exerciseId &&
              (o.session == null || o.session === s.id),
          );
        const ex = pin?.exerciseId ? byId.get(pin.exerciseId) : undefined;
        if (!ex?.muscleTargets?.length) return slot;
        return {
          ...slot,
          credits: {
            direct: primaryMuscles(ex.muscleTargets),
            indirect: secondaryMuscles(ex.muscleTargets),
          },
        };
      }),
    })),
  };
}

export type SlotChoice = { exerciseId: string; name: string; why?: string };

/**
 * slot → chosen exercise per session. `resolveTemplate` emits exercises in
 * view order and skips unresolved slots, so walk both lists together.
 */
export function slotChoices(
  view: ProgramView,
  resolved: ResolvedProgram,
  byId: ReadonlyMap<string, { name: string }>,
): Map<string, SlotChoice> {
  const out = new Map<string, SlotChoice>();
  const gone = new Set(
    resolved.unresolved.map((u) => `${u.session}|${u.slot}`),
  );
  view.sessions.forEach((s, si) => {
    const list = resolved.program.routines[si]?.exercises ?? [];
    let k = 0;
    for (const slot of s.slots) {
      const key = `${s.id}|${slot.slot}`;
      if (gone.has(key)) continue;
      const ex = list[k++];
      if (!ex) continue;
      out.set(key, {
        exerciseId: ex.exerciseId,
        name: byId.get(ex.exerciseId)?.name ?? "Exercise",
        why: resolved.chosen[s.id]?.[slot.slot]?.why,
      });
    }
  });
  return out;
}

/** Change in weekly fractional sets if a slot's credits move to a new lift. */
export function creditDelta(
  slot: {
    credits: { direct: string[]; indirect: string[] };
    rx: { sets: number };
  },
  next: { direct: string[]; indirect: string[] },
  perWeek: number,
): { muscle: string; label: string; delta: number }[] {
  const tally = (c: { direct: string[]; indirect: string[] }) => {
    const m = new Map<string, number>();
    for (const d of c.direct) m.set(d, (m.get(d) ?? 0) + 1);
    for (const i of c.indirect) m.set(i, (m.get(i) ?? 0) + R.indirectWeight);
    return m;
  };
  const a = tally(slot.credits);
  const b = tally(next);
  const out: { muscle: string; label: string; delta: number }[] = [];
  for (const k of new Set([...a.keys(), ...b.keys()])) {
    const d = ((b.get(k) ?? 0) - (a.get(k) ?? 0)) * slot.rx.sets * perWeek;
    if (Math.abs(d) > 0.01)
      out.push({
        muscle: k,
        label: muscleLabel(k),
        delta: Math.round(d * 10) / 10,
      });
  }
  return out.sort((x, y) => Math.abs(y.delta) - Math.abs(x.delta));
}

// ---- routine-editor presets (report 8.5) ------------------------------
// Operate on the editor's string-valued draft sets without importing them.

type RirSet = { setType: string; rirMin: string; rirMax: string };
const isWarm = (s: { setType: string }) =>
  s.setType === "warmup" || s.setType === "warm-up";

/**
 * Top set first (a method, not a research rule, T5): set 1 at RIR 1, the rest
 * 2-3. Mirrors `setTargets` in the program resolver so a routine edited here
 * reads the same as one the builder wrote.
 */
export function isTopSet(sets: readonly RirSet[]): boolean {
  const work = sets.filter((s) => !isWarm(s));
  if (work.length < 2) return false;
  const [first, ...rest] = work;
  return (
    first.rirMin === String(R.rirFloorCompound) &&
    first.rirMax === String(R.rirFloorCompound) &&
    rest.every((s) => s.rirMin !== "" && Number(s.rirMin) >= 2)
  );
}

export function applyTopSet<T extends RirSet>(
  sets: readonly T[],
  on: boolean,
): T[] {
  let seen = false;
  return sets.map((s) => {
    if (isWarm(s)) return s;
    if (!on)
      return {
        ...s,
        rirMin: String(R.rirDefault[0]),
        rirMax: String(R.rirDefault[1]),
      };
    if (!seen) {
      seen = true;
      return {
        ...s,
        rirMin: String(R.rirFloorCompound),
        rirMax: String(R.rirFloorCompound),
      };
    }
    return { ...s, rirMin: "2", rirMax: String(R.rirDefault[1]) };
  });
}

/** Set one rep range on every working set; warm-ups keep their own. */
export function applyReps<
  T extends { setType: string; reps: string; repsMax: string },
>(sets: readonly T[], reps: readonly [number, number]): T[] {
  return sets.map((s) =>
    isWarm(s) ? s : { ...s, reps: String(reps[0]), repsMax: String(reps[1]) },
  );
}

export function applyRir<T extends RirSet>(
  sets: readonly T[],
  rir: readonly [number, number],
): T[] {
  return sets.map((s) =>
    isWarm(s) ? s : { ...s, rirMin: String(rir[0]), rirMax: String(rir[1]) },
  );
}
