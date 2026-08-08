import { robustTrend } from "../domain/progression";
import { sessionTopsByExercise } from "./series";
import type {
  CountdownFinding,
  FindingsSessionInput,
  TrendFinding,
} from "./types";

export const MIN_TREND_SESSIONS = 5;

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
        spanDays: result.spanDays,
      });
    }
  }
  return { trends, countdowns };
}
