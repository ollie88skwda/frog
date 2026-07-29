// Monthly report builder (Hevy-parity plan §C). Frog improvement over Hevy:
// any completed month is viewable (archive), not just the most recent.

import { localDateKey } from "../domain/streak";
import { computeRecords } from "../records/records";
import type { PrEvent, RecordsSessionInput } from "../records/types";
import {
  type Distribution,
  distributionBetween,
  type MainExercise,
  type MuscleByExercise,
  mainExercises,
  type StatsOptions,
} from "./aggregate";

export type MonthlyReport = {
  year: number;
  month: number; // 0-based
  totals: Distribution["totals"];
  distribution: Distribution;
  previous: Distribution; // prior calendar month
  prEvents: PrEvent[]; // PRs earned inside the month
  workoutDays: string[]; // YYYY-MM-DD with ≥1 session
  topExercises: MainExercise[];
};

/** Months (year, 0-based month) that have at least one session — the archive. */
export function reportableMonths(
  history: RecordsSessionInput[],
): Array<{ year: number; month: number }> {
  const seen = new Set<string>();
  const out: Array<{ year: number; month: number }> = [];
  for (const s of history) {
    const d = new Date(s.startedAt);
    const key = `${d.getFullYear()}-${d.getMonth()}`;
    if (!seen.has(key)) {
      seen.add(key);
      out.push({ year: d.getFullYear(), month: d.getMonth() });
    }
  }
  return out.sort((a, b) => b.year - a.year || b.month - a.month);
}

export function monthlyReport(
  history: RecordsSessionInput[],
  muscles: MuscleByExercise,
  year: number,
  month: number,
  opts: StatsOptions,
  bodyweightKg: number | null = null,
): MonthlyReport {
  const from = new Date(year, month, 1).getTime();
  const to = new Date(year, month + 1, 1).getTime();
  const prevFrom = new Date(year, month - 1, 1).getTime();

  const distribution = distributionBetween(
    history,
    muscles,
    from,
    to,
    opts,
    bodyweightKg,
  );
  const previous = distributionBetween(
    history,
    muscles,
    prevFrom,
    from,
    opts,
    bodyweightKg,
  );

  const { events } = computeRecords(history, {
    includeWarmups: opts.includeWarmups,
  });
  const prEvents = events.filter((e) => e.at >= from && e.at < to);

  const workoutDays = [
    ...new Set(
      history
        .filter((s) => s.startedAt >= from && s.startedAt < to)
        .map((s) => localDateKey(s.startedAt)),
    ),
  ].sort();

  const monthOpts = { ...opts, now: to - 1 };
  const topExercises = mainExercises(history, "30d", monthOpts).slice(0, 8);

  return {
    year,
    month,
    totals: distribution.totals,
    distribution,
    previous,
    prEvents,
    workoutDays,
    topExercises,
  };
}
