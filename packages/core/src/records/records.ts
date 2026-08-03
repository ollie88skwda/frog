// PR taxonomy engine: which record types apply per exercise type, and a full
// recompute over history. Rules (plan §B global rules): first-ever log never
// PRs (nothing to compare), ties never PR, warm-ups excluded when the
// include-warmups stat toggle is off (toggling = cache invalidation +
// recompute, never a server job).

import { epley } from "../domain/e1rm";
import type {
  ExerciseRecords,
  PrEvent,
  PrType,
  RecordEntry,
  RecordsSessionInput,
  RecordsSetInput,
} from "./types";

export const PR_TYPES_BY_EXERCISE_TYPE: Record<string, PrType[]> = {
  weight_reps: [
    "heaviest_weight",
    "best_e1rm",
    "best_set_volume",
    "best_session_volume",
  ],
  bodyweight_reps: ["best_set_reps", "best_session_reps"],
  weighted_bodyweight: ["heaviest_weight", "best_set_volume"],
  // Less assistance never counts as a weight PR — reps-based only.
  assisted_bodyweight: ["best_set_reps", "best_session_reps"],
  duration: ["best_time"],
  weight_duration: ["heaviest_weight", "best_time"],
  distance_duration: ["longest_distance", "best_time", "best_pace"],
  weight_distance: ["heaviest_weight", "longest_distance"],
};

/** Whether an exercise type keeps a set-records table (weighted only). */
export function hasSetRecords(exerciseType: string): boolean {
  return (
    exerciseType === "weight_reps" || exerciseType === "weighted_bodyweight"
  );
}

/** Which PR type's value/formatting backs `ExerciseRecords.topRecords` for
 * types that don't get a weight-keyed set-records table. */
export const TOP_RECORD_PR_TYPE: Partial<Record<string, PrType>> = {
  bodyweight_reps: "best_set_reps",
  assisted_bodyweight: "best_set_reps",
  duration: "best_time",
  weight_duration: "best_time",
  distance_duration: "longest_distance",
  weight_distance: "longest_distance",
};

/** The raw per-set scalar backing a `topRecords` row (reps / seconds /
 * meters — matched to TOP_RECORD_PR_TYPE), or null if this set doesn't
 * qualify. */
export function topRecordValue(
  exerciseType: string,
  set: RecordsSetInput,
): number | null {
  const prType = TOP_RECORD_PR_TYPE[exerciseType];
  if (!prType) return null;
  return setPrCandidates(exerciseType, set)[prType] ?? null;
}

// Per-SET candidate values for each applicable PR type (session-scoped types
// are computed by the caller across the session).
export function setPrCandidates(
  exerciseType: string,
  set: RecordsSetInput,
): Partial<Record<PrType, number>> {
  const out: Partial<Record<PrType, number>> = {};
  const types = PR_TYPES_BY_EXERCISE_TYPE[exerciseType] ?? [];
  const w = set.weightKg;
  const reps = set.reps;
  for (const t of types) {
    switch (t) {
      case "heaviest_weight":
        if (w != null && w > 0) out[t] = w;
        break;
      case "best_e1rm":
        if (w != null && w > 0 && reps != null && reps >= 1) {
          const e = epley(w, reps);
          if (e != null) out[t] = e;
        }
        break;
      case "best_set_volume":
        if (w != null && w > 0 && reps != null && reps >= 1) out[t] = w * reps;
        break;
      case "best_set_reps":
        if (reps != null && reps >= 1) out[t] = reps;
        break;
      case "best_time":
        if (set.durationSec != null && set.durationSec > 0)
          out[t] = set.durationSec;
        break;
      case "longest_distance":
        if (set.distanceM != null && set.distanceM > 0) out[t] = set.distanceM;
        break;
      case "best_pace":
        if (
          set.distanceM != null &&
          set.distanceM > 0 &&
          set.durationSec != null &&
          set.durationSec > 0
        )
          out[t] = set.distanceM / set.durationSec; // m/s, higher = better
        break;
      // Session-scoped types are ignored here.
      case "best_session_volume":
      case "best_session_reps":
        break;
    }
  }
  return out;
}

export type RecordsOptions = { includeWarmups: boolean };

export type RecordsResult = {
  byExercise: Map<string, ExerciseRecords>;
  events: PrEvent[]; // chronological
};

function countsForRecords(set: RecordsSetInput, opts: RecordsOptions): boolean {
  if (!opts.includeWarmups && set.setType === "warmup") return false;
  return true;
}

/**
 * Full recompute over history (sessions in any order; sorted internally by
 * startedAt so the PR timeline is chronological).
 */
export function computeRecords(
  history: RecordsSessionInput[],
  opts: RecordsOptions = { includeWarmups: true },
): RecordsResult {
  const sorted = [...history].sort((a, b) => a.startedAt - b.startedAt);
  const byExercise = new Map<string, ExerciseRecords>();
  const events: PrEvent[] = [];

  for (const session of sorted) {
    for (const block of session.exercises) {
      let rec = byExercise.get(block.exerciseId);
      const firstEver = rec === undefined;
      if (!rec) {
        rec = {
          exerciseId: block.exerciseId,
          bests: {},
          setRecords: new Map(),
          topRecords: [],
        };
        byExercise.set(block.exerciseId, rec);
      }

      const sets = block.sets.filter((s) => countsForRecords(s, opts));

      // Set-scoped candidates: best value this session per PR type.
      const sessionBest: Partial<Record<PrType, number>> = {};
      for (const s of sets) {
        const cand = setPrCandidates(block.exerciseType, s);
        for (const [t, v] of Object.entries(cand) as [PrType, number][]) {
          if (sessionBest[t] === undefined || v > (sessionBest[t] as number))
            sessionBest[t] = v;
        }
        // Set-records table: heaviest weight per exact rep count.
        if (
          hasSetRecords(block.exerciseType) &&
          s.weightKg != null &&
          s.weightKg > 0 &&
          s.reps != null &&
          s.reps >= 1
        ) {
          const prev = rec.setRecords.get(s.reps);
          if (!prev || s.weightKg > prev.weightKg)
            rec.setRecords.set(s.reps, {
              weightKg: s.weightKg,
              sessionId: session.sessionId,
              at: session.startedAt,
            });
        } else if (!hasSetRecords(block.exerciseType)) {
          const v = topRecordValue(block.exerciseType, s);
          if (v != null && !rec.topRecords.some((t) => t.value === v)) {
            rec.topRecords.push({
              value: v,
              sessionId: session.sessionId,
              at: session.startedAt,
            });
            rec.topRecords.sort((a, b) => b.value - a.value);
            if (rec.topRecords.length > 3) rec.topRecords.length = 3;
          }
        }
      }

      // Session-scoped candidates.
      const types = PR_TYPES_BY_EXERCISE_TYPE[block.exerciseType] ?? [];
      if (types.includes("best_session_volume")) {
        const vol = sets.reduce(
          (acc, s) =>
            acc +
            (s.weightKg != null && s.reps != null ? s.weightKg * s.reps : 0),
          0,
        );
        if (vol > 0) sessionBest.best_session_volume = vol;
      }
      if (types.includes("best_session_reps")) {
        const reps = sets.reduce((acc, s) => acc + (s.reps ?? 0), 0);
        if (reps > 0) sessionBest.best_session_reps = reps;
      }

      // Update bests; the exercise's FIRST-ever session seeds baselines
      // without firing events.
      for (const [t, v] of Object.entries(sessionBest) as [PrType, number][]) {
        const prev = rec.bests[t];
        if (!prev || v > prev.value) {
          const entry: RecordEntry = {
            prType: t,
            value: v,
            sessionId: session.sessionId,
            at: session.startedAt,
          };
          if (!firstEver)
            events.push({
              ...entry,
              exerciseId: block.exerciseId,
              previous: prev ? prev.value : null,
            });
          rec.bests[t] = entry;
        }
      }
    }
  }

  return { byExercise, events };
}
