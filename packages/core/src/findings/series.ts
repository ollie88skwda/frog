import { e1rmSet, sessionE1rm } from "../domain/e1rm";
import type { SessionTop } from "../domain/progression";
import { rirRange } from "../domain/rir";
import type { ComparableSession } from "../domain/stall";
import type { FindingsSessionInput } from "./types";

const DAY_MS = 86_400_000;

export type ExerciseSeries = {
  name: string;
  tops: SessionTop[];
  /** Same sessions as `tops`, shaped for domain/stall.ts. Without a target
   * snapshot (J2) rep range / equipment are unknown, so only the break reset
   * applies (degraded mode, COACH-LOGIC "Comparable session"). */
  comparable: ComparableSession[];
};

/** Best (top-set) e1RM per exercise per session. C2c-e1rm: Brzycki with RIR over
 * WORKING sets only (warm-ups never), sets over 10 total reps are refused. This
 * replaces the Epley baseline of the 2026-07-13 "don't change the trend
 * baseline" decision (superseded, docs/DECISIONS.md). */
export function sessionTopsByExercise(
  sessions: FindingsSessionInput[],
): Map<string, ExerciseSeries> {
  const byExercise = new Map<string, ExerciseSeries>();
  for (const session of [...sessions].sort(
    (a, b) => a.startedAt - b.startedAt,
  )) {
    const perExercise = new Map<
      string,
      { name: string; sets: ReturnType<typeof e1rmSet>[] }
    >();
    for (const set of session.sets) {
      if (set.setType === "warmup") continue;
      const e = e1rmSet(set.weightKg, set.reps, set);
      const cur = perExercise.get(set.exerciseId) ?? {
        name: set.exerciseName,
        sets: [],
      };
      cur.sets.push(e);
      perExercise.set(set.exerciseId, cur);
    }
    for (const [exerciseId, { name, sets }] of perExercise) {
      const e1rm = sessionE1rm(sets);
      if (e1rm == null) continue;
      const entry = byExercise.get(exerciseId) ?? {
        name,
        tops: [],
        comparable: [],
      };
      entry.tops.push({ day: session.startedAt / DAY_MS, e1rm });
      entry.comparable.push({
        sessionId: session.sessionId,
        at: session.startedAt,
        e1rm,
      });
      byExercise.set(exerciseId, entry);
    }
  }
  return byExercise;
}

export type VolumePoint = { day: number; kg: number };

/** Per-session total volume (Σ weight×reps) per exercise, warm-up sets
 * excluded — the volume story that backs the plateau "change volume"
 * recommendation. Deliberately narrower than the trend baseline (which keeps
 * warm-ups): captain decision 2026-08-08 — new recommendation stats exclude
 * warm-ups, the trend baseline is untouched. */
export function sessionVolumeByExercise(
  sessions: FindingsSessionInput[],
): Map<string, { name: string; points: VolumePoint[] }> {
  const byExercise = new Map<string, { name: string; points: VolumePoint[] }>();
  for (const session of [...sessions].sort(
    (a, b) => a.startedAt - b.startedAt,
  )) {
    const perExercise = new Map<string, { name: string; kg: number }>();
    for (const set of session.sets) {
      if (set.setType === "warmup") continue;
      if (set.weightKg == null || set.reps == null) continue;
      const cur = perExercise.get(set.exerciseId) ?? {
        name: set.exerciseName,
        kg: 0,
      };
      cur.kg += set.weightKg * set.reps;
      perExercise.set(set.exerciseId, cur);
    }
    for (const [exerciseId, { name, kg }] of perExercise) {
      const entry = byExercise.get(exerciseId) ?? { name, points: [] };
      entry.points.push({ day: session.startedAt / DAY_MS, kg });
      byExercise.set(exerciseId, entry);
    }
  }
  return byExercise;
}

export type RirStats = {
  /** Sessions with ≥1 RIR-logged work set (denominator for coverage). */
  logged: number;
  /** Sessions with ≥1 work set (non-warm-up). */
  total: number;
  /** logged / total, 0..1. */
  coverage: number;
  /** Median of per-session RIR medians; null when logged < RIR_SESSIONS_MIN. */
  medianRir: number | null;
};

function median(xs: number[]): number {
  if (xs.length === 0) return Number.NaN;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** Per-exercise RIR summary over the same sessions that produced the trend:
 * per-set RIR is the rirRange midpoint (legacy scalar = zero-width range), a
 * session's value is the median over its work sets, and the reported median
 * is the median of those session values. A unilateral pair's two rows share
 * one set_no, but the findings input deliberately has no side field
 * (DECISIONS 2026-08-01) — both rows carry the same RIR at commit, so no
 * pair-collapse is needed here. */
export function rirStatsByExercise(
  sessions: FindingsSessionInput[],
  exerciseId: string,
): RirStats {
  const sessionMedians: number[] = [];
  let total = 0;
  for (const session of sessions) {
    const values: number[] = [];
    let hasWork = false;
    for (const set of session.sets) {
      if (set.exerciseId !== exerciseId) continue;
      if (set.setType === "warmup") continue;
      hasWork = true;
      const range = rirRange({
        rir: set.rir,
        rirMin: set.rirMin ?? null,
        rirMax: set.rirMax ?? null,
      });
      if (range) values.push((range.min + range.max) / 2);
    }
    if (!hasWork) continue;
    total += 1;
    if (values.length > 0) sessionMedians.push(median(values));
  }
  return {
    logged: sessionMedians.length,
    total,
    coverage: total > 0 ? sessionMedians.length / total : 0,
    medianRir:
      sessionMedians.length >= RIR_SESSIONS_MIN ? median(sessionMedians) : null,
  };
}

/** Min RIR-logged sessions before a median RIR is reported. */
export const RIR_SESSIONS_MIN = 3;
