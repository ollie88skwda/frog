import { DAY_MS } from "./constants";
import type { AddLoadTrigger, Analysis, ExSession } from "./history";
import type {
  CoachEvidenceTier,
  CoachExercise,
  CoachInput,
  CoachRuleId,
  CoachSession,
  CoachSuggestion,
  NotEvaluated,
  PlannedTarget,
} from "./types";

export type Readiness = {
  sessionId: string;
  sleepH: number | null;
  stress: number | null;
  shortSleep: boolean;
  highStress: boolean;
  /** Short sleep OR high stress (C7 day). */
  bad: boolean;
  /** The session before it (any exercise) was also a short-sleep night. */
  backToBackShort: boolean;
};

export type ExerciseCtx = {
  input: CoachInput;
  asOf: number;
  tz: number;
  exercise: CoachExercise;
  /** Every session with working sets for this exercise (oldest first). */
  hist: ExSession[];
  /** Comparable window with a usable e1RM (stall, drop, C14, C10). */
  win: ExSession[];
  /** Effort-checked window without the e1RM requirement (add-load progression
   * works from reps + RIR, so >10-rep isolation sets still progress). */
  progWin: ExSession[];
  analysis: Analysis;
  /** Latest session with sets for this exercise (may be the in-progress one). */
  latest: ExSession;
  /** Targets for the next session: routine slot, else the latest snapshot. */
  planned: PlannedTarget | null;
  readiness: Readiness | null;
  currentSession: CoachSession | null;
  /** Last session before the reference time (current session start, else asOf). */
  prev: ExSession | null;
  gapDays: number;
  rirCoverage: number | null;
  /** True when any window session lacks a target snapshot. */
  inferred: boolean;
  deloadActive: { until: number } | null;
  /** Pending add-load (overshoot / two-session), survives holds and gaps in sleep. */
  pending: AddLoadTrigger | null;
  /** Load the plan is anchored on: heaviest of the last 3 comparable sessions. */
  baseLoadKg: number;
  /** Gap since the previous session reached the restart threshold (C15). */
  restart: boolean;
  /** Week-start day for C14/C10 buckets (COACH_WEEK_START). */
  weekStart: number;
  /** Position of this exercise in the current session (last = C7 target). */
  isLastInCurrent: boolean;
};

export type RuleOutput = {
  suggestions: CoachSuggestion[];
  notEvaluated: NotEvaluated[];
};

export const empty = (): RuleOutput => ({ suggestions: [], notEvaluated: [] });

export const TIER_NOTE: Record<CoachEvidenceTier, string> = {
  T1: "Based on strong trial evidence.",
  T2: "Based on several trials.",
  T3: "Based on a small study.",
  T4: "Based on observational or small studies.",
  T5: "A practical default, not trial-tested.",
};

export function mk(
  ctx: ExerciseCtx | null,
  p: {
    ruleId: CoachRuleId;
    exerciseId: string | null;
    anchor: string | number;
    severity: CoachSuggestion["severity"];
    surfaces: CoachSuggestion["surfaces"];
    message: string;
    why: CoachSuggestion["why"];
    tier: CoachEvidenceTier;
    action: CoachSuggestion["action"];
    data?: CoachSuggestion["data"];
    confidence?: "low" | "medium";
    tierNote?: string;
  },
): CoachSuggestion {
  const sets = ctx ? ctx.win.reduce((a, s) => a + s.sets.length, 0) : 0;
  return {
    id: `${p.ruleId}:${p.exerciseId ?? "all"}:${p.anchor}`,
    ruleId: p.ruleId,
    severity: p.severity,
    surfaces: p.surfaces,
    exerciseId: p.exerciseId,
    message: p.message,
    why: p.why,
    evidenceTier: p.tier,
    tierNote: p.tierNote ?? TIER_NOTE[p.tier],
    confidence: p.confidence ?? (ctx?.inferred ? "low" : "medium"),
    action: p.action,
    data: p.data,
    inputsUsed: {
      sessions: ctx ? ctx.win.length : 0,
      sets,
      skippedNoRir: ctx
        ? ctx.hist.slice(-6).reduce((a, s) => a + s.skippedNoRir, 0)
        : 0,
    },
  };
}

/** kg for messages: trims trailing zeros ("82", "102.5"). */
export const kg = (x: number): string =>
  `${Number.parseFloat(x.toFixed(2))} kg`;
export const pct = (x: number): string => `${(x * 100).toFixed(1)}%`;

export const daysBetween = (a: number, b: number): number =>
  Math.floor((b - a) / DAY_MS);
