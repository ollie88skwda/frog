import type {
  ApiToken,
  Exercise,
  ExerciseFavorite,
  Machine,
  MachineSetting,
  Metric,
  Session,
  SessionExercise,
  SetLog,
  TrackedCondition,
} from "../db/schema";
import type { MuscleTarget } from "../domain/anatomy";
import type { FindingsSessionInput } from "../findings/types";
import type { ImportedSession, ImportResult } from "../import/types";

export type ExportBundle = {
  schemaVersion: number;
  exportedAt: number;
  exercises: Exercise[];
  machines: Machine[]; // photos not included in v1 exports
  metrics: Metric[];
  sessions: Session[];
  sessionExercises: SessionExercise[];
  setLogs: SetLog[];
};

export type CreatedApiToken = { token: string; row: ApiToken };

export type NewSetInput = {
  weightKg: number | null;
  reps: number | null;
  rir?: number | null;
  rpe?: number | null;
  note?: string | null;
  /** Seconds rested before this set (time since the previous set committed). */
  restSec?: number | null;
  metricValues?: Record<string, unknown> | null;
};

export type MetricType = "number" | "scale" | "text" | "checkbox";

export type NewMetricInput = {
  name: string;
  type: MetricType;
  scope: "set" | "session";
  /** Optional display unit for number metrics (kg, mg, g, h…). */
  unit?: string | null;
};

export type GhostSet = { weightKg: number | null; reps: number | null };

export type NewMachineInput = {
  name: string;
  brand?: string | null;
  catalogKey?: string | null;
  settings?: MachineSetting[] | null;
  notes?: string | null;
};

export type MachinePatch = Partial<NewMachineInput>;

export type NewExerciseOpts = {
  jointActions?: string[] | null;
  muscleTargets?: MuscleTarget[] | null;
  machineId?: string | null;
};

export type ExerciseClassification = {
  jointActions?: string[] | null;
  muscleTargets?: MuscleTarget[] | null;
};

export type LoggedSet = {
  id: string;
  setNo: number;
  weightKg: number | null;
  reps: number | null;
  rir: number | null;
  rpe: number | null;
  note: string | null;
  restSec: number | null;
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
  createExercise(name: string, opts?: NewExerciseOpts): Promise<Exercise>;
  listExercises(): Promise<Exercise[]>;

  // Machines: the user's gym equipment — settings entered once, shown in
  // every session (setup memory). No seed machines; all rows owner-scoped.
  listMachines(): Promise<Machine[]>;
  createMachine(input: NewMachineInput): Promise<Machine>;
  /** Partial update; `settings` replaces the whole array when provided. */
  updateMachine(id: string, patch: MachinePatch): Promise<void>;
  /** Soft delete + detaches the owner's exercises referencing it. */
  deleteMachine(id: string): Promise<void>;
  /** Custom exercises only (seeds read-only under RLS). null detaches. */
  setExerciseMachine(
    exerciseId: string,
    machineId: string | null,
  ): Promise<void>;
  /** Joint actions + muscle targets (custom exercises only). */
  setExerciseClassification(
    exerciseId: string,
    classification: ExerciseClassification,
  ): Promise<void>;
  /** Uploads the user's own photo (already resized) and stores its path. */
  uploadMachinePhoto(machineId: string, file: Blob): Promise<void>;
  /** Short-lived signed URL for the machine's photo, or null if none. */
  machinePhotoUrl(machine: Machine): Promise<string | null>;

  startSession(title?: string): Promise<Session>;
  /** Stamps ended_at. Active session = ended_at null. */
  endSession(sessionId: string): Promise<void>;
  /** Backdate/correct a session's start time (ms epoch). */
  updateSessionStartedAt(sessionId: string, startedAt: number): Promise<void>;
  /** Newest open session (ended_at null), if any. */
  activeSession(): Promise<Session | null>;
  addExerciseToSession(sessionId: string, exerciseId: string): Promise<string>;
  logSet(sessionExerciseId: string, set: NewSetInput): Promise<string>;
  /** Partial update — only provided fields are written (others preserved). */
  updateSet(setId: string, patch: Partial<NewSetInput>): Promise<void>;

  // All deletes are soft (deleted_at) — nothing is ever hard-deleted.
  deleteSet(setId: string): Promise<void>;
  deleteSessionExercise(id: string): Promise<void>;
  deleteExercise(id: string): Promise<void>;
  deleteMetric(id: string): Promise<void>;
  deleteSession(id: string): Promise<void>;

  /** Light tagging (custom exercises; seeds are read-only under RLS). */
  setExerciseTags(exerciseId: string, tags: string[]): Promise<void>;

  /**
   * Bulk history import (Hevy etc.): find-or-create exercises by name,
   * batched inserts, idempotent — sessions whose started_at already exists
   * are skipped.
   */
  importSessions(sessions: ImportedSession[]): Promise<ImportResult>;

  /**
   * Fills the seeded Sleep (h) condition on sessions whose local start date
   * matches; never overwrites an existing value. Returns sessions filled.
   */
  applySleep(sleepHoursByDate: Map<string, number>): Promise<number>;

  /** Exercises + logged sets of one session, in order (restores an open session). */
  listSessionExercises(sessionId: string): Promise<SessionExerciseDetail[]>;

  getSession(sessionId: string): Promise<Session | null>;
  /** Replaces the session's condition values ({metricId: value}). */
  updateSessionConditions(
    sessionId: string,
    values: Record<string, unknown>,
  ): Promise<void>;
  /** Sets the session's freeform notes (null clears them). */
  updateSessionNotes(sessionId: string, notes: string | null): Promise<void>;

  /** Newest-first page of sessions (history). */
  listSessions(limit: number, offset: number): Promise<Session[]>;

  /** Full session graph shaped for the findings engine (client-side compute). */
  findingsData(): Promise<FindingsSessionInput[]>;

  listMetrics(): Promise<Metric[]>;
  createMetric(input: NewMetricInput): Promise<Metric>;
  /** Which exercises a set-scope metric is enabled for (stored on the metric row). */
  setMetricExercises(metricId: string, exerciseIds: string[]): Promise<void>;

  // Tracked conditions: the user's "experiment variables" pre-loaded into every
  // session. A row is an explicit choice; absence = use the default set.
  listTrackedConditions(): Promise<TrackedCondition[]>;
  /** Track (true) or hide (false) a condition going forward. Upserts one row. */
  setConditionTracked(metricId: string, tracked: boolean): Promise<void>;

  /** Full user data graph (RLS-scoped), for JSON/CSV export. */
  exportAll(): Promise<ExportBundle>;

  listApiTokens(): Promise<ApiToken[]>;
  /** Returns the plaintext token exactly once; only its sha256 is stored. */
  createApiToken(name: string): Promise<CreatedApiToken>;
  revokeApiToken(id: string): Promise<void>;

  /**
   * Most recent PRIOR session's sets for an exercise (ghost prefill).
   * Pass the current session-exercise id to exclude the one being logged now.
   */
  lastSetsForExercise(
    exerciseId: string,
    excludeSessionExerciseId?: string,
  ): Promise<GhostSet[]>;

  // Favorited exercises: owner-scoped, works on shared seed rows too since
  // it's a separate table, not a column on the exercise row.
  listExerciseFavorites(): Promise<ExerciseFavorite[]>;
  /** Favorite (true) or unfavorite (false) an exercise. Upserts one row. */
  setExerciseFavorite(exerciseId: string, favorite: boolean): Promise<void>;
}
