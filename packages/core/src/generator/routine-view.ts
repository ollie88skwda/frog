// Saved routines → the flat `ProgramView` the program validator and weekly
// meter read (F8 routine-editor meter rail, F14). Lets the meter work for any
// program, builder-made or hand-built. Pure. R7: direct = primary muscles,
// indirect = secondary muscles at the rule's fractional weight; warm-ups are
// never counted (boss preference 2026-11-13, R17b).

import { primaryMuscles, secondaryMuscles } from "../domain/anatomy";
import type { MuscleTarget } from "../domain/anatomy";
import { PROGRAM_RULES } from "../program/rules";
import type {
  ProgramSchedule,
  ProgramView,
  SlotRole,
  ViewSession,
  ViewSlot,
} from "../program/types";

export type RoutineViewSet = {
  setType?: string | null;
  targetReps?: number | null;
  targetRepsMax?: number | null;
  targetRirMin?: number | null;
  targetRirMax?: number | null;
};

export type RoutineViewExercise = {
  exerciseId: string;
  restSec?: number | null;
  sets: readonly RoutineViewSet[];
};

export type RoutineViewInput = {
  id: string;
  name: string;
  exercises: readonly RoutineViewExercise[];
};

/** The slice of an exercise the view needs. */
export type ViewExercise = {
  mechanic?: string | null;
  muscleTargets?: readonly MuscleTarget[] | null;
};

const isWorking = (s: RoutineViewSet) =>
  s.setType !== "warmup" && s.setType !== "warm-up";

const DEFAULT_REPS: [number, number] = [
  PROGRAM_RULES.repsMost[0],
  PROGRAM_RULES.repsMost[1],
];

function slotFor(
  ex: RoutineViewExercise,
  lookup: ReadonlyMap<string, ViewExercise>,
  index: number,
): ViewSlot | null {
  const working = ex.sets.filter(isWorking);
  if (working.length === 0) return null;
  const meta = lookup.get(ex.exerciseId);
  const targets = meta?.muscleTargets ?? null;
  const first = working[0];
  const reps: [number, number] =
    first.targetReps != null
      ? [first.targetReps, first.targetRepsMax ?? first.targetReps]
      : DEFAULT_REPS;
  const rir: [number, number] =
    first.targetRirMin != null
      ? [first.targetRirMin, first.targetRirMax ?? first.targetRirMin]
      : [PROGRAM_RULES.rirDefault[0], PROGRAM_RULES.rirDefault[1]];
  const rest = ex.restSec ?? PROGRAM_RULES.restHeavySec[0];
  const role: SlotRole =
    meta?.mechanic === "isolation"
      ? "isolation"
      : meta?.mechanic === "compound"
        ? "compound"
        : (targets?.length ?? 0) >= 2
          ? "compound"
          : "isolation";
  return {
    slot: `${index + 1}`,
    role,
    credits: {
      direct: primaryMuscles(targets),
      indirect: secondaryMuscles(targets),
    },
    rx: {
      sets: working.length,
      reps,
      rir,
      restSec: [rest, rest],
      warmup: "none",
    },
  };
}

export function viewFromRoutines(
  routines: readonly RoutineViewInput[],
  lookup: ReadonlyMap<string, ViewExercise>,
  opts: {
    schedule?: ProgramSchedule;
    maxMinutes?: number;
    goal?: ProgramView["goal"];
  } = {},
): ProgramView {
  const sessions: ViewSession[] = routines.map((r) => ({
    id: r.id,
    name: r.name,
    slots: r.exercises.flatMap((ex, i) => {
      const s = slotFor(ex, lookup, i);
      return s ? [s] : [];
    }),
  }));
  return {
    schedule: opts.schedule ?? { kind: "interval", everyDays: 2 },
    rotation: routines.length > 1 ? "cycle" : "same",
    sessions,
    block: null,
    goal: opts.goal ?? "muscle",
    maxMinutes: opts.maxMinutes,
  };
}
