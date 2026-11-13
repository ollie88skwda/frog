// Pure logic behind the prescription-aware Spotlight (redesign F1, §8.2) and
// the finish report (F9). No React, no DOM: unit-tested in prescription.test.ts.
//
// Rule IDs: R8b [T5] rep bands, R10 [T5] 1-3 RIR (last isolation set 0-1),
// R11 [T3] early-set RIR is the least reliable, C2c overshoot (>= 2 reps over
// the top of the range with RIR within 1 of plan counts as "top reached"),
// C4/C5 RIR drift. Hard sets (R6/R7) come from @frog/core's fractionalHardSets.
import { e1rmSet, roundE1rmDisplay } from "@frog/core";

/** The plan for one exercise: the §9.1 snapshot, or the routine seed's own targets. */
export type PlanTarget = {
  repsMin: number | null;
  repsMax: number | null;
  rirMin: number | null;
  rirMax: number | null;
  sets: number | null;
  loadKg: number | null;
  firstSetMax: boolean | null;
  isDeload: boolean;
  ruleId: string | null;
  /** snapshot = written at session start; seed = derived from routine sets. */
  source: "snapshot" | "seed";
};

type SnapshotLike = {
  plannedRepsMin: number | null;
  plannedRepsMax: number | null;
  plannedRirMin: number | null;
  plannedRirMax: number | null;
  plannedSets: number | null;
  plannedLoadKg: number | null;
  plannedFirstSetMax: boolean | null;
  plannedIsDeload: boolean | null;
  prescriptionRuleId: string | null;
};

/** Snapshot -> plan; null on pre-snapshot / ad-hoc blocks (every field null). */
export function planFromSnapshot(se: SnapshotLike): PlanTarget | null {
  const empty =
    se.plannedRepsMin == null &&
    se.plannedRepsMax == null &&
    se.plannedRirMin == null &&
    se.plannedRirMax == null &&
    se.plannedLoadKg == null &&
    se.plannedSets == null;
  if (empty) return null;
  return {
    repsMin: se.plannedRepsMin,
    repsMax: se.plannedRepsMax ?? se.plannedRepsMin,
    rirMin: se.plannedRirMin,
    rirMax: se.plannedRirMax ?? se.plannedRirMin,
    sets: se.plannedSets,
    loadKg: se.plannedLoadKg,
    firstSetMax: se.plannedFirstSetMax,
    isDeload: se.plannedIsDeload === true,
    ruleId: se.prescriptionRuleId,
    source: "snapshot",
  };
}

type SeedLike = {
  setType: string;
  weightKg: number | null;
  reps: number | null;
  repsMax: number | null;
  rirMin?: number | null;
  rirMax?: number | null;
};

/** Fallback when there is no snapshot: first working set of the routine seed. */
export function planFromSeed(seeds: readonly SeedLike[]): PlanTarget | null {
  const working = seeds.filter((s) => s.setType !== "warmup");
  const first = working[0];
  if (!first) return null;
  if (
    first.reps == null &&
    first.weightKg == null &&
    first.rirMin == null &&
    first.rirMax == null
  )
    return null;
  return {
    repsMin: first.reps,
    repsMax: first.repsMax ?? first.reps,
    rirMin: first.rirMin ?? first.rirMax ?? null,
    rirMax: first.rirMax ?? first.rirMin ?? null,
    sets: working.length,
    loadKg: first.weightKg,
    firstSetMax: null,
    isDeload: false,
    ruleId: null,
    source: "seed",
  };
}

export function formatRange(
  min: number | null,
  max: number | null,
): string | null {
  if (min == null && max == null) return null;
  const lo = min ?? max;
  const hi = max ?? min;
  return lo === hi ? `${lo}` : `${lo}-${hi}`;
}

/** RIR strip preselect: the midpoint of the planned range (1-3 -> 2). */
export function rirPreselect(
  min: number | null | undefined,
  max: number | null | undefined,
): number | null {
  if (min == null && max == null) return null;
  const lo = min ?? (max as number);
  const hi = max ?? lo;
  return Math.min(4, Math.max(0, Math.round((lo + hi) / 2)));
}

export type RangeKind = "below" | "in" | "top" | "over";
export type RangeState = { kind: RangeKind; over: number; label: string };

/**
 * Range-state chip after a commit (F1 acceptance: table-driven).
 * `over >= 2` with RIR within 1 of plan (or no RIR logged / no plan) is the
 * C2c overshoot: "add load next time". Otherwise at/above the top is "top of
 * range". Null when the plan has no rep range.
 */
export function rangeState(input: {
  reps: number | null;
  repsMin: number | null;
  repsMax: number | null;
  rir?: number | null;
  plannedRirMin?: number | null;
  plannedRirMax?: number | null;
}): RangeState | null {
  const { reps } = input;
  const lo = input.repsMin ?? input.repsMax;
  const hi = input.repsMax ?? input.repsMin;
  if (reps == null || reps < 1 || lo == null || hi == null) return null;
  if (reps < lo) return { kind: "below", over: 0, label: "below range" };
  if (reps <= hi) {
    if (reps === hi) return { kind: "top", over: 0, label: "top of range" };
    return { kind: "in", over: 0, label: "in range" };
  }
  const over = reps - hi;
  const planLo = input.plannedRirMin ?? input.plannedRirMax;
  const planHi = input.plannedRirMax ?? input.plannedRirMin;
  const rirWithin1 =
    input.rir == null ||
    planLo == null ||
    planHi == null ||
    (input.rir >= planLo - 1 && input.rir <= planHi + 1);
  if (over >= 2 && rirWithin1)
    return {
      kind: "over",
      over,
      label: `+${over} over: add load next time`,
    };
  return { kind: "top", over, label: "top of range" };
}

/**
 * C4/C5 drift nudge: both of the last two working sets landed 2+ RIR above the
 * plan ("last two sets ~4 left, plan is 2"). Never on set 1 (needs two logged
 * sets); the caller caps at 1 per exercise and 3 per session (F4 surface 2).
 * R11: early-set RIR is least reliable, hence the two-set requirement.
 */
export function driftNudge(
  workingRirs: ReadonlyArray<number | null>,
  planned: { rirMin: number | null; rirMax: number | null } | null,
): string | null {
  if (!planned) return null;
  const planMax = planned.rirMax ?? planned.rirMin;
  if (planMax == null) return null;
  const last = workingRirs.slice(-2);
  if (last.length < 2 || last.some((r) => r == null)) return null;
  const [a, b] = last as number[];
  if (a >= planMax + 2 && b >= planMax + 2)
    return `last two sets ~${Math.min(a, b)} left, plan is ${formatRange(planned.rirMin, planned.rirMax)}`;
  return null;
}

// ── e1RM for the report ─────────────────────────────────────────────────────

export type E1rmResult =
  | { kind: "value"; kg: number }
  | { kind: "not_estimable" };

/**
 * C2c-e1rm via J1's `e1rmSet` (Brzycki with RIR, <= 10 total reps, 0.5 kg
 * display rounding). A set refused by J1 (`flagged`) becomes `not_estimable`
 * so callers show a plain line instead of a number.
 */
export function reportE1rm(
  weightKg: number | null,
  reps: number | null,
  rir: number | null,
): E1rmResult | null {
  const r = e1rmSet(weightKg, reps, rir);
  if (r.flagged) return { kind: "not_estimable" };
  if (r.value == null) return null;
  return { kind: "value", kg: roundE1rmDisplay(r.value) };
}
