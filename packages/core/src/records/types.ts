// Records/PR engine types (Hevy-parity plan §B/§C). Computed client-side from
// a full-history fetch (findingsData pattern) — never stored server-side.

export type PrType =
  | "heaviest_weight" // max load (added weight for weighted_bodyweight)
  | "best_e1rm" // highest estimated 1RM (weight_reps only)
  | "best_set_volume" // max weight × reps for one set
  | "best_session_volume" // max Σ(weight × reps) in one session
  | "best_set_reps" // most reps in a set (bodyweight/assisted)
  | "best_session_reps" // most reps in a session (bodyweight/assisted)
  | "best_time" // longest duration
  | "longest_distance"
  | "best_pace"; // fastest m/s over a set

export const PR_TYPE_LABELS: Record<PrType, string> = {
  heaviest_weight: "Heaviest weight",
  best_e1rm: "Best 1RM (est.)",
  best_set_volume: "Best set volume",
  best_session_volume: "Best session volume",
  best_set_reps: "Most reps (set)",
  best_session_reps: "Most reps (session)",
  best_time: "Best time",
  longest_distance: "Longest distance",
  best_pace: "Best pace",
};

export type RecordEntry = {
  prType: PrType;
  value: number;
  sessionId: string;
  at: number; // session startedAt (ms)
};

export type PrEvent = RecordEntry & {
  exerciseId: string;
  previous: number | null;
};

export type ExerciseRecords = {
  exerciseId: string;
  bests: Partial<Record<PrType, RecordEntry>>;
  /** Set records: heaviest weight per exact rep count (weighted types only). */
  setRecords: Map<number, { weightKg: number; sessionId: string; at: number }>;
  /** Top 3 all-time set values, for types with no weight-keyed set-records
   * table (reps-only, duration, distance) — e.g. best pull-up sets, plank
   * holds, or run distances, ranked descending. */
  topRecords: Array<{ value: number; sessionId: string; at: number }>;
};

export type RecordsSetInput = {
  setType: string;
  weightKg: number | null;
  reps: number | null;
  durationSec: number | null;
  distanceM: number | null;
  rir?: number | null;
  rirMin?: number | null;
  rirMax?: number | null;
  rpe?: number | null;
};

export type RecordsSessionInput = {
  sessionId: string;
  startedAt: number;
  /** Present when fetched via recordsData; stats totals use them. */
  endedAt?: number | null;
  pausedMs?: number;
  exercises: Array<{
    exerciseId: string;
    exerciseType: string;
    sets: RecordsSetInput[];
  }>;
};
