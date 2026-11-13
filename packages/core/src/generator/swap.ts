// Smart swap ranking (F14, R12b, R13). Candidates must train the same primary
// muscle; they rank by region cell, then joint action, then stability, then
// name. Stability only orders "easier to load and progress" (R13); it never
// claims faster growth.

import { primaryMuscles } from "../domain/anatomy";
import { stabilityRank } from "../domain/stability";
import type { SelectableExercise } from "./types";

export type SwapCandidate = SelectableExercise & {
  jointActions?: readonly string[] | null;
};

export type SwapContext = {
  /** Region cell key (R12b) per exercise id, when known from a template menu. */
  regionOf?: (exerciseId: string) => string | null;
  /** The region cell the swapped-out slot fills. */
  currentRegion?: string | null;
  excludeIds?: ReadonlySet<string>;
  limit?: number;
};

export type RankedSwap = {
  exercise: SwapCandidate;
  sameRegion: boolean;
  sharedActions: string[];
  stability: number;
};

export function rankSwaps(
  current: SwapCandidate,
  library: readonly SwapCandidate[],
  ctx: SwapContext = {},
): RankedSwap[] {
  const primary = new Set(primaryMuscles(current.muscleTargets as never));
  const actions = new Set(current.jointActions ?? []);
  const out: RankedSwap[] = [];
  for (const e of library) {
    if (e.id === current.id || ctx.excludeIds?.has(e.id)) continue;
    if (
      !["weight_reps", "bodyweight_reps", "weighted_bodyweight"].includes(
        e.exerciseType,
      )
    )
      continue;
    const mine = primaryMuscles(e.muscleTargets as never);
    if (primary.size === 0 || !mine.some((m) => primary.has(m))) continue;
    const region = ctx.regionOf?.(e.id) ?? null;
    out.push({
      exercise: e,
      sameRegion:
        ctx.currentRegion != null &&
        region != null &&
        region === ctx.currentRegion,
      sharedActions: (e.jointActions ?? []).filter((a) => actions.has(a)),
      stability: stabilityRank(e.equipment),
    });
  }
  out.sort(
    (a, b) =>
      Number(b.sameRegion) - Number(a.sameRegion) ||
      Number(b.sharedActions.length > 0) - Number(a.sharedActions.length > 0) ||
      b.stability - a.stability ||
      Number(a.exercise.isCustom) - Number(b.exercise.isCustom) ||
      a.exercise.name.localeCompare(b.exercise.name),
  );
  return ctx.limit ? out.slice(0, ctx.limit) : out;
}
