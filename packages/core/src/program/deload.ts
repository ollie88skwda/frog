// Deload overlay (F11, R17/R25/C14). The saved routines stay "normal"; the
// session starter calls applyDeload when blockStateAt(...).isDeload, so no
// second routine set exists to drift. Deloads are for fatigue and recovery;
// nothing here promises size gains (R17).

import type { RoutineExerciseInput, RoutineSetInput } from "../repo/types";
import { PROGRAM_RULES } from "./rules";
import type { DeloadRule } from "./types";

export const DEFAULT_DELOAD_RULE: DeloadRule = {
  everyWeeks: 6, // R17 [4,6]; 6 = Program C's week-6 deload
  setFraction: PROGRAM_RULES.deloadSetFraction,
  rir: [PROGRAM_RULES.deloadRir[0], PROGRAM_RULES.deloadRir[1]],
  e1rmDropPct: PROGRAM_RULES.deloadDropPct,
  consecutiveWeeks: PROGRAM_RULES.deloadDropWeeks,
};

/** R17/C14: half the sets, rounded down, at least 1. */
export function deloadSetCount(
  sets: number,
  fraction: number = PROGRAM_RULES.deloadSetFraction,
): number {
  if (sets <= 0) return 0;
  return Math.max(1, Math.floor(sets * fraction));
}

const isWorking = (s: RoutineSetInput) =>
  s.setType !== "warmup" && s.setType !== "warm-up";

/**
 * Overlay a deload on resolved routine exercises: working sets cut to
 * `deloadSetCount`, keeping the earliest sets (set 1 is the heaviest under
 * top-set-first; straight sets are identical so "halve them" is the same),
 * loads untouched, RIR target 3-4. Warm-up sets pass through. Input is not
 * mutated.
 */
export function applyDeload(
  exercises: readonly RoutineExerciseInput[],
  rule: Pick<DeloadRule, "setFraction" | "rir"> = DEFAULT_DELOAD_RULE,
): RoutineExerciseInput[] {
  return exercises.map((ex) => {
    const working = ex.sets.filter(isWorking);
    const keep = deloadSetCount(working.length, rule.setFraction);
    let kept = 0;
    const sets: RoutineSetInput[] = [];
    for (const s of ex.sets) {
      if (!isWorking(s)) {
        sets.push({ ...s });
        continue;
      }
      if (kept >= keep) continue;
      kept += 1;
      sets.push({
        ...s,
        targetRirMin: rule.rir[0],
        targetRirMax: rule.rir[1],
      });
    }
    return {
      ...ex,
      sets: sets.map((s, i) => ({ ...s, setNo: i })),
    };
  });
}

/**
 * R25/C14 reactive trigger: weekly best e1RM fell by more than the drop %
 * in each of the last `consecutiveWeeks` week-over-week steps. Input is the
 * weekly best, oldest first (Monday-Sunday per the research; the app week
 * start is Sunday, a documented deviation).
 */
export function deloadTriggered(
  weeklyBestE1rm: readonly number[],
  rule: Pick<
    DeloadRule,
    "e1rmDropPct" | "consecutiveWeeks"
  > = DEFAULT_DELOAD_RULE,
): boolean {
  const need = rule.consecutiveWeeks;
  if (weeklyBestE1rm.length < need + 1) return false;
  const tail = weeklyBestE1rm.slice(-(need + 1));
  for (let i = 1; i < tail.length; i++) {
    const prev = tail[i - 1];
    if (!(prev > 0)) return false;
    const dropPct = ((prev - tail[i]) / prev) * 100;
    if (!(dropPct > rule.e1rmDropPct)) return false;
  }
  return true;
}
