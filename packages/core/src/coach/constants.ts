// Coach thresholds. Every number is a COACH-LOGIC.md "Computation defaults"
// value (research/hypertrophy/COACH-LOGIC.md); rule IDs are cited inline.

/** Every coach week bucket (C10/C11/C12/C14) is Monday-Sunday (COACH-LOGIC
 * C14), unlike the app's Sunday `FIRST_WEEKDAY`: the research defines the
 * decline test on Mon-Sun weeks, so the coach keeps its own constant
 * (0 = Sunday … 1 = Monday). */
export const COACH_WEEK_START = 1;

/** C2c-noise: RIR-based e1RM estimates swing ±10%; only a bigger single-session
 * move counts as a drop. */
export const NOISE_BAND = 0.1;
/** C2c-stall: comparable sessions needed before a stall may be called. */
export const MIN_STALL_SESSIONS = 7;
/** C2c-stall: the "recent" window compared with the best before it. */
export const STALL_WINDOW = 6;
/** C2c-drop / C7: previous-session median needs at least this many sessions. */
export const MIN_DROP_PRIOR = 3;
/** C2c-drop: median of up to this many previous comparable sessions. */
export const BASELINE_SESSIONS = 6;
/** C2c-reset / C15: a gap this long starts a new window / restart. */
export const BREAK_DAYS = 14;
/** Short sleep (C7, C9d, C10): strictly under this. */
export const SHORT_SLEEP_H = 6;
/** C7 high-stress trigger (1-10 scale). */
export const HIGH_STRESS = 8;
/** C14: weekly best must fall by MORE than this fraction, two weeks running. */
export const C14_DECLINE = 0.025;
/** C10: share of recent sessions with short sleep must EXCEED this. */
export const C10_SHARE = 0.5;
export const C10_WINDOW_DAYS = 14;
/** C9b: morning light-load note: start strictly before this local minute. */
export const C9B_BEFORE_MINUTE = 10 * 60;
/** C9b: a set at or under this fraction of baseline e1RM is "light". */
export const LIGHT_LOAD_FRACTION = 0.25;
/** Brzycki is only used up to this many total reps (reps + RIR). */
export const MAX_E1RM_TOTAL_REPS = 10;
/** C15 restart: default 85% of prior top load, range 80-90%. */
export const RESTART_PCT = { low: 0.8, default: 0.85, high: 0.9 } as const;
/** C2c increment: ~2.5% compounds, ~5% small machines; step > 10% of load → fallback. */
export const INCREMENT_PCT = { compound: 0.025, isolation: 0.05 } as const;
export const MAX_STEP_FRACTION = 0.1;
/** R8b rep bands for a C2 range shift. */
export const COMPOUND_BAND = { min: 3, max: 9 } as const;
export const ISOLATION_BAND = { min: 10, max: 15 } as const;
/** R7b: no more than this many direct sets per muscle in one session. */
export const MAX_DIRECT_SETS_PER_SESSION = 5;
/** C11/C12 weekly hard-set band (fractional). */
export const VOLUME_BAND = { low: 10, high: 20 } as const;
/** R6: a hard set has logged RIR at or under this (blank RIR counts, flagged). */
export const HARD_SET_RIR_MAX = 4;
/** R7: indirect (secondary muscle) credit. */
export const INDIRECT_CREDIT = 0.5;
/** C4/C5: pooled sets needed, share that must be off-target. */
export const DRIFT_MIN_SETS = 6;
export const DRIFT_SHARE = 0.8;
export const DRIFT_WINDOW_DAYS = 7;
/** C6: RIR clamp on every emitted prescription (compounds never reach failure). */
export const RIR_CLAMP = {
  compound: { min: 1, max: 3 },
  isolation: { min: 0, max: 3 },
} as const;
/** Deload form (R17/C14): 3-4 RIR. */
export const DELOAD_RIR: [number, number] = [3, 4];
/** C19: sessions showing the same carb-performance link before any comment. */
export const C19_MIN_PATTERN = 3;
/** F4: RIR coverage below this → "log RIR to unlock suggestions". */
export const MIN_RIR_COVERAGE = 0.5;
/** F4: dismiss "Not for this exercise" lasts 4 weeks. */
export const DISMISS_EXERCISE_DAYS = 28;
/** F4 in-set nudge caps. */
export const NUDGES_PER_EXERCISE = 1;
export const NUDGES_PER_SESSION = 3;
export const DAY_MS = 86_400_000;
