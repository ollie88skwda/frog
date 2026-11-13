import type { MuscleTarget } from "../domain/anatomy";

export type CoachEvidenceTier = "T1" | "T2" | "T3" | "T4" | "T5";
/** `stop` is reserved for C20 (dormant). */
export type CoachSeverity = "info" | "suggest" | "caution" | "stop";
export type CoachSurface =
  | "prescription"
  | "in_set"
  | "post_session"
  | "weekly";

export type CoachRuleId =
  | "C1"
  | "C2c-progress"
  | "C2c-overshoot"
  | "C2c-stall"
  | "C2"
  | "C3"
  | "C4"
  | "C5"
  | "C7"
  | "C9b"
  | "C9d"
  | "C10"
  | "C11"
  | "C12"
  | "C14"
  | "C15"
  | "C19";

export type CoachAction =
  | {
      kind: "set_load";
      exerciseId: string;
      loadKg: number;
      reps?: [number, number];
      rir?: [number, number];
      sets?: number;
    }
  | { kind: "hold_load"; exerciseId: string; loadKg: number }
  | { kind: "change_rep_range"; exerciseId: string; reps: [number, number] }
  | { kind: "add_set"; exerciseId: string }
  | { kind: "remove_set"; exerciseId: string; count: number }
  | {
      kind: "deload";
      exerciseIds: string[];
      setsPerExercise: Record<string, number>;
      loadKg: Record<string, number>;
      rir: [number, number];
      weeks: 1;
    }
  | {
      kind: "set_target_rir";
      exerciseId: string;
      rir: [number, number];
      forDays: 7;
    }
  | {
      kind: "restart_load";
      exerciseId: string;
      loadKg: number;
      rangeKg: [number, number];
    }
  | { kind: "text_only" };

export type WhyLine = {
  text: string;
  stat?: { label: string; value: string };
  /** e.g. "C2c · PMID 7500624" */
  cite?: string;
};

export type CoachSuggestion = {
  /** Deterministic: `${ruleId}:${exerciseId ?? "all"}:${anchor}` so dismiss and
   * accept persist and dedupe across recomputes. */
  id: string;
  ruleId: CoachRuleId;
  severity: CoachSeverity;
  surfaces: CoachSurface[];
  exerciseId: string | null;
  /** ONE plain sentence. Voice-neutral; the UI applies the language register. */
  message: string;
  /** Shown behind "Why?": your numbers, the rule, the source. Never empty. */
  why: WhyLine[];
  evidenceTier: CoachEvidenceTier;
  tierNote: string;
  confidence: "low" | "medium";
  action: CoachAction;
  /** Rule-specific numbers (baseline, percentages …) for the UI and tests. */
  data?: Record<string, number | string | boolean | null>;
  /** Set when resolve demotes the suggestion (powers a "why not X?" line). */
  supersededBy?: string;
  suppressedBy?: "superseded" | "dismissed" | "rule_off" | "guard";
  inputsUsed: { sessions: number; sets: number; skippedNoRir: number };
};

export type PlannedTarget = {
  repsMin: number;
  repsMax: number;
  rirMin: number;
  rirMax: number;
  /** Working sets, excluding warm-ups. */
  sets: number;
  /** Planned top-set load (coach prescription at session start). */
  loadKg?: number | null;
  /** Per working-set planned RIR (index = working-set order), e.g. an
   * isolation last set at 0-1. Falls back to rirMin..rirMax. */
  perSetRir?: { min: number; max: number }[];
  isDeload?: boolean;
  firstSetMax?: boolean;
  prescriptionRuleId?: string | null;
};

export type CoachSet = {
  setNo: number;
  side: "left" | "right" | null;
  /** 'normal' | 'warmup' | 'failure' | 'drop'; only warm-ups are excluded. */
  setType: string;
  weightKg: number | null;
  reps: number | null;
  rirMin: number | null;
  rirMax: number | null;
  completed: boolean;
};

export type CoachSession = {
  id: string;
  startedAt: number;
  endedAt: number | null;
  sleepH: number | null;
  stress: number | null;
  carbsG: number | null;
  caffeineMg: number | null;
  exercises: {
    exerciseId: string;
    /** Target snapshot written at session start (§9.1). Absent on old sessions. */
    planned?: PlannedTarget | null;
    sets: CoachSet[];
  }[];
};

export type CoachExercise = {
  id: string;
  name: string;
  equipment: string | null;
  isCompound: boolean;
  muscleTargets: MuscleTarget[];
  /** Smallest available load step. Absent → machine/cable give text-only steps. */
  stepKg?: number | null;
};

/** `dayKey` groups slots that share one session (routine day) for the R7b
 * per-session direct-set cap; absent → each slot counts as its own session. */
export type CoachPlanSlot = {
  exerciseId: string;
  planned: PlannedTarget;
  dayKey?: string;
};

export type DismissRecord = {
  suggestionId?: string;
  ruleId: CoachRuleId;
  exerciseId: string | null;
  scope: "once" | "exercise_4w" | "rule";
  at: number;
};

export type CoachFeature =
  | "caffeineTime"
  | "bedtime"
  | "pain"
  | "goal"
  | "cardioTimes"
  | "runningMode"
  | "repSpeed"
  | "proteinG"
  | "setRole"
  | "stepKg"
  | "targetSnapshot";
export type FeatureMap = Partial<Record<CoachFeature, boolean>>;

export type CoachInput = {
  /** Evaluation clock in ms. No rule reads Date.now(). */
  asOf: number;
  /** Completed sessions plus the in-progress one. */
  sessions: CoachSession[];
  /** The in-progress (or just-started) session: its readiness drives holds. */
  currentSessionId?: string;
  exercises: ReadonlyMap<string, CoachExercise>;
  /** Current routine targets, used when a session carries no snapshot. */
  plan?: CoachPlanSlot[];
  prefs?: {
    dismissed?: DismissRecord[];
    rulesOff?: CoachRuleId[];
    features?: FeatureMap;
    tzOffsetMin?: number;
    /** user_prefs.coachEnabled; false returns no suggestions. */
    enabled?: boolean;
  };
  bodyweight?: { measuredOn: string; kg: number }[];
};

export type NotEvaluatedReason =
  | "too_few_sessions"
  | "no_rir"
  | "no_snapshot"
  | "dormant"
  | "missing_field";

export type NotEvaluated = {
  ruleId: string;
  exerciseId?: string;
  reason: NotEvaluatedReason;
  detail: string;
};

export type ExercisePrescription = {
  loadKg: number | null;
  reps: [number, number] | null;
  rir: [number, number] | null;
  sets: number | null;
  ruleId: CoachRuleId | null;
  delta: "up" | "hold" | "range" | "deload" | "restart" | "same";
};

export type ExerciseCoachState = {
  comparableSessions: number;
  sessionE1rms: {
    sessionId: string;
    e1rm: number;
    flagged: boolean;
    carbsG: number | null;
  }[];
  baselineMedian: number | null;
  /** null = not evaluable (fewer than 7 comparable sessions, or no snapshot). */
  stalled: boolean | null;
  /** True when a new best sits in the newest session and awaits a match. */
  stallPending: boolean;
  dropPct: number | null;
  pendingAddLoad: { loadKg: number | null; fromSessionId: string } | null;
  holdActive: boolean;
  deloadActive: { until: number } | null;
  rirSkipCount: number;
  rirCoverage: number | null;
  prescription: ExercisePrescription | null;
};

export type CoachResult = {
  /** Resolved, sorted by priority. */
  suggestions: CoachSuggestion[];
  /** Superseded or blocked (debug and "why not X?"). */
  suppressed: CoachSuggestion[];
  /** At most one: deload > restart > sleep hold. */
  banner: CoachSuggestion | null;
  perExercise: Map<string, ExerciseCoachState>;
  notEvaluated: NotEvaluated[];
  /** 7-day body-weight average (C17 display only; dormant advice). */
  bodyweight: { avg7: number | null; weeklyRatePct: number | null; n: number };
};
