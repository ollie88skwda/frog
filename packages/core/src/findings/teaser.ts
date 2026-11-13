import { robustTrend } from "../domain/progression";
import { liftStatus } from "../domain/stall";
import { sessionTopsByExercise } from "./series";
import type {
  CountdownFinding,
  FindingsSessionInput,
  TrendFinding,
} from "./types";

export const MIN_TREND_SESSIONS = 2;

/** Sessions of an exercise before its trend is labeled confident (medium)
 * rather than a rough estimate (low). Note 12 (2026-08-08): findings appear
 * from 2 sessions, but the 2-5 range is explicitly presented as a rough
 * estimate with a high chance of error — the old 5-session hard gate became
 * the low/medium confidence boundary instead of a withhold. */
export const TREND_CONFIDENCE_SESSIONS = 6;

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
  for (const [exerciseId, { name, tops, comparable }] of sessionTopsByExercise(
    sessions,
  )) {
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
      // C2c: once 7 comparable sessions exist the verdict is the status; before
      // that it is only the fitted direction against the 10% noise band.
      const status = liftStatus(comparable);
      const fromStatus: TrendFinding["verdict"] | null =
        status.state === "progressing"
          ? "PROGRESSING"
          : status.state === "stalled"
            ? // a stall is "flat"; a fitted decline beyond the noise band stays one
              result.verdict === "REGRESSING"
              ? "REGRESSING"
              : "PLATEAU"
            : status.state === "dropped"
              ? "REGRESSING"
              : null;
      trends.push({
        kind: "trend",
        exerciseId,
        exerciseName: name,
        verdict: fromStatus ?? result.verdict,
        status,
        roughVerdict: fromStatus === null,
        pctChange: result.pctChange,
        perMonth: result.perMonth,
        n: result.n,
        spanDays: result.spanDays,
        confidence: result.n < TREND_CONFIDENCE_SESSIONS ? "low" : "medium",
      });
    }
  }
  return { trends, countdowns };
}
