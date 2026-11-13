import type {
  RoutineDetail,
  RoutineExerciseDetail,
  SnapshotOverride,
} from "@frog/core";
import { useRoutineDetail } from "@/lib/routine-queries";

// useCoach(): the one place screens read "what should I do next" from.
// J3's `evaluateCoach` has not landed on main, so this is the redesign §10 J6
// stub: it returns the routine's own authored targets as the prescription (no
// deltas, no cards). When J3 merges, only `useCoach` changes: it calls
// evaluateCoach and fills `delta`, `ruleId`, `cards` and `overrides`; every
// consumer (Today, and J7's Spotlight) keeps the same shape.

export type Prescription = {
  routineExerciseId: string;
  exerciseId: string;
  exerciseName: string;
  /** Working sets only: warm-ups are a minor part of Frog and never prescribed here. */
  sets: number;
  loadKg: number | null;
  repsMin: number | null;
  repsMax: number | null;
  rirMin: number | null;
  rirMax: number | null;
  /** Coach rule behind a changed target (e.g. C2c-progress); null = authored target. */
  ruleId: string | null;
  /** Signed kg change vs last time; null until the coach computes one. */
  deltaKg: number | null;
};

export type CoachCardModel = {
  id: string;
  title: string;
  reason: string;
  ruleId: string;
  tier: 1 | 2 | 3 | 4 | 5;
};

export type CoachResult = {
  prescriptions: Prescription[];
  cards: CoachCardModel[];
  /** Per routine_exercise id overrides for the session target snapshot (§9.1). */
  overrides: Record<string, SnapshotOverride> | undefined;
  /** "routine" while stubbed; "coach" once J3's evaluateCoach drives it. */
  source: "routine" | "coach";
  isLoading: boolean;
};

const WARMUP = "warmup";

/** Routine-authored targets for one exercise (working sets only). */
export function routinePrescription(e: RoutineExerciseDetail): Prescription {
  const working = e.sets.filter((s) => s.setType !== WARMUP);
  const first = working[0];
  return {
    routineExerciseId: e.id,
    exerciseId: e.exerciseId,
    exerciseName: e.exerciseName,
    sets: working.length,
    loadKg: first?.targetWeightKg ?? null,
    repsMin: first?.targetReps ?? null,
    repsMax: first?.targetRepsMax ?? null,
    rirMin: first?.targetRirMin ?? null,
    rirMax: first?.targetRirMax ?? null,
    ruleId: null,
    deltaKg: null,
  };
}

export function routinePrescriptions(detail: RoutineDetail): Prescription[] {
  return detail.exercises.map(routinePrescription);
}

/** "6-8", "8", or null. */
export function formatReps(p: Pick<Prescription, "repsMin" | "repsMax">) {
  if (p.repsMin == null) return null;
  return p.repsMax != null && p.repsMax !== p.repsMin
    ? `${p.repsMin}-${p.repsMax}`
    : `${p.repsMin}`;
}

/** "@2" or "@1-3", or null. */
export function formatRir(p: Pick<Prescription, "rirMin" | "rirMax">) {
  if (p.rirMin == null && p.rirMax == null) return null;
  const lo = p.rirMin ?? p.rirMax;
  const hi = p.rirMax ?? p.rirMin;
  return lo === hi ? `@${lo}` : `@${lo}-${hi}`;
}

/** Rough session length: working sets × (rest + ~45 s under tension). */
export function estimateMinutes(detail: RoutineDetail): number {
  let sec = 0;
  for (const e of detail.exercises) {
    const n = e.sets.filter((s) => s.setType !== WARMUP).length;
    sec += n * ((e.restSec ?? 90) + 45);
  }
  return Math.max(5, Math.round(sec / 60 / 5) * 5);
}

const DAY = 86_400_000;
/** C15 [T5]: after 2+ weeks off, restart near 80-90% of previous loads. */
export const RESTART_GAP_DAYS = 14;

/** Whole days since the last completed session, or null if it was < 14 d (or never). */
export function restartGapDays(
  lastEndedAt: number | null | undefined,
  now = Date.now(),
): number | null {
  if (lastEndedAt == null) return null;
  const days = Math.floor((now - lastEndedAt) / DAY);
  return days >= RESTART_GAP_DAYS ? days : null;
}

export function useCoach(routineId: string | null): CoachResult {
  const { data: detail, isLoading } = useRoutineDetail(routineId);
  return {
    prescriptions: detail ? routinePrescriptions(detail) : [],
    cards: [],
    overrides: undefined,
    source: "routine",
    isLoading,
  };
}
