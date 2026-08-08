import { epley } from "../domain/e1rm";
import type { SessionTop } from "../domain/progression";
import { rirRange } from "../domain/rir";
import type { FindingsSessionInput } from "./types";

const DAY_MS = 86_400_000;

export type ExerciseSeries = {
  name: string;
  tops: SessionTop[];
};

/** Best (top-set) e1RM per exercise per session — the exact series the trend
 * verdicts are fit over (raw Epley; same baseline as always, warm-ups
 * included, per the 2026-07-13 "don't change the trend baseline" decision). */
export function sessionTopsByExercise(
  sessions: FindingsSessionInput[],
): Map<string, ExerciseSeries> {
  const byExercise = new Map<string, ExerciseSeries>();
  for (const session of [...sessions].sort(
    (a, b) => a.startedAt - b.startedAt,
  )) {
    const best = new Map<string, { name: string; e1rm: number }>();
    for (const set of session.sets) {
      if (set.weightKg == null || set.reps == null || set.reps <= 0) continue;
      const e1 = epley(set.weightKg, set.reps);
      if (e1 == null) continue;
      const cur = best.get(set.exerciseId);
      if (!cur || e1 > cur.e1rm)
        best.set(set.exerciseId, { name: set.exerciseName, e1rm: e1 });
    }
    for (const [exerciseId, { name, e1rm }] of best) {
      const entry = byExercise.get(exerciseId) ?? { name, tops: [] };
      entry.tops.push({ day: session.startedAt / DAY_MS, e1rm });
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
