// Program templates: declarative, pure data (F8/F11, docs: frog-redesign-plan
// §6 F8, notes/program-builder.md §3). Zero UI / Convex imports. Every number
// that encodes a research rule lives in ./rules.ts, never here.

import type { EquipmentKind } from "../domain/exercise-types";
import type { RuleId } from "../evidence/rules";

/** 0 = Sunday (matches FIRST_WEEKDAY / Date#getDay). */
export type ProgramWeekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export type ProgramSchedule =
  | { kind: "interval"; everyDays: 1 | 2 | 3 }
  | { kind: "weekdays"; days: ProgramWeekday[] };

export type SlotRole = "main-compound" | "compound" | "isolation";
export type SlotStability = "stable" | "moderate" | "free";

/** One R12b "menu cell": the region/length a slot has to cover. */
export type RegionCellKey =
  | "quads-vasti"
  | "quads-rf"
  | "hams-hinge"
  | "hams-biarticular"
  | "glutes"
  | "triceps-long"
  | "biceps"
  | "side-delts"
  | "calves-gastroc"
  | "chest"
  | "upper-chest"
  | "back"
  | "vertical-press"
  | "trunk";

export type MenuEntry = {
  /** Exact exercise name in the seed library (resolved by the one matcher). */
  matchKey: string;
  stability: SlotStability;
  /** Joint action (anatomy JOINT_ACTIONS key) this exercise trains. */
  jointAction: string;
  /** One-line, claim-safe reason shown under "Why this exercise". */
  why?: string;
};

export type SlotPrescription = {
  sets: number;
  reps: [number, number];
  /** Target RIR range for working sets (R10 default [1,3]). */
  rir: [number, number];
  /** Rest band in seconds (R15). */
  restSec: [number, number];
  /** Warm-up ramp (R17b): 2 ramp sets / 1 ramp set / none. Never counted. */
  warmup: "ramp2" | "ramp1" | "none";
};

export type SlotTemplate = {
  /** Stable id across sessions and blocks (R2), e.g. "1a", "7b". */
  slot: string;
  role: SlotRole;
  /** direct = 1 fractional set per set, indirect = R7 weight. Muscle keys. */
  credits: { direct: string[]; indirect: string[] };
  region: RegionCellKey;
  /** Anatomy JOINT_ACTIONS keys, for the joint-action ⇄ region lenses. */
  jointActions: string[];
  /** Ranked candidates, stable-first; first available in the library wins. */
  menu: MenuEntry[];
  rx: SlotPrescription;
  /** Reps used when Philosophy.repBias is "heavy" (D4: 4-8 on isolation). */
  heavyReps?: [number, number];
  /** Per-session overrides keyed by session id (Program B: incline 4 sets). */
  perSession?: Record<string, Partial<Pick<SlotPrescription, "sets">>>;
  /** Slot appears only in these sessions (e.g. hip thrust, Wed only). */
  onlySessions?: string[];
  /** Eligible for top-set-first (compound slots); see Philosophy.firstSet. */
  firstSetMax?: boolean;
  rules: RuleId[];
  note?: string;
};

export type SessionTemplate = {
  id: string;
  name: string;
  slots: SlotTemplate[];
};

export type DeloadRule = {
  /** Deload is every Nth week (R17: 4-6). N = 6 means weeks 1-5 train, week 6 deloads. */
  everyWeeks: number;
  /** Half the sets, rounded down, min 1 per exercise (R17/C14). */
  setFraction: number;
  /** Target RIR during the deload (R17). */
  rir: [number, number];
  /** Reactive trigger (R25/C14): weekly best e1RM falls this % two weeks running. */
  e1rmDropPct: number;
  consecutiveWeeks: number;
};

export type FixedBlock = {
  /** Number of training weeks before the deload (Program C: 5). */
  trainingWeeks: number;
  /** 1-based week index of the deload, or null for no deload. */
  deloadWeek: number | null;
  /** A retest week follows the deload (Program C wk7). */
  retestWeek: boolean;
  /** Per-week RIR targets from the program doc, keyed by 1-based week. */
  weekRir?: Record<number, [number, number]>;
  /** Weeks where load steps are held (Program C wk5). */
  holdLoadWeeks?: number[];
};

export type BlockPlan =
  | { kind: "continuous"; deload: DeloadRule }
  | { kind: "fixed"; fixed: FixedBlock; deload: DeloadRule };

export type ProgramGoal = "muscle" | "strength" | "general" | "maintain";
export type TrainingStatus = "new" | "intermediate" | "experienced";
export type SessionLengthMinutes = 30 | 45 | 60 | 75 | 90;

/** The five builder questions (F8). */
export type BuilderAnswers = {
  schedule: ProgramSchedule;
  goal: ProgramGoal;
  status: TrainingStatus;
  equipment: EquipmentKind[];
  minutes: SessionLengthMinutes;
};

/** "Oliver's method" switches. Defaults are labelled as method, not evidence. */
export type Philosophy = {
  /**
   * Top-set-first on compound slots (a method, not a research rule, T5):
   * "off" = research flat RIR; "top" = set 1 at RIR 1, rest 2-3 (Frog default);
   * "max" = set 1 at RIR 0-1.
   */
  firstSet: "off" | "top" | "max";
  /** heavy: 4-8 on every slot (D4 default). research: isolation 10-15. */
  repBias: "heavy" | "research";
  /** Exercise grouping lens (D2). Same program either way. */
  grouping: "joint_action" | "region";
};

export const DEFAULT_PHILOSOPHY: Philosophy = {
  firstSet: "top",
  repBias: "heavy",
  grouping: "joint_action",
};

export type ProgramTemplate = {
  id: string;
  name: string;
  /** Shown on the catalog card. */
  summary: string;
  author: "frog-default" | "research-a" | "research-b" | "research-c";
  schedule: ProgramSchedule;
  sessions: SessionTemplate[];
  /** same: every workout is sessions[0]; cycle: plan.ts picks the neglected one. */
  rotation: "same" | "cycle";
  block: BlockPlan;
  goal: ProgramGoal;
  philosophy: Philosophy;
  /** Weekly fractional sets per muscle from the program doc; a CI check. */
  expectedWeekly: Record<string, number>;
  /** Working-time range from the program doc (minutes, whole program). */
  minutes: { min: number; max: number };
  provenance: { programDoc: string; rules: RuleId[] };
};

/** A user's edit on top of a template; kept so a rebuild can preserve it. */
export type SlotOverride = {
  /** Omit to apply to every session containing the slot. */
  session?: string;
  slot: string;
  sets?: number;
  reps?: [number, number];
  rir?: [number, number];
  restSec?: [number, number];
  /** Pinned exercise id (a swap). */
  exerciseId?: string;
  remove?: boolean;
};

/** One-tap fix attached to a validator finding. */
export type ProgramPatch = SlotOverride[];

/** Stored in `programs.config` (json), §9.4. No schema change. */
export type SavedProgramConfig = {
  templateId: string;
  answers: BuilderAnswers;
  philosophy: Philosophy;
  block: {
    /** ms epoch; the block week is derived from it, never stored (F11). */
    startedAt: number | null;
    everyWeeks: number;
    fixed?: FixedBlock;
  };
  overrides: SlotOverride[];
};

// ---- the flattened view every pure function (validate/volume/deload) reads ----

export type ViewSlot = {
  slot: string;
  role: SlotRole;
  credits: { direct: string[]; indirect: string[] };
  region?: RegionCellKey;
  rx: SlotPrescription;
  firstSetMax?: boolean;
  /** Present on template-derived views; absent for views built from routines. */
  rules?: RuleId[];
};

export type ViewSession = { id: string; name: string; slots: ViewSlot[] };

/**
 * What `validateProgram` and the meter read. Template-derived (via
 * `viewOf`) or built from saved routines by the routine editor, so the meter
 * works for any program, not just builder ones.
 */
export type ProgramView = {
  schedule: ProgramSchedule;
  rotation: "same" | "cycle";
  sessions: ViewSession[];
  block: BlockPlan | null;
  goal: ProgramGoal;
  philosophy?: Pick<Philosophy, "repBias" | "firstSet">;
  /** The user's per-session time budget, if known. */
  maxMinutes?: number;
};
