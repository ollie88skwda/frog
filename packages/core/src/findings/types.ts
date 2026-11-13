/** Session-shaped input for the findings engine — plain data, no I/O. */
export type FindingsSessionInput = {
  sessionId: string;
  startedAt: number; // ms epoch
  conditionValues: Record<string, unknown> | null; // {metricId: value}
  sets: {
    exerciseId: string;
    exerciseName: string;
    weightKg: number | null;
    reps: number | null;
    // Effort/set-type context (optional: absent means "not logged", matching
    // the DB's nulls). Set type and RIR/RPE feed the Brzycki e1RM baseline
    // (C2c-e1rm): warm-ups are dropped, a missing RIR is assumed 0 and
    // flagged. Recommendation stats (note 12) read the same fields.
    setType?: string | null;
    rir?: number | null;
    rirMin?: number | null;
    rirMax?: number | null;
    rpe?: number | null;
  }[];
};

import type { LiftStatus } from "../domain/stall";

export type TrendFinding = {
  kind: "trend";
  exerciseId: string;
  exerciseName: string;
  verdict: "PROGRESSING" | "PLATEAU" | "REGRESSING";
  pctChange: number;
  perMonth: number;
  n: number;
  /** Days between the first and last session the verdict was fit over. */
  spanDays: number;
  /** n < 6 → a rough estimate with a high chance of error (note 12, 2026-08-08). */
  confidence: "low" | "medium";
  /** C2c status over comparable sessions (7/6 stall, 10% drop, 14-day reset).
   * `verdict` follows it once 7 comparable sessions exist; before that the
   * verdict is only the fitted direction against the 10% noise band. Beta. */
  status: LiftStatus;
  /** True when `verdict` came from the fitted trend, not a 7-session status. */
  roughVerdict: boolean;
};

export type CountdownFinding = {
  kind: "countdown";
  exerciseId: string;
  exerciseName: string;
  sessionsLogged: number;
  sessionsNeeded: number; // remaining until a trend can be called
};

/** An exercise with logged working sets but no e1RM in any session because every
 * set was over 10 total reps (C2c-e1rm). No alternate metric, trend or stall.
 * J8 UI copy: "strength estimate needs 10 or fewer total reps". */
export type NotEstimableFinding = {
  kind: "not_estimable";
  exerciseId: string;
  exerciseName: string;
  /** Sessions with at least one working set of this exercise. */
  sessionsLogged: number;
  reason: "over_10_total_reps";
};

export type ConditionFinding = {
  kind: "condition";
  conditionId: string;
  conditionName: string;
  /** What was compared: one exercise's top working-set e1RM. `tonnage` is no
   * longer produced by the engine (J1); it stays in the union until the web
   * surfaces that branch on it are migrated (J8). */
  outcome:
    | { type: "tonnage" }
    | { type: "e1rm"; exerciseId: string; exerciseName: string };
  highMean: number;
  lowMean: number;
  /** Signed % difference of high-bucket mean vs low-bucket mean. */
  pctDiff: number;
  confidence: "low" | "medium";
  n: { high: number; low: number };
  /** Cohen's d (high vs low, pooled SD); a finding needs |d| >= 0.8. */
  effectSize: number;
  /** Permutation p-value and its Benjamini-Hochberg adjustment across every
   * test in the family (metrics x exercises). */
  p: number;
  q: number;
  /** How the buckets were made: always a median split at `cutoff`. */
  split: { kind: "median"; cutoff: number };
  /** Always carried as data so every surface shows it (C8/C19). */
  caveat: "correlation_not_causation";
};

export type Finding =
  | TrendFinding
  | CountdownFinding
  | NotEstimableFinding
  | ConditionFinding;
