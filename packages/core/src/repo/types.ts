import type { Exercise, Metric, Session } from "../db/schema";

export type NewSetInput = {
  weightKg: number | null;
  reps: number | null;
  rir?: number | null;
  note?: string | null;
  metricValues?: Record<string, unknown> | null;
};

export type NewMetricInput = {
  name: string;
  type: "number" | "scale" | "text" | "checkbox";
  scope: "set" | "session";
};

export type GhostSet = { weightKg: number | null; reps: number | null };

export type LoggedSet = {
  id: string;
  setNo: number;
  weightKg: number | null;
  reps: number | null;
  rir: number | null;
  note: string | null;
};

export type SessionExerciseDetail = {
  id: string;
  exerciseId: string;
  exerciseName: string;
  orderIndex: number;
  sets: LoggedSet[];
};

/**
 * All data access goes through this interface — screens never touch a client
 * directly. SupabaseRepo is the v1 (online-first) implementation; a future
 * mobile/offline SqliteRepo slots in behind the same seam.
 */
export interface Repo {
  createExercise(name: string): Promise<Exercise>;
  listExercises(): Promise<Exercise[]>;

  startSession(title?: string): Promise<Session>;
  addExerciseToSession(sessionId: string, exerciseId: string): Promise<string>;
  logSet(sessionExerciseId: string, set: NewSetInput): Promise<string>;

  /** Exercises + logged sets of one session, in order (restores an open session). */
  listSessionExercises(sessionId: string): Promise<SessionExerciseDetail[]>;

  getSession(sessionId: string): Promise<Session | null>;
  /** Merge-writes session condition values ({metricId: value}). */
  updateSessionConditions(
    sessionId: string,
    values: Record<string, unknown>,
  ): Promise<void>;

  listMetrics(): Promise<Metric[]>;
  createMetric(input: NewMetricInput): Promise<Metric>;
  /** Which exercises a set-scope metric is enabled for (stored on the metric row). */
  setMetricExercises(metricId: string, exerciseIds: string[]): Promise<void>;

  /**
   * Most recent PRIOR session's sets for an exercise (ghost prefill).
   * Pass the current session-exercise id to exclude the one being logged now.
   */
  lastSetsForExercise(
    exerciseId: string,
    excludeSessionExerciseId?: string,
  ): Promise<GhostSet[]>;
}
