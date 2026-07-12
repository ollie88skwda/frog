import { epley } from "../domain/e1rm";
import type { ConditionFinding, FindingsSessionInput } from "./types";

// Guardrails (PRD §11): minimum n per bucket, conservative effect size,
// visible confidence. Every condition finding is correlation, not causation.
export const MIN_BUCKET_N = 5;
export const MIN_EFFECT_PCT = 3;
const MEDIUM_CONFIDENCE_N = 10;

export type ConditionMetricDef = { id: string; name: string };

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

function mean(xs: number[]): number {
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

function sessionTonnage(session: FindingsSessionInput): number {
  let total = 0;
  for (const set of session.sets) {
    if (set.weightKg != null && set.reps != null)
      total += set.weightKg * set.reps;
  }
  return total;
}

function topE1rm(
  session: FindingsSessionInput,
  exerciseId: string,
): number | null {
  let best: number | null = null;
  for (const set of session.sets) {
    if (
      set.exerciseId !== exerciseId ||
      set.weightKg == null ||
      set.reps == null ||
      set.reps <= 0
    )
      continue;
    const e1 = epley(set.weightKg, set.reps);
    if (e1 == null) continue;
    if (best === null || e1 > best) best = e1;
  }
  return best;
}

function compareBuckets(
  metric: ConditionMetricDef,
  outcome: ConditionFinding["outcome"],
  high: number[],
  low: number[],
): ConditionFinding | null {
  if (high.length < MIN_BUCKET_N || low.length < MIN_BUCKET_N) return null;
  const highMean = mean(high);
  const lowMean = mean(low);
  if (lowMean === 0) return null;
  const pctDiff = ((highMean - lowMean) / lowMean) * 100;
  if (Math.abs(pctDiff) < MIN_EFFECT_PCT) return null;
  const minN = Math.min(high.length, low.length);
  return {
    kind: "condition",
    conditionId: metric.id,
    conditionName: metric.name,
    outcome,
    highMean,
    lowMean,
    pctDiff,
    confidence: minN >= MEDIUM_CONFIDENCE_N ? "medium" : "low",
    n: { high: high.length, low: low.length },
  };
}

/**
 * Median-split heuristic: for each numeric session condition, split sessions
 * into high/low halves and compare (a) session tonnage overall and (b) top-set
 * e1RM per exercise. Emits a finding only when both buckets have >= 5 sessions
 * and the difference is >= 3%.
 */
export function conditionFindings(
  sessions: FindingsSessionInput[],
  conditionMetrics: ConditionMetricDef[],
): ConditionFinding[] {
  const findings: ConditionFinding[] = [];

  for (const metric of conditionMetrics) {
    const withValue = sessions.flatMap((s) => {
      const raw = s.conditionValues?.[metric.id];
      const value = typeof raw === "number" ? raw : Number.NaN;
      return Number.isFinite(value) ? [{ session: s, value }] : [];
    });
    if (withValue.length < MIN_BUCKET_N * 2) continue;

    const med = median(withValue.map((v) => v.value));
    const highSessions = withValue
      .filter((v) => v.value > med)
      .map((v) => v.session);
    const lowSessions = withValue
      .filter((v) => v.value <= med)
      .map((v) => v.session);

    // (a) Overall session tonnage.
    const tonnage = compareBuckets(
      metric,
      { type: "tonnage" },
      highSessions.map(sessionTonnage),
      lowSessions.map(sessionTonnage),
    );
    if (tonnage) findings.push(tonnage);

    // (b) Top-set e1RM per exercise seen in these sessions.
    const exercises = new Map<string, string>();
    for (const s of withValue.map((v) => v.session)) {
      for (const set of s.sets) exercises.set(set.exerciseId, set.exerciseName);
    }
    for (const [exerciseId, exerciseName] of exercises) {
      const high = highSessions
        .map((s) => topE1rm(s, exerciseId))
        .filter((v): v is number => v !== null);
      const low = lowSessions
        .map((s) => topE1rm(s, exerciseId))
        .filter((v): v is number => v !== null);
      const found = compareBuckets(
        metric,
        { type: "e1rm", exerciseId, exerciseName },
        high,
        low,
      );
      if (found) findings.push(found);
    }
  }

  // Strongest effects first.
  return findings.sort((a, b) => Math.abs(b.pctDiff) - Math.abs(a.pctDiff));
}
