import type { Exercise, Session } from "../db/schema";

export type NewSetInput = {
  weightKg: number | null;
  reps: number | null;
  rir?: number | null;
  note?: string | null;
};

export type GhostSet = { weightKg: number | null; reps: number | null };

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

  /**
   * Most recent PRIOR session's sets for an exercise (ghost prefill).
   * Pass the current session-exercise id to exclude the one being logged now.
   */
  lastSetsForExercise(
    exerciseId: string,
    excludeSessionExerciseId?: string,
  ): Promise<GhostSet[]>;
}
