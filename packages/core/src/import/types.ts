export type ImportedSet = {
  weightKg: number | null;
  reps: number | null;
  rir: number | null;
  note: string | null;
  /** 'normal' (default) | 'warmup' | 'failure' | 'drop'. */
  setType?: string;
  /** Duration/cardio rows (Strong exports these; Hevy's are dropped). */
  durationSec?: number | null;
  distanceM?: number | null;
};

export type ImportedExercise = { name: string; sets: ImportedSet[] };

export type ImportedSession = {
  title: string | null;
  startedAt: number; // ms epoch
  endedAt: number | null;
  exercises: ImportedExercise[];
};

export type ImportResult = {
  imported: number;
  skipped: number;
  sets: number;
  exercisesCreated: number;
};
