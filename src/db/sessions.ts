import { and, desc, eq, isNull } from "drizzle-orm";
import { sessions, sessionExercises, setLogs } from "./schema";
import { newId } from "../domain/ids";

type DB = any;

export function startSession(db: DB, title?: string): string {
  const id = newId(); const now = Date.now();
  db.insert(sessions).values({ id, createdAt: now, updatedAt: now, dirty: 1, title: title ?? null, startedAt: now }).run();
  return id;
}

export function addExerciseToSession(db: DB, sessionId: string, exerciseId: string): string {
  const id = newId(); const now = Date.now();
  const existing = db.select().from(sessionExercises).where(eq(sessionExercises.sessionId, sessionId)).all();
  db.insert(sessionExercises).values({
    id, createdAt: now, updatedAt: now, dirty: 1, sessionId, exerciseId, orderIndex: existing.length,
  }).run();
  return id;
}

export function logSet(db: DB, sessionExerciseId: string, set: { weightKg: number | null; reps: number | null; rir?: number | null; note?: string | null }): string {
  const id = newId(); const now = Date.now();
  const prior = db.select().from(setLogs).where(eq(setLogs.sessionExerciseId, sessionExerciseId)).all();
  db.insert(setLogs).values({
    id, createdAt: now, updatedAt: now, dirty: 1, sessionExerciseId, setNo: prior.length,
    weightKg: set.weightKg, reps: set.reps, rir: set.rir ?? null, note: set.note ?? null, completed: 1,
  }).run();
  return id;
}

// Most recent PRIOR session's sets for an exercise (for ghost prefill).
export function lastSetsForExercise(db: DB, exerciseId: string): { weightKg: number | null; reps: number | null }[] {
  const ses = db.select({ id: sessionExercises.id, sessionId: sessionExercises.sessionId, createdAt: sessionExercises.createdAt })
    .from(sessionExercises)
    .where(and(eq(sessionExercises.exerciseId, exerciseId), isNull(sessionExercises.deletedAt)))
    .orderBy(desc(sessionExercises.createdAt)).all();
  if (ses.length === 0) return [];
  const latest = ses[0];
  const rows = db.select().from(setLogs)
    .where(and(eq(setLogs.sessionExerciseId, latest.id), isNull(setLogs.deletedAt)))
    .orderBy(setLogs.setNo).all();
  return rows.map((r: any) => ({ weightKg: r.weightKg, reps: r.reps }));
}
