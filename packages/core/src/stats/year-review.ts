// Year in Review builder (Hevy-parity plan §C): story-slide data for one
// calendar year. Single-user reinterpretation — no social slides.

import type { MuscleRegion } from "../domain/anatomy";
import { computeStreak, localDateKey } from "../domain/streak";
import { computeRecords } from "../records/records";
import type { PrEvent, RecordsSessionInput } from "../records/types";
import {
  distributionBetween,
  type MainExercise,
  type MuscleByExercise,
  mainExercises,
  type StatsOptions,
} from "./aggregate";

export type YearReview = {
  year: number;
  workouts: number;
  activeMs: number;
  volumeKg: number;
  sets: number;
  /** 0-based month with the most workouts. */
  mostProductiveMonth: { month: number; workouts: number } | null;
  topRegions: Array<{ region: MuscleRegion; sets: number }>;
  topExercises: MainExercise[];
  prEvents: PrEvent[];
  longestStreakWeeks: number;
  workoutDays: string[];
};

export function yearReview(
  history: RecordsSessionInput[],
  muscles: MuscleByExercise,
  year: number,
  opts: StatsOptions,
  bodyweightKg: number | null = null,
): YearReview {
  const from = new Date(year, 0, 1).getTime();
  const to = new Date(year + 1, 0, 1).getTime();
  const inYear = history.filter((s) => s.startedAt >= from && s.startedAt < to);

  const dist = distributionBetween(
    history,
    muscles,
    from,
    to,
    opts,
    bodyweightKg,
  );

  const byMonth = new Map<number, number>();
  for (const s of inYear) {
    const m = new Date(s.startedAt).getMonth();
    byMonth.set(m, (byMonth.get(m) ?? 0) + 1);
  }
  const mostProductiveMonth =
    [...byMonth.entries()]
      .map(([month, workouts]) => ({ month, workouts }))
      .sort((a, b) => b.workouts - a.workouts)[0] ?? null;

  const topRegions = (
    Object.entries(dist.regionSets) as Array<[MuscleRegion, number]>
  )
    .map(([region, sets]) => ({ region, sets }))
    .filter((r) => r.sets > 0)
    .sort((a, b) => b.sets - a.sets)
    .slice(0, 3);

  const yearOpts = { ...opts, now: Math.min(opts.now, to - 1) };
  const topExercises = mainExercises(history, "1y", yearOpts).slice(0, 5);

  const { events } = computeRecords(history, {
    includeWarmups: opts.includeWarmups,
  });
  const prEvents = events.filter((e) => e.at >= from && e.at < to);

  // Longest streak achieved at any point in the year: evaluate the streak at
  // each week boundary that contains a workout and take the max.
  let longest = 0;
  const starts = inYear.map((s) => s.startedAt);
  for (const t of starts) {
    const r = computeStreak(
      history.map((s) => s.startedAt).filter((x) => x <= t),
      opts.firstWeekday,
      t,
    );
    if (r.weeks > longest) longest = r.weeks;
  }

  const workoutDays = [
    ...new Set(inYear.map((s) => localDateKey(s.startedAt))),
  ].sort();

  return {
    year,
    workouts: dist.totals.workouts,
    activeMs: dist.totals.durationMs,
    volumeKg: dist.totals.volumeKg,
    sets: dist.totals.sets,
    mostProductiveMonth,
    topRegions,
    topExercises,
    prEvents,
    longestStreakWeeks: longest,
    workoutDays,
  };
}
