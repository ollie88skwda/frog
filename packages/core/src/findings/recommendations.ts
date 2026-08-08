import { robustTrend } from "../domain/progression";
import { rirStatsByExercise, sessionVolumeByExercise } from "./series";
import type { FindingsSessionInput, TrendFinding } from "./types";

// Recommendation guardrails (captain, 2026-08-08 — minimal first ship).
// Transparent threshold rules in the repo's honest-stats style: every
// recommendation renders the statistic it was derived from, and the
// "correlation, not causation" caveat travels with it in the UI. No AI.
//
// Scope: keep-going on PROGRESSING; the volume lever + RIR-gap nudge on
// PLATEAU. The RIR intensity lever and the regressing/lower-intensity lever
// are deferred to a later batch (captain decision 2).

/** |volume trend| below this → volume is "flat" (mirrors the ±5% verdict band). */
export const VOLUME_FLAT_PCT = 5;
/** Coverage floor: share of work-set sessions with RIR logged. */
export const RIR_COVERAGE_MIN = 0.5;

export type RecommendationStat = {
  /** Sessions behind this recommendation (trend n / volume-fit n / work sessions). */
  n: number;
  /** Volume trend % over the window (change-volume only). */
  volumePct?: number;
  /** Median RIR over the window; absent when not enough RIR data. */
  medianRir?: number | null;
  /** Share (0..1) of work-set sessions with RIR logged. */
  rirCoverage?: number;
};

export type Recommendation =
  | { kind: "keep-going"; stats: RecommendationStat }
  | { kind: "change-volume"; stats: RecommendationStat }
  | { kind: "rir-gap"; stats: RecommendationStat };

export function recommendationsForExercise(
  exerciseId: string,
  sessions: FindingsSessionInput[],
  trend: TrendFinding,
): Recommendation[] {
  if (trend.verdict === "PROGRESSING") {
    return [
      {
        kind: "keep-going",
        stats: rirStatsFor(exerciseId, sessions),
      },
    ];
  }
  if (trend.verdict !== "PLATEAU") return []; // REGRESSING lever deferred

  const out: Recommendation[] = [];

  // Volume lever: only when the series carries real tonnage (duration-type
  // exercises sum to zero and "add a set or reps" would be nonsense).
  const volume = sessionVolumeByExercise(sessions).get(exerciseId);
  if (volume?.points.some((p) => p.kg > 0)) {
    // The volume series reuses the e1RM trend fit by mapping kg onto its
    // value slot — robustTrend is a generic {day, value} linear fit; only
    // its verdict thresholds are e1RM-tuned, and we read only pctChange.
    const fit = robustTrend(
      volume.points.map((p) => ({ day: p.day, e1rm: p.kg })),
    );
    if (fit.verdict !== "INSUFFICIENT" && fit.pctChange < VOLUME_FLAT_PCT) {
      out.push({
        kind: "change-volume",
        stats: {
          ...rirStatsFor(exerciseId, sessions),
          n: fit.n,
          volumePct: fit.pctChange,
        },
      });
    }
  }

  // RIR-gap nudge: intensity advice needs RIR on most work-set sessions.
  const rir = rirStatsByExercise(sessions, exerciseId);
  if (rir.total > 0 && rir.coverage < RIR_COVERAGE_MIN) {
    out.push({
      kind: "rir-gap",
      stats: { n: rir.total, rirCoverage: rir.coverage },
    });
  }
  return out;
}

function rirStatsFor(
  exerciseId: string,
  sessions: FindingsSessionInput[],
): RecommendationStat {
  const rir = rirStatsByExercise(sessions, exerciseId);
  return {
    n: rir.total,
    medianRir: rir.medianRir,
    rirCoverage: rir.coverage,
  };
}
