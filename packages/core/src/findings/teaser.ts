import { epley } from "../domain/e1rm";
import { robustTrend, type SessionTop } from "../domain/progression";
import type {
  CountdownFinding,
  FindingsSessionInput,
  TrendFinding,
} from "./types";

export const MIN_TREND_SESSIONS = 5;

const DAY_MS = 86_400_000;

/** Best (top-set) e1RM per exercise per session. */
function sessionTopsByExercise(
  sessions: FindingsSessionInput[],
): Map<string, { name: string; tops: SessionTop[] }> {
  const byExercise = new Map<string, { name: string; tops: SessionTop[] }>();
  for (const session of [...sessions].sort(
    (a, b) => a.startedAt - b.startedAt,
  )) {
    const best = new Map<string, { name: string; e1rm: number }>();
    for (const set of session.sets) {
      if (set.weightKg == null || set.reps == null || set.reps <= 0) continue;
      const e1 = epley(set.weightKg, set.reps);
      if (e1 == null) continue;
      const cur = best.get(set.exerciseId);
      if (!cur || e1 > cur.e1rm)
        best.set(set.exerciseId, { name: set.exerciseName, e1rm: e1 });
    }
    for (const [exerciseId, { name, e1rm }] of best) {
      const entry = byExercise.get(exerciseId) ?? { name, tops: [] };
      entry.tops.push({ day: session.startedAt / DAY_MS, e1rm });
      byExercise.set(exerciseId, entry);
    }
  }
  return byExercise;
}

/**
 * Progression trends per exercise (robust linear fit, MAD outlier rejection),
 * plus honest countdowns for exercises that don't have enough sessions yet.
 */
export function progressionFindings(sessions: FindingsSessionInput[]): {
  trends: TrendFinding[];
  countdowns: CountdownFinding[];
} {
  const trends: TrendFinding[] = [];
  const countdowns: CountdownFinding[] = [];
  for (const [exerciseId, { name, tops }] of sessionTopsByExercise(sessions)) {
    const result = robustTrend(tops);
    if (result.verdict === "INSUFFICIENT") {
      countdowns.push({
        kind: "countdown",
        exerciseId,
        exerciseName: name,
        sessionsLogged: tops.length,
        sessionsNeeded: MIN_TREND_SESSIONS - tops.length,
      });
    } else {
      trends.push({
        kind: "trend",
        exerciseId,
        exerciseName: name,
        verdict: result.verdict,
        pctChange: result.pctChange,
        perMonth: result.perMonth,
        n: result.n,
      });
    }
  }
  return { trends, countdowns };
}
