import { liftConfidence } from "../domain/confidence";
import { robustTrend } from "../domain/progression";
import {
  comparableSessions,
  liftStatus,
  STALL_MIN_SESSIONS,
} from "../domain/stall";
import { overRepCapExercises, sessionTopsByExercise } from "./series";
import type {
  CountdownFinding,
  FindingsSessionInput,
  NotEstimableFinding,
  TrendFinding,
} from "./types";

const DAY_MS = 86_400_000;
export const MIN_TREND_SESSIONS = 2;

/** Sessions of an exercise before its trend is labeled confident (medium)
 * rather than a rough estimate (low). Note 12 (2026-08-08): findings appear
 * from 2 sessions, but the 2-5 range is explicitly presented as a rough
 * estimate with a high chance of error — the old 5-session hard gate became
 * the low/medium confidence boundary instead of a withhold. */
export const TREND_CONFIDENCE_SESSIONS = 6;

/**
 * Progression trends per exercise (robust linear fit, MAD outlier rejection),
 * plus honest countdowns for exercises that don't have enough sessions yet and
 * a not-estimable marker for exercises whose working sets are all over 10 total
 * reps (no e1RM, so no trend or stall).
 */
export function progressionFindings(sessions: FindingsSessionInput[]): {
  trends: TrendFinding[];
  countdowns: CountdownFinding[];
  notEstimable: NotEstimableFinding[];
} {
  const trends: TrendFinding[] = [];
  const countdowns: CountdownFinding[] = [];
  const series = sessionTopsByExercise(sessions);
  for (const [exerciseId, { name, comparable }] of series) {
    const window = comparableSessions(comparable);
    const result = robustTrend(
      window.map((s) => ({ day: s.at / DAY_MS, e1rm: s.e1rm })),
    );
    if (result.verdict === "INSUFFICIENT") {
      countdowns.push({
        kind: "countdown",
        exerciseId,
        exerciseName: name,
        sessionsLogged: window.length,
        sessionsNeeded: MIN_TREND_SESSIONS - window.length,
      });
    } else {
      // C2c: whenever the status judged the lift (a dip from 4 comparable
      // sessions, a trend from 7) the verdict is the status and the badge scores
      // the same claim; before that it is only the fitted direction against the
      // 10% noise band. Verdict, % change and score all read the comparable
      // window (after the last break or target change).
      const status = liftStatus(comparable);
      const lc = liftConfidence(window, status.state);
      const fromStatus: TrendFinding["verdict"] | null =
        status.state === "dropped"
          ? "REGRESSING"
          : status.n < STALL_MIN_SESSIONS
            ? null
            : status.state === "progressing"
              ? "PROGRESSING"
              : status.state === "stalled"
                ? lc?.claim === "down"
                  ? "REGRESSING"
                  : "PLATEAU"
                : status.state === "holding"
                  ? "PLATEAU"
                  : null;
      trends.push({
        score: lc?.score ?? null,
        claim: lc?.claim ?? null,
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
  const notEstimable: NotEstimableFinding[] = [];
  for (const [exerciseId, { name, sessionsLogged }] of overRepCapExercises(
    sessions,
  )) {
    if (series.has(exerciseId)) continue;
    notEstimable.push({
      kind: "not_estimable",
      exerciseId,
      exerciseName: name,
      sessionsLogged,
      reason: "over_10_total_reps",
    });
  }
  return { trends, countdowns, notEstimable };
}
