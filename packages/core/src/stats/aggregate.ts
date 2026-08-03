// Training-wide statistics aggregations (Hevy-parity plan §C): sets per
// muscle over time buckets, muscle/region distribution with prior-period
// compare, main exercises, weekly consistency. Pure functions over the
// recordsData() history + the client's cached exercise list — computed
// client-side like findings and records.

import type { MuscleRegion, MuscleTarget } from "../domain/anatomy";
import { regionOf, roleAt } from "../domain/anatomy";
import type { ExerciseType } from "../domain/exercise-types";
import { weekStart } from "../domain/streak";
import { countSets, countsForStats, setVolumeKg } from "../domain/volume";
import type { RecordsSessionInput, RecordsSetInput } from "../records/types";

export type StatsRange = "30d" | "3m" | "1y" | "all";
export type StatsGranularity = "week" | "month" | "year";

export type StatsOptions = {
  now: number;
  includeWarmups: boolean;
  firstWeekday: number; // week-granularity bucket boundary
};

const DAY = 24 * 60 * 60 * 1000;

export function rangeStart(range: StatsRange, now: number): number {
  switch (range) {
    case "30d":
      return now - 30 * DAY;
    case "3m":
      return now - 91 * DAY;
    case "1y":
      return now - 365 * DAY;
    case "all":
      return 0;
  }
}

/**
 * Set credit per muscle for one set: primary muscle 1.0, secondaries 0.5
 * (matches Hevy's fractional per-muscle set counts, e.g. "Shoulders 4.5").
 * A unilateral set is two rows sharing one set_no (see countSets); credit is
 * applied once per physical set by the caller, so no per-row multiplier is
 * needed here — 3 unilateral sets give the primary muscle 3.0 credit, same
 * as 3 bilateral sets.
 */
export function muscleCredits(
  targets: MuscleTarget[] | null | undefined,
): Array<{ muscle: string; credit: number }> {
  if (!targets?.length) return [];
  return targets.map((t, i) => ({
    muscle: t.muscle,
    credit: roleAt(targets, i) === "primary" ? 1 : 0.5,
  }));
}

export type MuscleInfo = {
  targets: MuscleTarget[] | null;
  laterality: string | null;
};
export type MuscleByExercise = Map<string, MuscleInfo>;

export type SetsPerMuscleBucket = {
  start: number; // bucket start ms
  counts: Record<string, number>; // muscleKey → fractional set count
};

/** Bucket start for a timestamp at the requested granularity. */
export function bucketStart(
  t: number,
  granularity: StatsGranularity,
  firstWeekday: number,
): number {
  if (granularity === "week") return weekStart(t, firstWeekday);
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  d.setDate(1);
  if (granularity === "year") d.setMonth(0);
  return d.getTime();
}

export function setsPerMuscle(
  history: RecordsSessionInput[],
  muscles: MuscleByExercise,
  range: StatsRange,
  granularity: StatsGranularity,
  opts: StatsOptions,
): SetsPerMuscleBucket[] {
  const from = rangeStart(range, opts.now);
  const buckets = new Map<number, Record<string, number>>();
  for (const s of history) {
    if (s.startedAt < from || s.startedAt > opts.now) continue;
    const b = bucketStart(s.startedAt, granularity, opts.firstWeekday);
    let bucket = buckets.get(b);
    if (!bucket) {
      bucket = {};
      buckets.set(b, bucket);
    }
    for (const ex of s.exercises) {
      const info = muscles.get(ex.exerciseId);
      const credits = muscleCredits(info?.targets);
      if (!credits.length) continue;
      const n = countSets(ex.sets, opts);
      if (n === 0) continue;
      for (const { muscle, credit } of credits) {
        bucket[muscle] = (bucket[muscle] ?? 0) + n * credit;
      }
    }
  }
  return [...buckets.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([start, c]) => ({ start, counts: c }));
}

export type DistributionTotals = {
  workouts: number;
  durationMs: number;
  volumeKg: number;
  sets: number;
};

export type Distribution = {
  /** Per-region tonnage (kg) in the period. */
  regionVolumeKg: Record<MuscleRegion, number>;
  /** Per-region fractional set counts in the period. */
  regionSets: Record<MuscleRegion, number>;
  /** Per-muscle fractional set counts (body heat-map intensity). */
  muscleSets: Record<string, number>;
  totals: DistributionTotals;
};

const emptyRegions = (): Record<MuscleRegion, number> => ({
  chest: 0,
  back: 0,
  legs: 0,
  shoulders: 0,
  arms: 0,
  core: 0,
});

function distributionWindow(
  history: RecordsSessionInput[],
  muscles: MuscleByExercise,
  from: number,
  to: number,
  opts: StatsOptions,
  bodyweightKg: number | null,
): Distribution {
  const regionVolumeKg = emptyRegions();
  const regionSets = emptyRegions();
  const muscleSets: Record<string, number> = {};
  const totals: DistributionTotals = {
    workouts: 0,
    durationMs: 0,
    volumeKg: 0,
    sets: 0,
  };
  for (const s of history) {
    if (s.startedAt < from || s.startedAt >= to) continue;
    totals.workouts += 1;
    if (s.endedAt)
      totals.durationMs += Math.max(
        0,
        s.endedAt - s.startedAt - (s.pausedMs ?? 0),
      );
    for (const ex of s.exercises) {
      const info = muscles.get(ex.exerciseId);
      const credits = muscleCredits(info?.targets);
      // A unilateral pair (two rows sharing set_no) counts and credits once,
      // on the first side seen — the sibling row still contributes its own
      // volume below, since that tonnage was actually lifted.
      const seenPairs = new Set<number>();
      for (const set of ex.sets) {
        if (!countsForStats(set, opts)) continue;
        const isNewPhysicalSet = set.side == null || !seenPairs.has(set.setNo);
        if (set.side != null) seenPairs.add(set.setNo);
        if (isNewPhysicalSet) totals.sets += 1;
        const vol = setVolumeKg(
          ex.exerciseType as ExerciseType,
          set as RecordsSetInput,
          bodyweightKg,
        );
        totals.volumeKg += vol;
        for (const { muscle, credit } of credits) {
          if (isNewPhysicalSet)
            muscleSets[muscle] = (muscleSets[muscle] ?? 0) + credit;
          const region = regionOf(muscle);
          if (region) {
            if (isNewPhysicalSet) regionSets[region] += credit;
            regionVolumeKg[region] += vol * credit;
          }
        }
      }
    }
  }
  return { regionVolumeKg, regionSets, muscleSets, totals };
}

export type DistributionCompare = {
  current: Distribution;
  previous: Distribution; // immediately preceding equal-length period
};

export function muscleDistribution(
  history: RecordsSessionInput[],
  muscles: MuscleByExercise,
  range: StatsRange,
  opts: StatsOptions,
  bodyweightKg: number | null = null,
): DistributionCompare {
  const from = rangeStart(range, opts.now);
  const span = range === "all" ? opts.now - from : opts.now - from;
  const current = distributionWindow(
    history,
    muscles,
    from,
    opts.now + 1,
    opts,
    bodyweightKg,
  );
  const previous =
    range === "all"
      ? distributionWindow(history, muscles, 0, 0, opts, bodyweightKg)
      : distributionWindow(
          history,
          muscles,
          from - span,
          from,
          opts,
          bodyweightKg,
        );
  return { current, previous };
}

/** Explicit calendar window variant (monthly report / body-view weeks). */
export function distributionBetween(
  history: RecordsSessionInput[],
  muscles: MuscleByExercise,
  from: number,
  to: number,
  opts: StatsOptions,
  bodyweightKg: number | null = null,
): Distribution {
  return distributionWindow(history, muscles, from, to, opts, bodyweightKg);
}

export type MainExercise = { exerciseId: string; sessions: number };

/** Most-frequently-logged exercises in the window (session count). */
export function mainExercises(
  history: RecordsSessionInput[],
  range: StatsRange,
  opts: StatsOptions,
): MainExercise[] {
  const from = rangeStart(range, opts.now);
  const bySessions = new Map<string, number>();
  for (const s of history) {
    if (s.startedAt < from || s.startedAt > opts.now) continue;
    const seen = new Set<string>();
    for (const ex of s.exercises) {
      if (ex.sets.length === 0 || seen.has(ex.exerciseId)) continue;
      seen.add(ex.exerciseId);
      bySessions.set(ex.exerciseId, (bySessions.get(ex.exerciseId) ?? 0) + 1);
    }
  }
  return [...bySessions.entries()]
    .map(([exerciseId, sessions]) => ({ exerciseId, sessions }))
    .sort((a, b) => b.sessions - a.sessions);
}

export type ConsistencyWeek = { weekStart: number; sessions: number };

/** Sessions per week for the trailing N weeks (oldest first). */
export function weeklyConsistency(
  history: RecordsSessionInput[],
  weeks: number,
  opts: StatsOptions,
): ConsistencyWeek[] {
  const thisWeek = weekStart(opts.now, opts.firstWeekday);
  const out: ConsistencyWeek[] = [];
  for (let i = weeks - 1; i >= 0; i--) {
    // Re-normalize per step: DST weeks aren't exactly 7×24h.
    const start = weekStart(
      thisWeek - i * 7 * DAY + DAY / 2,
      opts.firstWeekday,
    );
    out.push({ weekStart: start, sessions: 0 });
  }
  const index = new Map(out.map((w, i) => [w.weekStart, i]));
  for (const s of history) {
    const w = weekStart(s.startedAt, opts.firstWeekday);
    const i = index.get(w);
    if (i !== undefined) out[i].sessions += 1;
  }
  return out;
}

/** Per-muscle set counts over the trailing 7 days (rolling body heat map). */
export function sevenDayMuscleSets(
  history: RecordsSessionInput[],
  muscles: MuscleByExercise,
  opts: StatsOptions,
): Record<string, number> {
  return distributionWindow(
    history,
    muscles,
    opts.now - 7 * DAY,
    opts.now + 1,
    opts,
    null,
  ).muscleSets;
}
