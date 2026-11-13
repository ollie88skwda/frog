// Comparable sessions, single-session drop and stall (COACH-LOGIC
// "Computation defaults": Stall, Comparable session, Single-session drop,
// Break reset). Rule IDs: C2c-stall, C2c-noise, C2c-drop, C2c-reset.
// Pure and framework-free. The 7/6 stall rule is untested on real logs
// (COACH-LOGIC "Open coach items"), so callers label it "beta".

import { roundE1rmDisplay } from "./e1rm";

export const STALL_MIN_SESSIONS = 7; // C2c-stall
export const STALL_WINDOW = 6; // C2c-stall: last 6 vs the best before them
export const NOISE_BAND = 0.1; // C2c-noise (RIR-based e1RM)
export const BREAK_RESET_DAYS = 14; // C2c-reset
export const DROP_MIN_PRIOR = 3; // C2c-drop: skip with fewer than 3 prior
export const DROP_MEDIAN_WINDOW = 6; // C2c-drop: median of previous 6

const DAY_MS = 86_400_000;

export type ComparableSession = {
  sessionId: string;
  /** ms epoch (session start). */
  at: number;
  /** Session e1RM, unrounded (sessionE1rm). */
  e1rm: number;
  /** Effort check passed. Absent = unknown = treated as passed. */
  effortOk?: boolean;
  /** Same target rep range for sessions that share a key. */
  repRangeKey?: string | null;
  /** Same equipment for sessions that share a key. */
  equipmentKey?: string | null;
};

/** Median; null for an empty list. */
export function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/**
 * Effort check (Comparable session): working sets logged within 1 RIR of their
 * planned target; for a range target (0-1) within 1 of either end, so 0-2
 * passes. Sets with no logged RIR are skipped; with no plan or no logged RIR
 * there is nothing to fail, so it passes (degraded mode, callers show the
 * coverage separately).
 */
export function effortCheck(
  sets: { rirMid: number | null }[],
  planned: { rirMin: number | null; rirMax: number | null } | null | undefined,
): boolean {
  if (!planned || (planned.rirMin == null && planned.rirMax == null))
    return true;
  const lo = planned.rirMin ?? (planned.rirMax as number);
  const hi = planned.rirMax ?? (planned.rirMin as number);
  for (const s of sets) {
    if (s.rirMid == null) continue;
    if (s.rirMid < lo - 1 || s.rirMid > hi + 1) return false;
  }
  return true;
}

/**
 * The comparable window: sessions sorted by time, effort-failed sessions
 * skipped (the window extends back), and everything before the last break
 * (gap of 14+ days) or before the last change of rep-range / equipment key
 * dropped. Returns the surviving window and whether anything was reset away.
 */
export function windowAfterBreak(sessions: ComparableSession[]): {
  window: ComparableSession[];
  reset: "none" | "break" | "target_change";
} {
  const sorted = [...sessions].sort((a, b) => a.at - b.at);
  let start = 0;
  let reset: "none" | "break" | "target_change" = "none";
  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1];
    const cur = sorted[i];
    if (cur.at - prev.at >= BREAK_RESET_DAYS * DAY_MS) {
      start = i;
      reset = "break";
    } else if (
      (cur.repRangeKey != null &&
        prev.repRangeKey != null &&
        cur.repRangeKey !== prev.repRangeKey) ||
      (cur.equipmentKey != null &&
        prev.equipmentKey != null &&
        cur.equipmentKey !== prev.equipmentKey)
    ) {
      start = i;
      reset = "target_change";
    }
  }
  // Effort-failed sessions are skipped, not counted. The gap rule above runs
  // over every session (a skipped session still shows the lifter trained).
  const window = sorted.slice(start).filter((s) => s.effortOk !== false);
  return { window, reset: start > 0 ? reset : "none" };
}

/** Comparable sessions only (effort passed, after the last break/target change). */
export function comparableSessions(
  sessions: ComparableSession[],
): ComparableSession[] {
  return windowAfterBreak(sessions).window;
}

/** Median e1RM of up to `n` sessions before index `upToIndex` (exclusive). */
export function medianPrev(
  sessions: ComparableSession[],
  upToIndex: number,
  n = DROP_MEDIAN_WINDOW,
): number | null {
  return median(
    sessions.slice(Math.max(0, upToIndex - n), upToIndex).map((s) => s.e1rm),
  );
}

export type DropResult = {
  kind: "none" | "bad_day" | "drop";
  /** Signed % of the latest vs the median (negative = below). */
  pctVsMedian: number | null;
  baselineMedian: number | null;
  /** Prior sessions still needed before a drop can be judged. */
  needed?: number;
};

/**
 * C2c-drop: latest comparable session vs the median of the previous 6 (all
 * prior if fewer; skipped under 3). 10% or less below = bad day; MORE than 10%
 * below = drop. The compare is exact (cross-multiplied), never a float percent.
 */
export function singleSessionDrop(window: ComparableSession[]): DropResult {
  if (window.length === 0)
    return { kind: "none", pctVsMedian: null, baselineMedian: null };
  const idx = window.length - 1;
  if (idx < DROP_MIN_PRIOR)
    return {
      kind: "none",
      pctVsMedian: null,
      baselineMedian: null,
      needed: DROP_MIN_PRIOR - idx,
    };
  const base = medianPrev(window, idx) as number;
  const latest = window[idx].e1rm;
  const pct = base ? ((latest - base) / base) * 100 : 0;
  // drop iff latest < 0.9 * base, i.e. strictly more than 10% below.
  const kind: DropResult["kind"] =
    latest * 10 < base * 9 ? "drop" : latest < base ? "bad_day" : "none";
  return { kind, pctVsMedian: pct, baselineMedian: base };
}

export type StallResult = {
  status: "not_evaluated" | "progressing" | "stalled" | "pending";
  sessionsCounted: number;
  sessionsNeeded?: number;
  /** Best e1RM before the last-6 window (display-rounded to 0.5 kg). */
  priorBest: number | null;
  /** Best confirmed e1RM inside the window. */
  windowBest: number | null;
};

const r = roundE1rmDisplay;

/**
 * C2c-stall. Needs 7+ comparable sessions. Compares the best of the last 6 with
 * the best before them. A new best counts at any size, but only if it is matched
 * or beaten in a later comparable session (one-off spikes do not count); a new
 * best in the latest session is `pending` until the next session. No new best =
 * stalled. Compared at 0.5 kg display precision.
 */
export function stallStatus(window: ComparableSession[]): StallResult {
  const n = window.length;
  if (n < STALL_MIN_SESSIONS)
    return {
      status: "not_evaluated",
      sessionsCounted: n,
      sessionsNeeded: STALL_MIN_SESSIONS - n,
      priorBest: null,
      windowBest: null,
    };
  const recentStart = n - STALL_WINDOW;
  const priorBest = Math.max(
    ...window.slice(0, recentStart).map((s) => r(s.e1rm)),
  );
  let confirmedBest: number | null = null;
  let pendingNewBest = false;
  for (let i = recentStart; i < n; i++) {
    const v = r(window[i].e1rm);
    if (v <= priorBest) continue;
    if (i === n - 1) {
      pendingNewBest = true;
      continue;
    }
    let matched = false;
    for (let j = i + 1; j < n; j++) {
      if (r(window[j].e1rm) >= v) {
        matched = true;
        break;
      }
    }
    if (matched && (confirmedBest === null || v > confirmedBest))
      confirmedBest = v;
  }
  if (confirmedBest !== null)
    return {
      status: "progressing",
      sessionsCounted: n,
      priorBest,
      windowBest: confirmedBest,
    };
  if (pendingNewBest)
    return {
      status: "pending",
      sessionsCounted: n,
      priorBest,
      windowBest: null,
    };
  return {
    status: "stalled",
    sessionsCounted: n,
    priorBest,
    windowBest: null,
  };
}

export type LiftState =
  | "insufficient"
  | "progressing"
  | "holding"
  | "stalled"
  | "dropped"
  | "restart";

export type LiftStatus = {
  state: LiftState;
  /** Comparable sessions in the current window. */
  n: number;
  needed: typeof STALL_MIN_SESSIONS;
  baselineMedian: number | null;
  /** Latest vs baseline median, % (signed). */
  deltaPct: number | null;
  /** Inside the 10% noise band: render neutral, never green or red. */
  withinNoise: boolean;
  /** Always true while the 7/6 rule is untested on real logs. */
  beta: true;
  stall: StallResult;
  drop: DropResult;
};

/**
 * One verdict for a lift's history (C2c-stall / -drop / -reset / -noise):
 *  restart      a break (14+ d) or target change just reset the window and fewer
 *               than 4 comparable sessions have happened since
 *  stalled      7+ and no confirmed new best in the last 6 (wins over dropped,
 *               Rule precedence "Stall plus drop")
 *  dropped      latest session more than 10% below the previous-6 median
 *  insufficient fewer than 7 comparable sessions
 *  progressing  7+ and a confirmed new best in the last 6
 *  holding      7+ and the only new best is in the latest session (unconfirmed)
 */
export function liftStatus(history: ComparableSession[]): LiftStatus {
  const { window, reset } = windowAfterBreak(history);
  const drop = singleSessionDrop(window);
  const stall = stallStatus(window);
  const n = window.length;
  const deltaPct = drop.pctVsMedian;
  const withinNoise =
    deltaPct == null ? true : Math.abs(deltaPct) <= NOISE_BAND * 100;
  let state: LiftState;
  if (reset !== "none" && n < DROP_MIN_PRIOR + 1) state = "restart";
  else if (stall.status === "stalled")
    state = "stalled"; // stall + drop => stall response (precedence)
  else if (drop.kind === "drop") state = "dropped";
  else if (stall.status === "not_evaluated") state = "insufficient";
  else if (stall.status === "progressing") state = "progressing";
  else state = "holding";
  return {
    state,
    n,
    needed: STALL_MIN_SESSIONS,
    baselineMedian: drop.baselineMedian,
    deltaPct,
    withinNoise,
    beta: true,
    stall,
    drop,
  };
}
