import { and, asc, isNull } from "drizzle-orm";
import { exercises } from "./schema";
import { newId } from "../domain/ids";

type DB = any; // Drizzle instance (better-sqlite3 in tests, expo-sqlite in app)

export function createExercise(db: DB, name: string, tags?: string[]): string {
  const id = newId(); const now = Date.now();
  db.insert(exercises).values({
    id, createdAt: now, updatedAt: now, dirty: 1, name,
    tags: tags ? JSON.stringify(tags) : null, isCustom: 1,
  }).run();
  return id;
}

export function listExercises(db: DB): (typeof exercises.$inferSelect)[] {
  return db.select().from(exercises).where(isNull(exercises.deletedAt)).orderBy(asc(exercises.name)).all();
}
