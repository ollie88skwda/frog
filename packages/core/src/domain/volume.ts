// Volume math per exercise type (Hevy-parity plan §B, "volume math deviation"
// in docs/DECISIONS.md): the rule follows exerciseType uniformly for ALL
// exercises, custom or seed. Bodyweight comes from the latest measurement on
// or before the set's date; with no bodyweight logged, bodyweight-based
// volume is simply not computed (returns 0).

import type { ExerciseType } from "./exercise-types";

export type VolumeSet = {
  weightKg: number | null;
  reps: number | null;
  setType?: string;
};

// Volume load for one set, in kg. weightKg is reinterpreted per type:
// plain load (weight_reps/weight_duration/weight_distance), added weight
// (weighted_bodyweight), assistance weight (assisted_bodyweight).
export function setVolumeKg(
  type: ExerciseType,
  set: VolumeSet,
  bodyweightKg: number | null | undefined,
): number {
  const reps = set.reps ?? 0;
  const w = set.weightKg ?? 0;
  switch (type) {
    case "weight_reps":
      return w * reps;
    case "bodyweight_reps":
      return bodyweightKg ? bodyweightKg * reps : 0;
    case "weighted_bodyweight":
      return bodyweightKg ? (bodyweightKg + w) * reps : 0;
    case "assisted_bodyweight":
      return bodyweightKg ? Math.max(0, bodyweightKg - w) * reps : 0;
    // Duration/distance types carry no rep-based tonnage.
    case "duration":
    case "weight_duration":
    case "distance_duration":
    case "weight_distance":
      return 0;
  }
}

export type VolumeOptions = {
  // Settings > Workouts > "Warm Up Sets" toggle: when false, warm-up sets are
  // excluded from totals (and records — handled in records/).
  includeWarmups: boolean;
};

export function countsForStats(
  set: { setType?: string; completed?: boolean },
  opts: VolumeOptions,
): boolean {
  if (set.completed === false) return false;
  if (!opts.includeWarmups && set.setType === "warmup") return false;
  return true;
}

export function sessionVolumeKg(
  blocks: Array<{
    exerciseType: ExerciseType;
    sets: Array<VolumeSet & { completed?: boolean }>;
  }>,
  bodyweightKg: number | null | undefined,
  opts: VolumeOptions = { includeWarmups: true },
): number {
  let total = 0;
  for (const b of blocks) {
    for (const s of b.sets) {
      if (!countsForStats(s, opts)) continue;
      total += setVolumeKg(b.exerciseType, s, bodyweightKg);
    }
  }
  return total;
}

export type CountableSet = {
  setNo: number;
  side?: string | null;
  setType?: string;
  completed?: boolean;
};

/**
 * How many *physical* sets a list of set rows represents. A unilateral set is
 * two rows sharing one set_no and counts once. Rows with side == null are
 * whole sets and always count. Grouping by set_no (not "count only the left
 * rows") means a set logged for one side only still counts as one set
 * instead of zero.
 */
export function countSets(
  sets: CountableSet[],
  opts: VolumeOptions = { includeWarmups: true },
): number {
  const seenPairs = new Set<number>();
  let n = 0;
  for (const s of sets) {
    if (!countsForStats(s, opts)) continue;
    if (s.side == null) {
      n += 1;
      continue;
    }
    if (seenPairs.has(s.setNo)) continue; // sibling already counted
    seenPairs.add(s.setNo);
    n += 1;
  }
  return n;
}

export function sessionSetCount(
  blocks: Array<{ sets: CountableSet[] }>,
  opts: VolumeOptions = { includeWarmups: true },
): number {
  let n = 0;
  for (const b of blocks) n += countSets(b.sets, opts);
  return n;
}

/**
 * Groups set rows into *physical* sets — the projection counterpart of
 * countSets. A unilateral pair is two rows sharing one set_no and yields one
 * group; every row with side == null is its own singleton group. Input order
 * is preserved, so with the repo's left-before-right ordering `group[0]` is
 * the left side and serves as the template for one-value-per-set projections
 * (routine write-back, copy-workout seeds, committed-row rendering). Anything
 * projecting sets outward must emit one output per group, never one per row.
 */
export function groupSetsBySetNo<
  T extends { setNo: number; side?: string | null },
>(sets: T[]): T[][] {
  const groups: T[][] = [];
  const bySetNo = new Map<number, T[]>();
  for (const s of sets) {
    if (s.side == null) {
      groups.push([s]);
      continue;
    }
    let g = bySetNo.get(s.setNo);
    if (!g) {
      g = [];
      bySetNo.set(s.setNo, g);
      groups.push(g);
    }
    g.push(s);
  }
  return groups;
}
