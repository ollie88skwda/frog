// Confidence percentages (boss request 2026-11-14): every verdict that used to
// wait behind a minimum-session gate shows a best guess from the first usable
// data point plus a computed confidence that rises as the user logs more.
//
// The number is always the probability that the CLAIM being shown is right,
// under a small, documented model. Never decorative, never 100% (capped at 99),
// never below 1%. Formulas are written out in docs/DECISIONS.md (2026-11-14)
// and surfaced in each Why sheet via `ConfidenceScore.formula`.
//
// Pure and framework-free, unit-tested in confidence.test.ts.

import { isOutlier, robustTrend } from "./progression";
import type { ComparableSession } from "./stall";
import { NOISE_BAND } from "./stall";

const DAY_MS = 86_400_000;

/** Prior per-session noise of a lift's top-set e1RM, as a fraction (session CV
 * is 2-4% in the research notes; we take the top of the range). */
export const PRIOR_SESSION_SD = 0.04;
/** Pseudo-degrees of freedom the prior is worth (shrinks tiny samples toward it
 * instead of trusting 2-3 lucky points). */
export const PRIOR_DF = 3;
/** A line through 2-3 points can never be called firmer than this. */
export const FEW_POINTS_CAP = 0.75;
export const CONFIDENCE_MAX = 0.99;
export const CONFIDENCE_MIN = 0.01;
/** Confidence we point the "log N more" hint at. */
export const RAISE_TARGET = 0.8;

export type ConfidenceKind = "trend" | "drop" | "condition" | "volume";
export type ConfidenceLevel = "low" | "medium" | "high";

export type ConfidenceScore = {
  kind: ConfidenceKind;
  /** Whole percent, 1..99. */
  pct: number;
  level: ConfidenceLevel;
  /** Samples behind it: sessions, bucket sessions (smaller side) or weeks. */
  n: number;
  /** The formula, in plain words (Why sheet "Rule"). */
  formula: string;
  /** What was measured, with the user's numbers (Why sheet "What I saw"). */
  basis: string;
  /** What would raise it (Why sheet "What would change this"). */
  raise: string;
};

/** low < 50% (amber, "tentative") · medium 50-79% · high 80%+. */
export function confidenceLevel(pct: number): ConfidenceLevel {
  return pct < 50 ? "low" : pct < 80 ? "medium" : "high";
}

export const CONFIDENCE_WORD: Record<ConfidenceLevel, string> = {
  low: "tentative",
  medium: "likely",
  high: "firm",
};

// ── numeric helpers ─────────────────────────────────────────────────────────

/** Standard normal CDF (Abramowitz-Stegun 7.1.26, |error| < 1.5e-7). */
export function normalCdf(z: number): number {
  const x = Math.abs(z) / Math.SQRT2;
  const t = 1 / (1 + 0.3275911 * x);
  const poly =
    t *
    (0.254829592 +
      t *
        (-0.284496736 +
          t * (1.421413741 + t * (-1.453152027 + t * 1.061405429))));
  const erf = 1 - poly * Math.exp(-x * x);
  return z >= 0 ? 0.5 * (1 + erf) : 0.5 * (1 - erf);
}

/** Student-t CDF with `nu` degrees of freedom (normal approximation with the
 * usual heavy-tail correction; exact to ~1% for nu >= 3). Small samples get
 * wider tails, so they cannot look as sure as a big one. */
export function tCdf(t: number, nu: number): number {
  const z = (t * (1 - 1 / (4 * nu))) / Math.sqrt(1 + (t * t) / (2 * nu));
  return normalCdf(z);
}

function clampPct(p: number): number {
  return Math.round(
    Math.min(CONFIDENCE_MAX, Math.max(CONFIDENCE_MIN, p)) * 100,
  );
}

function mean(xs: number[]): number {
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

/** Noise SD blended with the prior: (K s0^2 + df s^2) / (K + df). */
function blendedSd(sampleSd: number, df: number): { sd: number; nu: number } {
  const v =
    (PRIOR_DF * PRIOR_SESSION_SD ** 2 + df * sampleSd ** 2) / (PRIOR_DF + df);
  return { sd: Math.sqrt(v), nu: PRIOR_DF + df };
}

const pct1 = (x: number) => `${(x * 100).toFixed(1)}%`;
const signed1 = (x: number) =>
  `${x >= 0 ? "+" : "-"}${(Math.abs(x) * 100).toFixed(1)}%`;

// ── trend (e1RM direction, stall / progressing / holding) ──────────────────

export type ClaimDirection = "up" | "down" | "flat";

export const TREND_FORMULA =
  "Fit a straight line through your session top-set e1RMs. The change over your logged span has a standard error of noise × span ÷ √(spread of session dates), where noise blends your own scatter around the line with a 4% prior (worth 3 sessions). Confidence = the chance the true change is up (or down), or inside the ±10% normal-swing band for a flat call, using a Student-t curve. Two or three points are capped at 75%. Never 100%.";

type Fit = {
  n: number;
  /** Fitted relative change over the span (fraction of the mean). */
  change: number;
  /** Relative slope per day. */
  slopePerDay: number;
  spanDays: number;
  sd: number;
  nu: number;
  sxx: number;
};

function fitTrend(points: { day: number; e1rm: number }[]): Fit | null {
  if (points.length < 2) return null;
  const all = points.map((p) => p.e1rm);
  const kept = points.filter((p) => !isOutlier(all, p.e1rm));
  const pts = kept.length >= 5 ? kept : points;
  const n = pts.length;
  const my = mean(pts.map((p) => p.e1rm));
  if (!(my > 0)) return null;
  const xs = pts.map((p) => p.day);
  const ys = pts.map((p) => p.e1rm / my);
  const mx = mean(xs);
  let sxx = 0;
  let sxy = 0;
  for (let i = 0; i < n; i++) {
    sxx += (xs[i] - mx) ** 2;
    sxy += (xs[i] - mx) * (ys[i] - 1);
  }
  if (!(sxx > 0)) return null;
  const slope = sxy / sxx;
  let sse = 0;
  for (let i = 0; i < n; i++) sse += (ys[i] - (1 + slope * (xs[i] - mx))) ** 2;
  const df = Math.max(0, n - 2);
  const sampleSd = df > 0 ? Math.sqrt(sse / df) : PRIOR_SESSION_SD;
  const { sd, nu } = blendedSd(sampleSd, df);
  const span = xs[xs.length - 1] - xs[0];
  return {
    n,
    change: slope * span,
    slopePerDay: slope,
    spanDays: span,
    sd,
    nu,
    sxx,
  };
}

function claimProb(
  claim: ClaimDirection,
  change: number,
  se: number,
  nu: number,
  band: number,
): number {
  if (claim === "up") return tCdf(change / se, nu);
  if (claim === "down") return tCdf(-change / se, nu);
  return tCdf((band - change) / se, nu) - tCdf((-band - change) / se, nu);
}

/** Sessions still needed to reach RAISE_TARGET if the current slope and noise
 * hold and new sessions keep the same cadence (z grows with √(spread)). */
function sessionsToTarget(fit: Fit, claim: ClaimDirection): number | null {
  const h = fit.spanDays / (fit.n - 1);
  for (let m = 1; m <= 60; m++) {
    const n2 = fit.n + m;
    const sxx = (h * h * n2 * (n2 * n2 - 1)) / 12;
    const span = (n2 - 1) * h;
    const se = (fit.sd * span) / Math.sqrt(sxx);
    const nu = PRIOR_DF + n2 - 2;
    if (
      claimProb(claim, fit.slopePerDay * span, se, nu, NOISE_BAND) >=
      RAISE_TARGET
    )
      return m;
  }
  return null;
}

const CLAIM_WORD: Record<ClaimDirection, string> = {
  up: "going up",
  down: "going down",
  flat: "holding steady (inside the 10% normal swing)",
};

/**
 * Confidence that a lift's e1RM really is going up / down / holding. Null with
 * fewer than 2 distinct-day sessions (a direction needs two points).
 */
export function trendConfidence(
  points: { day: number; e1rm: number }[],
  claim: ClaimDirection,
): ConfidenceScore | null {
  const fit = fitTrend(points);
  if (!fit) return null;
  const se = (fit.sd * fit.spanDays) / Math.sqrt(fit.sxx);
  let p = claimProb(claim, fit.change, se, fit.nu, NOISE_BAND);
  if (fit.n <= 3) p = Math.min(p, FEW_POINTS_CAP);
  const pct = clampPct(p);
  const m = sessionsToTarget(fit, claim);
  const raise =
    pct >= RAISE_TARGET * 100
      ? "Already firm. Keep logging so it stays current."
      : m == null
        ? "The change is small next to your normal session-to-session swing, so more sessions help slowly. Keep the same lift, RIR logged, steady conditions."
        : `Log about ${m} more session${m === 1 ? "" : "s"} of this lift to reach ${RAISE_TARGET * 100}% if the pattern holds. Log RIR and keep the same rep range so sessions compare.`;
  return {
    kind: "trend",
    pct,
    level: confidenceLevel(pct),
    n: fit.n,
    formula: TREND_FORMULA,
    basis: `${fit.n} sessions, fitted change ${signed1(fit.change)} ± ${pct1(se)}; claim: ${CLAIM_WORD[claim]}.`,
    raise,
  };
}

/** Same, from ComparableSession-shaped points (ms timestamps). */
export function sessionsTrendConfidence(
  sessions: ComparableSession[],
  claim: ClaimDirection,
): ConfidenceScore | null {
  return trendConfidence(
    sessions.map((s) => ({ day: s.at / DAY_MS, e1rm: s.e1rm })),
    claim,
  );
}

// ── single-session drop ─────────────────────────────────────────────────────

export const DROP_FORMULA =
  "Compare your latest top-set e1RM with the median of up to 6 sessions before it. Noise is the scatter of those sessions blended with the 4% prior, scaled by √(1 + 1/sessions). Confidence = the chance the dip is real rather than a bad day, using a Student-t curve. Capped at 75% for a single session.";

/** Confidence that the latest session really is below the usual level. Needs
 * 3 prior sessions (a median of fewer is not a baseline). */
export function dropConfidence(
  window: ComparableSession[],
): ConfidenceScore | null {
  const idx = window.length - 1;
  if (idx < 3) return null;
  const prior = window.slice(Math.max(0, idx - 6), idx).map((s) => s.e1rm);
  const sorted = [...prior].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const base =
    sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  if (!(base > 0)) return null;
  const rel = prior.map((x) => x / base);
  const m = rel.length;
  const mu = mean(rel);
  const sampleSd = Math.sqrt(
    rel.reduce((a, x) => a + (x - mu) ** 2, 0) / (m - 1),
  );
  const { sd, nu } = blendedSd(sampleSd, m - 1);
  const drop = (base - window[idx].e1rm) / base;
  const se = sd * Math.sqrt(1 + 1 / m);
  const p = Math.min(tCdf(drop / se, nu), FEW_POINTS_CAP);
  const pct = clampPct(p);
  return {
    kind: "drop",
    pct,
    level: confidenceLevel(pct),
    n: m + 1,
    formula: DROP_FORMULA,
    basis: `Latest session ${signed1(-drop)} vs the median of your previous ${m}; normal scatter ± ${pct1(se)}.`,
    raise:
      "One more session at a similar level confirms it. A rebound next time means it was a bad day.",
  };
}

// ── condition finding (sleep, carbs, stress … vs e1RM) ──────────────────────

export const CONDITION_FORMULA =
  "Split sessions at the median of the condition and compare detrended top-set e1RM between the high and low halves. Confidence = the smallest of (a) 1 minus the Benjamini-Hochberg adjusted permutation p-value across every condition × lift tested, (b) the chance the true gap has the sign you see, from Cohen's d and its standard error, and (c) a small-sample cap of 45% + 5% per session on the smaller side (3 sessions: 60%, 6: 75%, 10: 95%). Correlation, not causation. Never 100%.";

/** Standard error of Cohen's d for two groups (Hedges-Olkin). */
export function cohensDSe(n1: number, n2: number, d: number): number {
  return Math.sqrt((n1 + n2) / (n1 * n2) + (d * d) / (2 * (n1 + n2)));
}

export function conditionConfidence(opts: {
  nHigh: number;
  nLow: number;
  effectSize: number;
  q: number;
  conditionName: string;
}): ConfidenceScore {
  const { nHigh, nLow, effectSize: d, q, conditionName } = opts;
  const se = cohensDSe(nHigh, nLow, d);
  const nu = nHigh + nLow - 2;
  const sign = tCdf(Math.abs(d) / se, nu);
  const small0 = Math.min(nHigh, nLow);
  const p = Math.min(sign, 1 - Math.min(1, q), 0.45 + 0.05 * small0);
  const pct = clampPct(p);
  const small = Math.min(nHigh, nLow);
  let more: number | null = null;
  for (let k = small + 1; k <= small + 60; k++) {
    if (tCdf(Math.abs(d) / cohensDSe(k, k, d), 2 * k - 2) >= RAISE_TARGET) {
      more = k - small;
      break;
    }
  }
  return {
    kind: "condition",
    pct,
    level: confidenceLevel(pct),
    n: small,
    formula: CONDITION_FORMULA,
    basis: `${nHigh} high / ${nLow} low ${conditionName} sessions, effect size d = ${d.toFixed(2)} (± ${se.toFixed(2)}), adjusted p = ${q.toFixed(2)}.`,
    raise:
      pct >= RAISE_TARGET * 100
        ? "Already firm. It is still a correlation, not proof of cause."
        : more == null
          ? "The gap is small next to your normal scatter. Keep logging this condition on every session."
          : `Log about ${more} more session${more === 1 ? "" : "s"} per side with ${conditionName} recorded (about ${more * 2} in total) if the gap holds.`,
  };
}

// ── weekly volume verdict ───────────────────────────────────────────────────

export type VolumeClaim = "below" | "in-band" | "high";

export const VOLUME_FORMULA =
  "Take your weekly hard-set totals. The usual weekly level has a standard error of week-to-week scatter ÷ √weeks, where scatter blends yours with a 25% prior (worth 2 weeks). Confidence = the chance your true usual week sits in the band the meter shows (below 10, 10-20, above 20), using a Student-t curve. One week is capped at 60%.";

const VOLUME_PRIOR_CV = 0.25;
const VOLUME_PRIOR_DF = 2;

export function volumeConfidence(
  weeklySets: number[],
  band: readonly [number, number] = [10, 20],
): { claim: VolumeClaim; score: ConfidenceScore } | null {
  const w = weeklySets.length;
  if (w < 1) return null;
  const m = mean(weeklySets);
  if (!(m > 0)) return null;
  const claim: VolumeClaim =
    m > band[1] ? "high" : m >= band[0] ? "in-band" : "below";
  const df = w - 1;
  const sampleSd =
    df > 0
      ? Math.sqrt(weeklySets.reduce((a, x) => a + (x - m) ** 2, 0) / df)
      : 0;
  const priorSd = VOLUME_PRIOR_CV * m;
  const sd = Math.sqrt(
    (VOLUME_PRIOR_DF * priorSd ** 2 + df * sampleSd ** 2) /
      (VOLUME_PRIOR_DF + df),
  );
  const nu = VOLUME_PRIOR_DF + df;
  const se = sd / Math.sqrt(w);
  const probAt = (se2: number, nu2: number) => {
    if (claim === "high") return 1 - tCdf((band[1] - m) / se2, nu2);
    if (claim === "below") return tCdf((band[0] - m) / se2, nu2);
    return tCdf((band[1] - m) / se2, nu2) - tCdf((band[0] - m) / se2, nu2);
  };
  let p = probAt(se, nu);
  if (w === 1) p = Math.min(p, 0.6);
  const pct = clampPct(p);
  let more: number | null = null;
  for (let k = w + 1; k <= w + 26; k++) {
    if (probAt(sd / Math.sqrt(k), VOLUME_PRIOR_DF + k - 1) >= RAISE_TARGET) {
      more = k - w;
      break;
    }
  }
  const word: Record<VolumeClaim, string> = {
    below: "below the 10-set band",
    "in-band": "inside the 10-20 set band",
    high: "above the 20-set band",
  };
  return {
    claim,
    score: {
      kind: "volume",
      pct,
      level: confidenceLevel(pct),
      n: w,
      formula: VOLUME_FORMULA,
      basis: `${w} week${w === 1 ? "" : "s"} logged, averaging ${m.toFixed(1)} hard sets a week (± ${se.toFixed(1)}): ${word[claim]}.`,
      raise:
        pct >= RAISE_TARGET * 100
          ? "Already firm. Keep logging to keep it current."
          : more == null
            ? "Your weeks vary a lot or sit on a band edge. A steadier routine makes this clearer."
            : `Train about ${more} more week${more === 1 ? "" : "s"} like this to reach ${RAISE_TARGET * 100}%.`,
    },
  };
}

/** Mean confidence of several scores (for roll-up tiles). Null when empty. */
export function averageConfidence(scores: ConfidenceScore[]): number | null {
  if (scores.length === 0) return null;
  return Math.round(mean(scores.map((s) => s.pct)));
}

// ── one lift's verdict (Progress, Lift page, Today, share cards) ────────────

/** The claim a lift's status makes whenever the status judged one (a dip from
 * 4 sessions, a trend from 7); a stall (no new best) claims "down" only when
 * the fitted change is at or beyond -10% (the noise band, as robustTrend
 * judges REGRESSING), else "flat". Otherwise the best guess (shown
 * tentatively) is the fitted direction against the same 10% band: "up" or
 * "down" only beyond it, "flat" inside it. */
export function liftClaim(
  points: ComparableSession[],
  state:
    | "insufficient"
    | "progressing"
    | "holding"
    | "stalled"
    | "dropped"
    | "restart",
): ClaimDirection | "drop" | null {
  if (state === "progressing") return "up";
  if (state === "dropped") return "drop";
  if (state === "holding") return "flat";
  const { verdict } = robustTrend(
    points.map((s) => ({ day: s.at / DAY_MS, e1rm: s.e1rm })),
  );
  if (verdict === "INSUFFICIENT") return null;
  if (verdict === "REGRESSING") return "down";
  if (verdict === "PROGRESSING" && state !== "stalled") return "up";
  return "flat";
}

/** Confidence for a lift's verdict from its comparable window. Null with fewer
 * than 2 sessions (nothing to compare yet). */
export function liftConfidence(
  window: ComparableSession[],
  state:
    | "insufficient"
    | "progressing"
    | "holding"
    | "stalled"
    | "dropped"
    | "restart",
): { claim: ClaimDirection | "drop"; score: ConfidenceScore } | null {
  const claim = liftClaim(window, state);
  if (!claim) return null;
  const score =
    claim === "drop"
      ? dropConfidence(window)
      : sessionsTrendConfidence(window, claim);
  return score ? { claim, score } : null;
}
