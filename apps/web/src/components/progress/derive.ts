// Pure derivations behind the Progress tab, Lift page and History rows (J8).
// Rule IDs: C2c-e1rm (Brzycki+RIR, <=10 total reps), C2c-noise/-stall/-drop/
// -reset (liftStatus), R6/R7 (fractional hard sets, rolling 7 days), R11 (RIR is
// an estimate, coverage shown), C17 (7-day bodyweight average, 4+ entries).
// No React, no DOM: unit-tested in derive.test.ts.
import {
  type BwEntry,
  type ComparableSession,
  creditsFor,
  e1rmOfSet,
  fractionalHardSets,
  type HardSetBlock,
  hardSetCount,
  type LiftStatus,
  liftStatus,
  type MuscleByExercise,
  median,
  type RecordsSessionInput,
  type RecordsSetInput,
  rirMidpoint,
  roundE1rmDisplay,
  STALL_MIN_SESSIONS,
  sessionE1rm,
} from "@frog/core";

const DAY = 86_400_000;

export type ProgressScope = "all" | "90d" | "30d" | "last";
export const PROGRESS_SCOPES: { value: ProgressScope; label: string }[] = [
  { value: "all", label: "All" },
  { value: "90d", label: "90 d" },
  { value: "30d", label: "30 d" },
  { value: "last", label: "Last" },
];

/** Sessions inside a scope ("last" = the most recent session only). */
export function scopeSessions(
  history: RecordsSessionInput[],
  scope: ProgressScope,
  now: number,
): RecordsSessionInput[] {
  const sorted = [...history].sort((a, b) => a.startedAt - b.startedAt);
  if (scope === "last") return sorted.slice(-1);
  if (scope === "all") return sorted;
  const from = now - (scope === "90d" ? 90 : 30) * DAY;
  return sorted.filter((s) => s.startedAt >= from);
}

/** Working (non-warm-up) sets of one exercise in one session. Warm-ups never feed e1RM (C2c-e1rm, R17b). */
function workingSets(
  s: RecordsSessionInput,
  exerciseId: string,
): RecordsSetInput[] {
  const out: RecordsSetInput[] = [];
  for (const b of s.exercises)
    if (b.exerciseId === exerciseId)
      for (const set of b.sets) if (set.setType !== "warmup") out.push(set);
  return out;
}

export type LiftSeries = {
  exerciseId: string;
  /** One point per session with an estimable top set, unrounded e1RM. */
  points: ComparableSession[];
  /** Sessions with working sets of this lift. */
  sessionsLogged: number;
  /** Sets refused for exceeding 10 total reps ("not used for estimate"). */
  flaggedSets: {
    sessionId: string;
    at: number;
    weightKg: number;
    reps: number;
    totalReps: number;
  }[];
  /** Working sets with no RIR logged (assumed 0, a lower bound). */
  noRirSets: number;
};

/** C2c-e1rm series for one lift over the whole history. */
export function liftSeries(
  history: RecordsSessionInput[],
  exerciseId: string,
): LiftSeries {
  const points: ComparableSession[] = [];
  const flaggedSets: LiftSeries["flaggedSets"] = [];
  let sessionsLogged = 0;
  let noRirSets = 0;
  for (const s of [...history].sort((a, b) => a.startedAt - b.startedAt)) {
    const sets = workingSets(s, exerciseId);
    if (!sets.length) continue;
    sessionsLogged += 1;
    const es = sets.map((x) => e1rmOfSet(x));
    for (let i = 0; i < es.length; i++) {
      const e = es[i];
      if (e.flagged && e.weightKg != null)
        flaggedSets.push({
          sessionId: s.sessionId,
          at: s.startedAt,
          weightKg: e.weightKg,
          reps: sets[i].reps ?? 0,
          totalReps: e.totalReps ?? 0,
        });
      if (e.noRir && e.value != null) noRirSets += 1;
    }
    const top = sessionE1rm(es);
    if (top != null)
      points.push({ sessionId: s.sessionId, at: s.startedAt, e1rm: top });
  }
  return { exerciseId, points, sessionsLogged, flaggedSets, noRirSets };
}

export type LiftVerdict =
  | { kind: "not_estimable"; note: string }
  | { kind: "none"; note: string }
  | { kind: "status"; status: LiftStatus; rough: boolean };

export const NOT_ESTIMABLE_NOTE =
  "strength estimate needs 10 or fewer total reps";

/** One verdict per lift. Lifts logged only above 10 total reps stay visible. */
export function liftVerdict(series: LiftSeries): LiftVerdict {
  if (series.points.length === 0) {
    if (series.flaggedSets.length > 0)
      return { kind: "not_estimable", note: NOT_ESTIMABLE_NOTE };
    return { kind: "none", note: "no estimable sets yet" };
  }
  const status = liftStatus(series.points);
  // Before 7 comparable sessions the verdict is rough (C2c-stall).
  return { kind: "status", status, rough: status.n < STALL_MIN_SESSIONS };
}

export const STATE_WORD: Record<LiftStatus["state"], string> = {
  insufficient: "Not enough yet",
  progressing: "Progressing",
  holding: "Holding",
  stalled: "Stalled",
  dropped: "Dropped",
  restart: "Restarting",
};

/** Short pill text for a verdict; rough reads as rough. */
export function verdictWord(v: LiftVerdict): string {
  if (v.kind === "not_estimable") return "No estimate";
  if (v.kind === "none") return "No data";
  if (v.rough)
    return v.status.state === "restart"
      ? "Restarting"
      : `Rough: ${v.status.n} of ${STALL_MIN_SESSIONS}`;
  return STATE_WORD[v.status.state];
}

/** Last-6 vs the median band for the BandChart (C2c-noise 10%). */
export function noiseBand(
  points: ComparableSession[],
): { lo: number; hi: number } | null {
  if (points.length < 3) return null;
  const m = median(points.slice(-7, -1).map((p) => p.e1rm));
  if (m == null) return null;
  return { lo: m * 0.9, hi: m * 1.1 };
}

/** Self-percentile of the latest top set against the last 52 weeks; needs 20 sessions. */
export function selfPercentile(
  points: ComparableSession[],
  now: number,
): number | null {
  const recent = points.filter((p) => p.at >= now - 364 * DAY);
  if (recent.length < 20) return null;
  const latest = recent[recent.length - 1].e1rm;
  const atOrBelow = recent.filter((p) => p.e1rm <= latest).length;
  return Math.round((atOrBelow / recent.length) * 100);
}

export const displayE1rm = roundE1rmDisplay;

// ── Volume (F3) ─────────────────────────────────────────────────────────────
export type VolumeWindow = "7d" | "prev7d" | "4wk";

export type MuscleRow = {
  muscle: string;
  /** Fractional hard sets in the window (4wk = weekly average). */
  total: number;
  direct: number;
  indirect: number;
  noRirCount: number;
};

function blocksIn(
  history: RecordsSessionInput[],
  muscles: MuscleByExercise,
  from: number,
  to: number,
): HardSetBlock[] {
  const out: HardSetBlock[] = [];
  for (const s of history) {
    if (s.startedAt < from || s.startedAt >= to) continue;
    for (const b of s.exercises)
      out.push({ targets: muscles.get(b.exerciseId)?.targets, sets: b.sets });
  }
  return out;
}

/** Rolling window in fractional hard sets per muscle (R6/R7, warm-ups never count). */
export function volumeRows(
  history: RecordsSessionInput[],
  muscles: MuscleByExercise,
  window: VolumeWindow,
  now: number,
  rirMax?: number,
): {
  rows: MuscleRow[];
  hardSets: number;
  noRirSets: number;
  unmapped: number;
} {
  const [from, to, div] =
    window === "7d"
      ? [now - 7 * DAY, now + 1, 1]
      : window === "prev7d"
        ? [now - 14 * DAY, now - 7 * DAY, 1]
        : [now - 28 * DAY, now + 1, 4];
  const r = fractionalHardSets(blocksIn(history, muscles, from, to), {
    rirMax,
  });
  return {
    rows: r.muscles.map((m) => ({
      muscle: m.muscle,
      total: m.total / div,
      direct: m.direct / div,
      indirect: m.indirect / div,
      noRirCount: m.noRirCount / div,
    })),
    hardSets: r.hardSets / div,
    noRirSets: r.noRirSets / div,
    unmapped: r.unmapped / div,
  };
}

export type Contribution = {
  exerciseId: string;
  kind: "direct" | "indirect";
  /** Credit-weighted hard sets this exercise gave the muscle. */
  sets: number;
};

/** Which exercises fed one muscle's count in the window (the tap-through sheet). */
export function muscleContributions(
  history: RecordsSessionInput[],
  muscles: MuscleByExercise,
  muscle: string,
  window: VolumeWindow,
  now: number,
  rirMax?: number,
): Contribution[] {
  const [from, to] =
    window === "7d"
      ? [now - 7 * DAY, now + 1]
      : window === "prev7d"
        ? [now - 14 * DAY, now - 7 * DAY]
        : [now - 28 * DAY, now + 1];
  const by = new Map<string, Contribution>();
  for (const s of history) {
    if (s.startedAt < from || s.startedAt >= to) continue;
    for (const b of s.exercises) {
      const credit = creditsFor(muscles.get(b.exerciseId)?.targets).find(
        (c) => c.muscle === muscle,
      );
      if (!credit) continue;
      const hard = hardSetCount(b.sets, { rirMax }).hard;
      if (!hard) continue;
      const cur = by.get(b.exerciseId) ?? {
        exerciseId: b.exerciseId,
        kind: credit.kind,
        sets: 0,
      };
      cur.sets += hard * credit.credit;
      by.set(b.exerciseId, cur);
    }
  }
  return [...by.values()].sort((a, b) => b.sets - a.sets);
}

/** Sessions started inside [from, to). */
export function sessionCount(
  history: RecordsSessionInput[],
  from: number,
  to: number,
): number {
  return history.filter((s) => s.startedAt >= from && s.startedAt < to).length;
}

// ── Effort (R11) ────────────────────────────────────────────────────────────
/** Share of working sets with a logged RIR/RPE in a scope, 0..1, plus n. */
export function rirCoverage(sessions: RecordsSessionInput[]): {
  coverage: number | null;
  n: number;
} {
  let n = 0;
  let logged = 0;
  for (const s of sessions)
    for (const b of s.exercises)
      for (const set of b.sets) {
        if (set.setType === "warmup" || set.weightKg == null) continue;
        n += 1;
        if (rirMidpoint(set) != null) logged += 1;
      }
  return { coverage: n ? logged / n : null, n };
}

/** Per lift: RIR of the last two working sets of the latest session vs the one before. */
export function lastRirs(
  history: RecordsSessionInput[],
  exerciseId: string,
  take = 6,
): (number | null)[] {
  const out: (number | null)[] = [];
  for (const s of [...history].sort((a, b) => a.startedAt - b.startedAt)) {
    const sets = workingSets(s, exerciseId);
    if (!sets.length) continue;
    const mids = sets
      .map((x) => rirMidpoint(x))
      .filter((x): x is number => x != null);
    out.push(mids.length ? mids[mids.length - 1] : null);
  }
  return out.slice(-take);
}

// ── Body (C17) ──────────────────────────────────────────────────────────────
export function bodyweightEntries(
  ms: { measuredOn: string; bodyweightKg: number | null }[],
): BwEntry[] {
  const out: BwEntry[] = [];
  for (const m of ms)
    if (m.bodyweightKg != null) {
      const at = new Date(`${m.measuredOn}T12:00:00`).getTime();
      if (Number.isFinite(at)) out.push({ at, kg: m.bodyweightKg });
    }
  return out.sort((a, b) => a.at - b.at);
}

// ── History rows (F9) ───────────────────────────────────────────────────────
export type SessionSummary = {
  sessionId: string;
  hardSets: number;
  /** Mean RIR of working sets with RIR logged; null if none. */
  rirAvg: number | null;
  /** Top-set e1RM (display-rounded) of the headline lift and its % vs the previous session of that lift. */
  headline: {
    exerciseId: string;
    e1rm: number;
    deltaPct: number | null;
  } | null;
  exerciseIds: string[];
};

export function summarizeSessions(
  history: RecordsSessionInput[],
  rirMax?: number,
): Map<string, SessionSummary> {
  const out = new Map<string, SessionSummary>();
  const prev = new Map<string, number>();
  for (const s of [...history].sort((a, b) => a.startedAt - b.startedAt)) {
    let hardSets = 0;
    const mids: number[] = [];
    let headline: SessionSummary["headline"] = null;
    let bestSets = -1;
    for (const b of s.exercises) {
      const work = b.sets.filter((x) => x.setType !== "warmup");
      hardSets += hardSetCount(b.sets, { rirMax }).hard;
      for (const x of work) {
        const m = rirMidpoint(x);
        if (m != null) mids.push(m);
      }
      const top = sessionE1rm(work.map((x) => e1rmOfSet(x)));
      if (top == null) continue;
      const before = prev.get(b.exerciseId);
      prev.set(b.exerciseId, top);
      // Headline = the lift with the most working sets that has an estimate.
      if (work.length > bestSets) {
        bestSets = work.length;
        headline = {
          exerciseId: b.exerciseId,
          e1rm: roundE1rmDisplay(top),
          deltaPct: before ? ((top - before) / before) * 100 : null,
        };
      }
    }
    out.set(s.sessionId, {
      sessionId: s.sessionId,
      hardSets,
      rirAvg: mids.length
        ? mids.reduce((a, x) => a + x, 0) / mids.length
        : null,
      headline,
      exerciseIds: s.exercises.map((e) => e.exerciseId),
    });
  }
  return out;
}
