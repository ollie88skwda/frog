// Schedule + block-week maths (F8/F11). Pure. The block week is derived from
// `startedAt` and the clock, never stored as a cursor (matches plan.ts).

import { weekStart } from "../domain/streak";
import { PROGRAM_RULES } from "./rules";
import type { BlockPlan, ProgramSchedule, ProgramView } from "./types";

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEK_MS = 7 * DAY_MS;

/** Sessions per week: every-other-day is 3.5, a weekday list is its length. */
export function sessionsPerWeek(s: ProgramSchedule): number {
  return s.kind === "interval" ? 7 / s.everyDays : s.days.length;
}

/**
 * How often each session of a program occurs per week. "same" rotation has
 * one session; "cycle" shares the week's sessions evenly (Program B: each of
 * Mon/Wed/Fri once; an interval schedule with k sessions: 7/(everyDays·k)).
 */
export function occurrencesPerWeek(
  view: Pick<ProgramView, "schedule" | "sessions">,
): number {
  const k = Math.max(1, view.sessions.length);
  return sessionsPerWeek(view.schedule) / k;
}

export type BlockPhase = "train" | "deload" | "retest" | "complete";

export type BlockState = {
  /** 1-based week since the block started; null before it has started. */
  week: number | null;
  phase: BlockPhase;
  isDeload: boolean;
  isRetest: boolean;
  /** Planned target RIR for this week, if the block plan sets one. */
  rir: readonly [number, number] | null;
  /** Load steps are held this week (Program C wk5). */
  holdLoad: boolean;
  /** Weeks until the next planned deload (0 = this week); null if none. */
  weeksUntilDeload: number | null;
  /** Total weeks of a fixed block, null for a continuous one. */
  totalWeeks: number | null;
};

/** 1-based block week. Interval schedules count elapsed 7-day periods from the
 *  start; weekday schedules count app weeks (FIRST_WEEKDAY) so "week 2" starts
 *  on the same day as every other calendar week. */
export function blockWeek(
  schedule: ProgramSchedule,
  startedAt: number,
  now: number,
  firstWeekday = 0,
): number {
  if (now < startedAt) return 1;
  if (schedule.kind === "interval") {
    return Math.floor((now - startedAt) / WEEK_MS) + 1;
  }
  const a = weekStart(startedAt, firstWeekday);
  const b = weekStart(now, firstWeekday);
  // Round, not floor: DST makes a local week 167 or 169 hours.
  return Math.round((b - a) / WEEK_MS) + 1;
}

export function fixedBlockWeeks(block: Extract<BlockPlan, { kind: "fixed" }>) {
  const { trainingWeeks, deloadWeek, retestWeek } = block.fixed;
  const afterTraining = deloadWeek ?? trainingWeeks;
  return retestWeek ? afterTraining + 1 : afterTraining;
}

/** What the block says about a given 1-based week. Pure; no clock. */
export function blockStateForWeek(
  block: BlockPlan,
  week: number | null,
): BlockState {
  const empty: BlockState = {
    week: null,
    phase: "train",
    isDeload: false,
    isRetest: false,
    rir: null,
    holdLoad: false,
    weeksUntilDeload: null,
    totalWeeks: block.kind === "fixed" ? fixedBlockWeeks(block) : null,
  };
  if (week == null) return empty;

  if (block.kind === "continuous") {
    const n = block.deload.everyWeeks;
    const pos = ((week - 1) % n) + 1;
    const isDeload = pos === n;
    return {
      ...empty,
      week,
      phase: isDeload ? "deload" : "train",
      isDeload,
      rir: isDeload ? block.deload.rir : null,
      weeksUntilDeload: n - pos,
    };
  }

  const { fixed, deload } = block;
  const total = fixedBlockWeeks(block);
  if (week > total) return { ...empty, week, phase: "complete" };
  const isDeload = fixed.deloadWeek != null && week === fixed.deloadWeek;
  const isRetest =
    fixed.retestWeek &&
    fixed.deloadWeek != null &&
    week === fixed.deloadWeek + 1;
  const rir = isDeload ? deload.rir : (fixed.weekRir?.[week] ?? null);
  return {
    ...empty,
    week,
    phase: isDeload ? "deload" : isRetest ? "retest" : "train",
    isDeload,
    isRetest,
    rir,
    holdLoad: fixed.holdLoadWeeks?.includes(week) ?? false,
    weeksUntilDeload:
      fixed.deloadWeek != null && week <= fixed.deloadWeek
        ? fixed.deloadWeek - week
        : null,
  };
}

/** The block state for a saved program at `now`. */
export function blockStateAt(
  block: BlockPlan,
  schedule: ProgramSchedule,
  startedAt: number | null,
  now: number,
  firstWeekday = 0,
): BlockState {
  if (startedAt == null) return blockStateForWeek(block, null);
  return blockStateForWeek(
    block,
    blockWeek(schedule, startedAt, now, firstWeekday),
  );
}

/** C15 [T5]: 14+ days off suggests a lighter restart. */
export function needsRestart(daysSinceLastSession: number): boolean {
  return daysSinceLastSession >= PROGRAM_RULES.restartGapDays;
}

/** C15: restart load = pct (default 85%) of the previous load, rounded to the
 *  equipment step. Never below one step. */
export function restartLoadKg(
  previousKg: number,
  stepKg: number,
  pct: number = PROGRAM_RULES.restartDefaultPct,
): number {
  if (!(previousKg > 0) || !(stepKg > 0)) return 0;
  const rounded = Math.round((previousKg * pct) / 100 / stepKg) * stepKg;
  return Math.max(stepKg, Number(rounded.toFixed(4)));
}
