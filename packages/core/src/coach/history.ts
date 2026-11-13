// Per-exercise history math (COACH-LOGIC "Computation defaults"). Pure.

import { rirRange } from "../domain/rir";
import { groupSetsBySetNo } from "../domain/volume";
import {
  BASELINE_SESSIONS,
  BREAK_DAYS,
  DAY_MS,
  LIGHT_LOAD_FRACTION,
  MIN_DROP_PRIOR,
  MIN_STALL_SESSIONS,
  NOISE_BAND,
  SHORT_SLEEP_H,
  STALL_WINDOW,
} from "./constants";
import { brzycki, median, round05 } from "./e1rm";
import type { CoachSession, CoachSet, PlannedTarget } from "./types";

export type WorkSet = {
  setNo: number;
  weightKg: number;
  reps: number;
  /** Logged RIR collapsed to a range; null = blank. */
  rir: { min: number; max: number } | null;
  /** Every row of a unilateral pair (left row is the template). */
  rows: { weightKg: number; reps: number }[];
};

export type ExSession = {
  sessionId: string;
  startedAt: number;
  sleepH: number | null;
  stress: number | null;
  carbsG: number | null;
  caffeineMg: number | null;
  planned: PlannedTarget | null;
  /** True when `planned` came from the current routine, not a snapshot. */
  inferred: boolean;
  sets: WorkSet[];
  topSet: WorkSet;
  heaviestKg: number;
  /** Highest e1RM of a usable set; null when none is usable. */
  e1rm: number | null;
  /** A set over 10 total reps was seen and not used. */
  flagged: boolean;
  skippedNoRir: number;
  /** null = could not be judged (no planned target or no RIR). */
  effortOk: boolean | null;
  isDeload: boolean;
  /** Median e1RM of up to 6 earlier sessions (null under 3): C9b/light-set baseline. */
  baseline: number | null;
};

export const plannedKey = (p: PlannedTarget | null): string | null =>
  p ? `${p.repsMin}-${p.repsMax}|${p.rirMin}-${p.rirMax}` : null;

export function isWorkingSet(s: CoachSet): boolean {
  return (
    s.setType !== "warmup" &&
    s.completed &&
    (s.weightKg ?? 0) > 0 &&
    (s.reps ?? 0) > 0
  );
}

/** Working sets of one exercise in one session, unilateral pairs collapsed
 * through groupSetsBySetNo (AGENTS.md: never count rows). */
export function workSetsOf(sets: CoachSet[]): WorkSet[] {
  const groups = groupSetsBySetNo(sets.filter(isWorkingSet));
  return groups
    .map((g) => {
      const t = g.find((r) => r.side === "left") ?? g[0];
      return {
        setNo: t.setNo,
        weightKg: t.weightKg as number,
        reps: t.reps as number,
        rir: rirRange({ rirMin: t.rirMin, rirMax: t.rirMax }),
        rows: g.map((r) => ({
          weightKg: r.weightKg as number,
          reps: r.reps as number,
        })),
      };
    })
    .sort((a, b) => a.setNo - b.setNo);
}

/** RIR used for e1RM: the lower end of a logged range (the conservative read). */
const rirForE1rm = (s: WorkSet): number | null => s.rir?.min ?? null;

/** Planned RIR for the i-th working set (isolation last sets carry their own). */
export function plannedRirAt(
  p: PlannedTarget,
  i: number,
): { min: number; max: number } {
  return p.perSetRir?.[i] ?? { min: p.rirMin, max: p.rirMax };
}

/** Logged RIR is within 1 of either end of the planned range. */
export function withinOneOfTarget(
  logged: { min: number; max: number },
  planned: { min: number; max: number },
): boolean {
  return logged.max >= planned.min - 1 && logged.min <= planned.max + 1;
}

function sessionE1rm(
  sets: WorkSet[],
  baseline: number | null,
): { e1rm: number | null; flagged: boolean; skipped: number } {
  let best: number | null = null;
  let flagged = false;
  let skipped = 0;
  for (const s of sets) {
    const rir = rirForE1rm(s);
    if (rir == null) {
      skipped++;
      continue;
    }
    // C9b: a set at or under 25 % of baseline e1RM is excluded from session e1RM.
    if (baseline != null && s.weightKg <= LIGHT_LOAD_FRACTION * baseline)
      continue;
    const e = brzycki(s.weightKg, s.reps, rir);
    if (!e) continue;
    if (e.flagged) {
      flagged = true;
      continue;
    }
    if (best == null || e.value > best) best = e.value;
  }
  return { e1rm: best, flagged, skipped };
}

export function effortCheck(
  sets: WorkSet[],
  planned: PlannedTarget | null,
): boolean | null {
  if (!planned) return null;
  let judged = 0;
  for (let i = 0; i < sets.length; i++) {
    const r = sets[i].rir;
    if (!r) continue;
    judged++;
    if (!withinOneOfTarget(r, plannedRirAt(planned, i))) return false;
  }
  return judged ? true : null;
}

export function buildExHistory(
  exerciseId: string,
  sessions: readonly CoachSession[],
  planSlot: PlannedTarget | null,
): ExSession[] {
  const out: ExSession[] = [];
  for (const s of sessions) {
    const blocks = s.exercises.filter((e) => e.exerciseId === exerciseId);
    if (!blocks.length) continue;
    const sets = workSetsOf(blocks.flatMap((b) => b.sets));
    if (!sets.length) continue;
    const snap = blocks.find((b) => b.planned)?.planned ?? null;
    const planned = snap ?? planSlot;
    const topSet = sets.reduce((a, b) => (b.weightKg > a.weightKg ? b : a));
    // Light-load exclusion needs a baseline: median of up to 6 earlier sessions.
    const earlier = out
      .filter((e) => !e.isDeload && e.e1rm != null && e.effortOk !== false)
      .slice(-BASELINE_SESSIONS)
      .map((e) => e.e1rm as number);
    const baseline = earlier.length >= MIN_DROP_PRIOR ? median(earlier) : null;
    const { e1rm, flagged, skipped } = sessionE1rm(sets, baseline);
    let effortOk = effortCheck(sets, planned);
    // §9.1 backfill policy: with no snapshot, a session is "inferred
    // comparable" only if its reps also sit in the current routine range.
    if (!snap && planned && effortOk) {
      const reps = topSet.reps;
      if (reps < planned.repsMin || reps > planned.repsMax + 2)
        effortOk = false;
    }
    out.push({
      sessionId: s.id,
      startedAt: s.startedAt,
      sleepH: s.sleepH,
      stress: s.stress,
      carbsG: s.carbsG,
      caffeineMg: s.caffeineMg,
      planned,
      inferred: !snap,
      sets,
      topSet,
      heaviestKg: topSet.weightKg,
      e1rm,
      flagged,
      skippedNoRir: skipped,
      effortOk,
      isDeload: planned?.isDeload === true,
      baseline,
    });
  }
  return out;
}

/**
 * Comparable window ending at `endIdx` (C2c-reset, "Comparable session"):
 * same planned rep range and target RIR as `targetKey` (a change starts a new
 * window), no 14-day gap, effort check passed (failures are skipped and the
 * window extends back), deloads skipped. Chronological order.
 */
export function windowFor(
  hist: ExSession[],
  endIdx: number,
  targetKey: string | null,
  requireE1rm = true,
): ExSession[] {
  const picked: ExSession[] = [];
  for (let j = endIdx; j >= 0; j--) {
    const s = hist[j];
    if (
      j < endIdx &&
      hist[j + 1].startedAt - s.startedAt >= BREAK_DAYS * DAY_MS
    )
      break;
    if (s.isDeload) continue;
    const key = plannedKey(s.planned);
    if (targetKey != null && key != null && key !== targetKey) break;
    if (requireE1rm && s.e1rm == null) continue;
    if (s.effortOk === false) continue;
    picked.push(s);
  }
  picked.reverse();
  return picked;
}

/** C9d: after two back-to-back short-sleep sessions a below-baseline session
 * does not count toward a stall. Applied to the stall window only. */
export function stallWindow(win: ExSession[]): ExSession[] {
  return win.filter((s, i) => {
    if (i < 1 || s.sleepH == null || s.sleepH >= SHORT_SLEEP_H) return true;
    const prev = win[i - 1];
    if (prev.sleepH == null || prev.sleepH >= SHORT_SLEEP_H) return true;
    const base = baselineOf(win, i);
    return base == null || (s.e1rm as number) >= base;
  });
}

/** Median of up to 6 comparable sessions before index i; null under 3 (C2c-drop). */
export function baselineOf(win: ExSession[], i: number): number | null {
  const prior = win
    .slice(Math.max(0, i - BASELINE_SESSIONS), i)
    .map((s) => s.e1rm as number);
  return prior.length >= MIN_DROP_PRIOR ? median(prior) : null;
}

export type Analysis = {
  n: number;
  e1rms: number[];
  baselineMedian: number | null;
  /** Fraction below baseline for the latest session (negative = above). */
  dropPct: number | null;
  /** Beyond the 10 % noise band. */
  isDrop: boolean;
  stall: {
    evaluable: boolean;
    stalled: boolean;
    pending: boolean;
    priorBest: number | null;
    confirmedBest: number | null;
  };
};

/** C2c-stall: ≥7 comparable sessions; best confirmed e1RM of the last 6 vs the
 * best before that window. A best counts at any size but only once matched or
 * beaten by a later session (one-off spikes are discounted); a new best in the
 * newest session is pending, not a stall. */
export function analyze(win: ExSession[]): Analysis {
  const n = win.length;
  const e = win.map((s) => s.e1rm as number);
  const base = n ? baselineOf(win, n - 1) : null;
  const dropPct = base != null && n ? (base - e[n - 1]) / base : null;
  const isDrop = dropPct != null && dropPct > NOISE_BAND + 1e-9;
  const stall: Analysis["stall"] = {
    evaluable: n >= MIN_STALL_SESSIONS,
    stalled: false,
    pending: false,
    priorBest: null,
    confirmedBest: null,
  };
  if (stall.evaluable) {
    const start = n - STALL_WINDOW;
    const priorBest = Math.max(...e.slice(0, start));
    let confirmed = Number.NEGATIVE_INFINITY;
    for (let i = start; i < n - 1; i++) {
      const matched = e.slice(i + 1).some((x) => round05(x) >= round05(e[i]));
      if (matched && e[i] > confirmed) confirmed = e[i];
    }
    const newest = e[n - 1];
    stall.priorBest = priorBest;
    stall.confirmedBest = Number.isFinite(confirmed) ? confirmed : null;
    const confirmedNew = round05(confirmed) > round05(priorBest);
    stall.pending = !confirmedNew && round05(newest) > round05(priorBest);
    stall.stalled = !confirmedNew && !stall.pending;
  }
  return {
    n,
    e1rms: e,
    baselineMedian: base,
    dropPct,
    isDrop,
    stall,
  };
}

/** Every working set at/above the top with RIR within 1 of target (all rows of
 * a unilateral pair). Blank RIR cannot be validated, so it fails. */
export function topReached(s: ExSession): boolean {
  const p = s.planned;
  if (!p) return false;
  return s.sets.every((set, i) => {
    if (!set.rir) return false;
    if (!withinOneOfTarget(set.rir, plannedRirAt(p, i))) return false;
    return set.rows.every((r) => r.reps >= p.repsMax);
  });
}

/** Heaviest working set ≥ top + 2 reps with RIR within 1 of target (one session). */
export function overshot(s: ExSession): boolean {
  const p = s.planned;
  if (!p || !s.topSet.rir) return false;
  const idx = s.sets.indexOf(s.topSet);
  return (
    s.topSet.rows.every((r) => r.reps >= p.repsMax + 2) &&
    withinOneOfTarget(s.topSet.rir, plannedRirAt(p, idx))
  );
}

export type AddLoadTrigger = {
  kind: "overshoot" | "two_session";
  fromIdx: number;
  fromSessionId: string;
  atKg: number;
  /** Reps of the heaviest set in the trigger session. */
  reps: number;
  /** A later normal-sleep session stayed at or under the trigger load: the
   * user overrode the step, so the card flips to "ready whenever" (F4). */
  overridden: boolean;
};

/**
 * The pending add-load, if any (C2c-progress / C2c-overshoot). A trigger fires
 * on one overshoot, or two consecutive top-reached sessions at the same load.
 * It stays pending until a later session lifts a heavier load, so a short-sleep
 * hold only delays it (case 12) and an override is not re-nagged (F4).
 */
export function pendingAddLoad(
  win: ExSession[],
  hist: ExSession[] = win,
): AddLoadTrigger | null {
  for (let t = win.length - 1; t >= 0; t--) {
    const s = win[t];
    let kind: AddLoadTrigger["kind"] | null = null;
    if (overshot(s)) kind = "overshoot";
    else if (
      t >= 1 &&
      topReached(s) &&
      topReached(win[t - 1]) &&
      win[t - 1].heaviestKg === s.heaviestKg
    )
      kind = "two_session";
    if (!kind) continue;
    const consumed = hist.some(
      (x) => x.startedAt > s.startedAt && x.heaviestKg > s.heaviestKg,
    );
    if (consumed) return null;
    const overridden = hist.some(
      (x) =>
        x.startedAt > s.startedAt &&
        (x.sleepH == null || x.sleepH >= SHORT_SLEEP_H) &&
        x.heaviestKg <= s.heaviestKg,
    );
    return {
      kind,
      fromIdx: t,
      fromSessionId: s.sessionId,
      atKg: s.heaviestKg,
      reps: s.topSet.reps,
      overridden,
    };
  }
  return null;
}

/** RIR coverage: share of working sets with a logged RIR (last 6 sessions). */
export function rirCoverage(hist: ExSession[]): number | null {
  const sets = hist.slice(-6).flatMap((s) => s.sets);
  if (!sets.length) return null;
  return sets.filter((s) => s.rir).length / sets.length;
}
