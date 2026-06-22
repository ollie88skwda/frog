import { and, asc, eq, isNull } from "drizzle-orm";
import { exercises, sessionExercises, sessions, setLogs } from "./schema";
import type { ExerciseRecord } from "../domain/findings";
import { epley } from "../domain/e1rm";

type DB = any;

/**
 * Assembles ExerciseRecord[] for one exercise by joining through sessions/sets.
 * This is the DB bridge that feeds findings.ts with real data.
 */
export function sessionHistoryForExercise(db: DB, exerciseId: string): ExerciseRecord[] {
  const rows = db
    .select({
      startedAt: sessions.startedAt,
      weightKg: setLogs.weightKg,
      reps: setLogs.reps,
    })
    .from(setLogs)
    .innerJoin(sessionExercises, eq(setLogs.sessionExerciseId, sessionExercises.id))
    .innerJoin(sessions, eq(sessionExercises.sessionId, sessions.id))
    .where(
      and(
        eq(sessionExercises.exerciseId, exerciseId),
        isNull(setLogs.deletedAt),
        isNull(sessionExercises.deletedAt),
        isNull(sessions.deletedAt),
      ),
    )
    .orderBy(asc(sessions.startedAt))
    .all();

  return rows
    .filter((r: any) => r.weightKg != null && r.reps != null)
    .map((r: any) => ({
      sessionDay: Math.floor(r.startedAt / 86400000),
      weightKg: r.weightKg as number,
      reps: r.reps as number,
      e1rm: epley(r.weightKg, r.reps),
      setType: "normal",
    }));
}

/**
 * Builds a full exercise name → ExerciseRecord[] map for all non-deleted exercises
 * that have at least one logged set. Used to feed holistic() directly from the DB.
 */
export function buildExerciseMap(db: DB): Record<string, ExerciseRecord[]> {
  const allExercises = db
    .select({ id: exercises.id, name: exercises.name })
    .from(exercises)
    .where(isNull(exercises.deletedAt))
    .all();

  const result: Record<string, ExerciseRecord[]> = {};
  for (const ex of allExercises) {
    const records = sessionHistoryForExercise(db, ex.id);
    if (records.length > 0) result[ex.name] = records;
  }
  return result;
}
