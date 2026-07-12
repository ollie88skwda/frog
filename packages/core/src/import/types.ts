export type ImportedSet = {
  weightKg: number | null;
  reps: number | null;
  rir: number | null;
  note: string | null;
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
