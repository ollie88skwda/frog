// Weekly fractional-set meter (F3-style, R6/R7/R7b). Pure. Direct sets count
// 1, indirect sets count R7's 0.5; warm-ups are never in a view.

import { PROGRAM_RULES as R } from "./rules";
import { occurrencesPerWeek } from "./schedule";
import type { ProgramView, ViewSlot } from "./types";

export type MuscleSets = { direct: number; indirect: number; total: number };

export type SessionSummary = {
  id: string;
  name: string;
  totalSets: number;
  /** Direct working sets per muscle in this one session (R7b counts these). */
  directByMuscle: Record<string, number>;
  /** The muscle with the most direct sets this session, if any. */
  top: { muscle: string; sets: number } | null;
};

/** Per-muscle weekly fractional sets across the program's cycle. */
export function weeklySets(
  view: Pick<ProgramView, "schedule" | "sessions">,
  indirectWeight: number = R.indirectWeight,
): Record<string, MuscleSets> {
  const occ = occurrencesPerWeek(view);
  const out: Record<string, MuscleSets> = {};
  const bump = (m: string, key: "direct" | "indirect", v: number) => {
    out[m] ??= { direct: 0, indirect: 0, total: 0 };
    out[m][key] += v;
  };
  for (const s of view.sessions) {
    for (const slot of s.slots) {
      for (const m of slot.credits.direct)
        bump(m, "direct", slot.rx.sets * occ);
      for (const m of slot.credits.indirect)
        bump(m, "indirect", slot.rx.sets * occ * indirectWeight);
    }
  }
  for (const m of Object.values(out)) {
    m.total = m.direct + m.indirect;
  }
  return out;
}

export function summarizeSession(
  id: string,
  name: string,
  slots: readonly ViewSlot[],
): SessionSummary {
  const directByMuscle: Record<string, number> = {};
  let totalSets = 0;
  for (const slot of slots) {
    totalSets += slot.rx.sets;
    for (const m of slot.credits.direct)
      directByMuscle[m] = (directByMuscle[m] ?? 0) + slot.rx.sets;
  }
  let top: SessionSummary["top"] = null;
  for (const [muscle, sets] of Object.entries(directByMuscle)) {
    if (!top || sets > top.sets) top = { muscle, sets };
  }
  return { id, name, totalSets, directByMuscle, top };
}

/** Sessions of the program per week that train the muscle (any credit). */
export function weeklyFrequency(
  view: Pick<ProgramView, "schedule" | "sessions">,
  muscle: string,
): number {
  const occ = occurrencesPerWeek(view);
  let n = 0;
  for (const s of view.sessions) {
    const trains = s.slots.some(
      (slot) =>
        slot.rx.sets > 0 &&
        (slot.credits.direct.includes(muscle) ||
          slot.credits.indirect.includes(muscle)),
    );
    if (trains) n += occ;
  }
  return n;
}

export type SessionTimeEstimate = { min: number; max: number };

/**
 * Working-time estimate (R15/R15b; "inference, not measured"): sets × 40 s,
 * plus rest between an exercise's sets (none after its last set), plus one
 * minute per exercise change. Warm-up time is reported separately.
 */
export function estimateMinutes(
  slots: readonly ViewSlot[],
): SessionTimeEstimate {
  const active = slots.filter((s) => s.rx.sets > 0);
  let workSec = 0;
  let restMinSec = 0;
  let restMaxSec = 0;
  for (const s of active) {
    workSec += s.rx.sets * R.time.workSecPerSet;
    const gaps = Math.max(0, s.rx.sets - 1);
    restMinSec += gaps * s.rx.restSec[0];
    restMaxSec += gaps * s.rx.restSec[1];
  }
  const changeSec =
    Math.max(0, active.length - 1) * R.time.changeSecPerExercise;
  return {
    min: Math.round((workSec + restMinSec + changeSec) / 60),
    max: Math.round((workSec + restMaxSec + changeSec) / 60),
  };
}
