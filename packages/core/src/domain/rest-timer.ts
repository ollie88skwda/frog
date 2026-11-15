// Rest-stopwatch model: pure state math; the UI owns the ticking. Auto-starts
// when a set is completed; suppressed when the NEXT set is a drop set, when
// the just-completed set was a warm-up, or on exercise types where "resting
// between sets" isn't a meaningful concept (duration/distance-based, e.g.
// plank or running).

import { type ExerciseType, supportsEffort } from "./exercise-types";

export type RestTimerState = {
  startedAt: number; // ms epoch
};

export function startRest(now: number): RestTimerState {
  return { startedAt: now };
}

/**
 * Whether completing a set should start the rest stopwatch: suppressed when
 * the next set is a drop set (back-to-back weight reductions, no rest by
 * definition), when the completed set was a warm-up, or when the exercise
 * isn't rep/weight-based.
 */
export function shouldStartRest(
  nextSetType: string | null | undefined,
  committedSetType: string | null | undefined,
  exerciseType: ExerciseType,
): boolean {
  if (committedSetType === "warmup") return false;
  if (!supportsEffort(exerciseType)) return false;
  return nextSetType !== "drop";
}
