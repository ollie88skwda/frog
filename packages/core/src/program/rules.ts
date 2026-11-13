// The one place program numbers live. Every constant is a research rule from
// PROGRAM-RULES.md / COACH-LOGIC.md, keyed by rule ID. `rules.test.ts` parses
// the committed YAML snapshot (`rules.source.yaml`, the "Machine-readable
// parameters" block of PROGRAM-RULES.md) and fails when any value here drifts
// from it. Prose rules win if they ever differ from the YAML.

import type { ProgramWeekday } from "./types";

export type ProgramRuleSet = {
  /** R7 [T4]: indirect sets count 0.5. */
  indirectWeight: number;
  /** R4 [T1]: spread weekly sets over at least two sessions per muscle. */
  sessionsPerMuscleMin: number;
  /** C11 [T5]: practical weekly fractional hard sets per muscle. */
  weeklySets: readonly [number, number];
  /** C12 [T5]: at or above this, trim only if stalled. */
  weeklyCapSets: number;
  /** C12 [T5]: trim 1-2 sets on a confirmed stall. */
  trimSets: readonly [number, number];
  /** R7b [T5]: planning range for direct sets per muscle per session. */
  directPerSession: readonly [number, number];
  /** R8b [T5]. */
  repsMainCompound: readonly [number, number];
  repsMost: readonly [number, number];
  repsHeaviest: readonly [number, number];
  repsIsolation: readonly [number, number];
  /** R10 [T5]. */
  rirDefault: readonly [number, number];
  rirLastIsolationSet: readonly [number, number];
  /** R6 [T5]: a hard set is a working set logged at RIR <= this. */
  hardSetRirMax: number;
  /** C5 [T5]: compound/strength work stays at RIR >= this. */
  rirFloorCompound: number;
  /** R15 [T4]: rest bands in seconds. */
  restAccessorySec: readonly [number, number];
  restHeavySec: readonly [number, number];
  /** R17 [T5]. */
  deloadSetFraction: number;
  deloadRir: readonly [number, number];
  deloadIntervalWeeks: readonly [number, number];
  /** R25 / C14 [T5]. */
  deloadDropPct: number;
  deloadDropWeeks: number;
  /** R17b [T5]: warm-up ramp, never counted toward volume. */
  warmupFirstLift: readonly { pct: number; reps: number }[];
  warmupLaterLiftPct: readonly [number, number];
  warmupLaterLiftSets: number;
  /** R18b [T4]: roughly a third of normal weekly sets. */
  maintainShare: number;
  /** C15 [T5]: after this many days off, restart lighter. */
  restartGapDays: number;
  restartLoadPct: readonly [number, number];
  /** Default restart load: 85%, mid-band (F11 acceptance). */
  restartDefaultPct: number;
  /** Session-length estimate (research Program docs: "inference, not measured"). */
  time: {
    workSecPerSet: number;
    changeSecPerExercise: number;
    warmupMin: readonly [number, number];
  };
};

export const PROGRAM_RULES: ProgramRuleSet = {
  indirectWeight: 0.5, // R7
  sessionsPerMuscleMin: 2, // R4
  weeklySets: [10, 20], // C11
  weeklyCapSets: 20, // C12
  trimSets: [1, 2], // C12
  directPerSession: [2, 5], // R7b
  repsMainCompound: [3, 9], // R8b
  repsMost: [4, 8], // R8b
  repsHeaviest: [4, 7], // R8b
  repsIsolation: [10, 15], // R8b
  rirDefault: [1, 3], // R10
  rirLastIsolationSet: [0, 1], // R10
  hardSetRirMax: 4, // R6 (hard set: RIR 4 or less)
  rirFloorCompound: 1, // C5
  restAccessorySec: [60, 90], // R15
  restHeavySec: [120, 180], // R15
  deloadSetFraction: 0.5, // R17
  deloadRir: [3, 4], // R17
  deloadIntervalWeeks: [4, 6], // R17
  deloadDropPct: 2.5, // R25 / C14
  deloadDropWeeks: 2, // R25 / C14
  warmupFirstLift: [
    { pct: 40, reps: 6 },
    { pct: 80, reps: 3 },
  ], // R17b
  warmupLaterLiftPct: [60, 70], // R17b
  warmupLaterLiftSets: 1, // R17b
  maintainShare: 0.33, // R18b
  restartGapDays: 14, // C2c-reset / C15
  restartLoadPct: [80, 90], // C15
  restartDefaultPct: 85, // C15 (F11)
  time: {
    workSecPerSet: 40,
    changeSecPerExercise: 60,
    warmupMin: [3, 8],
  },
};

/** Week boundary of the app (FIRST_WEEKDAY, Sunday). Kept here so the block-week maths needs no config import cycle. */
export const PROGRAM_WEEK_START: ProgramWeekday = 0;
