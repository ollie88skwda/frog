import { e1rmSet, sessionE1rm } from "../domain/e1rm";
import { bhAdjust, cohensD, detrend, mean, permutationP } from "./stats";
import type { ConditionFinding, FindingsSessionInput } from "./types";

// Guardrails (PRD §11, engine-vs-research §3): minimum n per bucket, an effect
// floor ABOVE session noise (CV 2-4%), an effect-size floor, Benjamini-Hochberg
// across every test in the run, detrended residuals so progression is not read
// as a "sleep effect", working-set Brzycki e1RM as the outcome, and never a
// recommendation (C8/C19). Every condition finding is correlation, not causation.
export const MIN_BUCKET_N = 6;
export const MIN_EFFECT_PCT = 5;
export const MIN_COHEN_D = 0.8;
export const MAX_Q = 0.1; // BH-adjusted p ceiling
export const MAX_FINDINGS_PER_CONDITION = 3;
const MEDIUM_CONFIDENCE_N = 10;

export type ConditionMetricDef = {
  id: string;
  name: string;
  /** Clinical cutoff (C7/C9d): sleep < 6.0 h, stress >= 8. When set, the
   * buckets are "flagged side vs the rest" instead of a median split. */
  threshold?: { cutoff: number; dir: "below" | "atLeast" };
};

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** Warm-ups never count toward the outcome (R17b). */
function exerciseE1rm(
  session: FindingsSessionInput,
  exerciseId: string,
): number | null {
  const sets = session.sets
    .filter((x) => x.exerciseId === exerciseId && x.setType !== "warmup")
    .map((x) => e1rmSet(x.weightKg, x.reps, x));
  return sessionE1rm(sets);
}

type Point = { session: FindingsSessionInput; value: number };

type Candidate = {
  metric: ConditionMetricDef;
  outcome: ConditionFinding["outcome"];
  high: number[];
  low: number[];
  highMean: number;
  lowMean: number;
  pctDiff: number;
  d: number;
  p: number;
  split: ConditionFinding["split"];
};

function candidate(
  metric: ConditionMetricDef,
  outcome: ConditionFinding["outcome"],
  highPts: { y: number; resid: number }[],
  lowPts: { y: number; resid: number }[],
  split: ConditionFinding["split"],
): Candidate | null {
  if (highPts.length < MIN_BUCKET_N || lowPts.length < MIN_BUCKET_N)
    return null;
  const highMean = mean(highPts.map((x) => x.y));
  const lowMean = mean(lowPts.map((x) => x.y));
  if (lowMean === 0) return null;
  // Effect size and p on detrended residuals; the reported % stays on raw means.
  const hr = highPts.map((x) => x.resid);
  const lr = lowPts.map((x) => x.resid);
  const d = cohensD(hr, lr);
  if (d == null) return null;
  return {
    metric,
    outcome,
    high: highPts.map((x) => x.y),
    low: lowPts.map((x) => x.y),
    highMean,
    lowMean,
    pctDiff: ((highMean - lowMean) / lowMean) * 100,
    d,
    p: permutationP(hr, lr),
    split,
  };
}

/**
 * Condition findings: for each numeric session condition, split sessions into
 * two buckets (median split, or a clinical cutoff when the metric defines one)
 * and compare the top working-set Brzycki e1RM of each exercise. Tonnage is no
 * longer an outcome (it follows session length and exercise choice, not
 * performance). A finding needs >= 6 sessions per bucket, |diff| >= 5%,
 * |Cohen's d| >= 0.8 on detrended values, and a Benjamini-Hochberg q <= 0.1
 * across the whole family; at most 3 per condition.
 */
export function conditionFindings(
  sessions: FindingsSessionInput[],
  conditionMetrics: ConditionMetricDef[],
): ConditionFinding[] {
  const candidates: Candidate[] = [];

  for (const metric of conditionMetrics) {
    const withValue: Point[] = sessions.flatMap((s) => {
      const raw = s.conditionValues?.[metric.id];
      const value = typeof raw === "number" ? raw : Number.NaN;
      return Number.isFinite(value) ? [{ session: s, value }] : [];
    });
    if (withValue.length < MIN_BUCKET_N * 2) continue;

    let highSet: Set<string>;
    let split: ConditionFinding["split"];
    if (metric.threshold) {
      const { cutoff, dir } = metric.threshold;
      highSet = new Set(
        withValue
          .filter((v) =>
            dir === "below" ? v.value < cutoff : v.value >= cutoff,
          )
          .map((v) => v.session.sessionId),
      );
      split = { kind: "threshold", cutoff };
    } else {
      const med = median(withValue.map((v) => v.value));
      highSet = new Set(
        withValue.filter((v) => v.value > med).map((v) => v.session.sessionId),
      );
      split = { kind: "median", cutoff: med };
    }

    const exercises = new Map<string, string>();
    for (const v of withValue)
      for (const set of v.session.sets)
        if (set.setType !== "warmup")
          exercises.set(set.exerciseId, set.exerciseName);

    const found: Candidate[] = [];
    for (const [exerciseId, exerciseName] of exercises) {
      const pts = withValue
        .map((v) => ({
          id: v.session.sessionId,
          day: v.session.startedAt / 86_400_000,
          y: exerciseE1rm(v.session, exerciseId),
        }))
        .filter(
          (x): x is { id: string; day: number; y: number } => x.y !== null,
        )
        .sort((a, b) => a.day - b.day);
      if (pts.length < MIN_BUCKET_N * 2) continue;
      const resid = detrend(pts.map((x) => ({ day: x.day, value: x.y })));
      const rows = pts.map((x, i) => ({
        id: x.id,
        y: x.y,
        resid: resid[i].resid,
      }));
      const c = candidate(
        metric,
        { type: "e1rm", exerciseId, exerciseName },
        rows.filter((r) => highSet.has(r.id)),
        rows.filter((r) => !highSet.has(r.id)),
        split,
      );
      if (c) found.push(c);
    }
    candidates.push(...found);
  }

  // Family-wide multiple-comparison control (all metrics x exercises).
  const q = bhAdjust(candidates.map((c) => c.p));
  const kept = candidates
    .map((c, i) => ({ c, q: q[i] }))
    .filter(
      ({ c, q: qi }) =>
        Math.abs(c.pctDiff) >= MIN_EFFECT_PCT &&
        Math.abs(c.d) >= MIN_COHEN_D &&
        qi <= MAX_Q,
    );

  const perCondition = new Map<string, number>();
  const findings: ConditionFinding[] = [];
  for (const { c, q: qi } of kept.sort(
    (a, b) => Math.abs(b.c.pctDiff) - Math.abs(a.c.pctDiff),
  )) {
    const used = perCondition.get(c.metric.id) ?? 0;
    if (used >= MAX_FINDINGS_PER_CONDITION) continue;
    perCondition.set(c.metric.id, used + 1);
    const minN = Math.min(c.high.length, c.low.length);
    findings.push({
      kind: "condition",
      conditionId: c.metric.id,
      conditionName: c.metric.name,
      outcome: c.outcome,
      highMean: c.highMean,
      lowMean: c.lowMean,
      pctDiff: c.pctDiff,
      confidence: minN >= MEDIUM_CONFIDENCE_N ? "medium" : "low",
      n: { high: c.high.length, low: c.low.length },
      effectSize: c.d,
      p: c.p,
      q: qi,
      split: c.split,
      caveat: "correlation_not_causation",
    });
  }
  return findings;
}

export type ConditionCountdown = {
  conditionId: string;
  conditionName: string;
  sessionsLogged: number;
  sessionsNeeded: number;
};

/** For a metric the user has started logging but that doesn't yet have enough
 * valued sessions (MIN_BUCKET_N * 2) to attempt a correlation — mirrors the
 * trend countdown so the correlation feature is discoverable, not silent. */
export function conditionCountdowns(
  sessions: FindingsSessionInput[],
  conditionMetrics: ConditionMetricDef[],
): ConditionCountdown[] {
  const target = MIN_BUCKET_N * 2;
  const out: ConditionCountdown[] = [];
  for (const metric of conditionMetrics) {
    const logged = sessions.reduce((n, s) => {
      const raw = s.conditionValues?.[metric.id];
      return typeof raw === "number" && Number.isFinite(raw) ? n + 1 : n;
    }, 0);
    if (logged > 0 && logged < target)
      out.push({
        conditionId: metric.id,
        conditionName: metric.name,
        sessionsLogged: logged,
        sessionsNeeded: target - logged,
      });
  }
  return out.sort((a, b) => a.sessionsNeeded - b.sessionsNeeded);
}
