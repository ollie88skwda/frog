// Hevy import DB writer: upserts parsed ExportSession rows into SQLite.
// Companion to src/domain/import.ts (the pure CSV parser).
// Strategy: group rows by (date, title) → one DB session per group.
// Exercises are matched by name; created if not found.
// Duplicate sessions (same startedAt) are skipped by default.

import { eq, isNull } from "drizzle-orm";
import { exercises, sessions, sessionExercises, setLogs } from "./schema";
import { newId } from "../domain/ids";
import { encodeConditions } from "../domain/conditions";
import { createExercise } from "./exercises";
import { addExerciseToSession } from "./sessions";
import type { ExportSession } from "../domain/export";

type DB = any;

export type ImportResult = {
  sessionsImported: number;
  sessionsSkipped: number;
  exercisesCreated: number;
  setsInserted: number;
};

export function importHevySessions(db: DB, rows: ExportSession[]): ImportResult {
  let sessionsImported = 0;
  let sessionsSkipped  = 0;
  let exercisesCreated = 0;
  let setsInserted     = 0;

  // Group rows by session key (exact start timestamp + title)
  const sessionGroups = new Map<string, ExportSession[]>();
  for (const row of rows) {
    const key = `${row.date}|${row.title ?? ""}`;
    if (!sessionGroups.has(key)) sessionGroups.set(key, []);
    sessionGroups.get(key)!.push(row);
  }

  // Exercise name → id cache (avoids N+1 lookups within a run)
  const exerciseByName = new Map<string, string>();

  for (const [, sessionRows] of sessionGroups) {
    const first = sessionRows[0];

    // Skip if a session with this exact startedAt already exists (idempotent import)
    const existing = db
      .select({ id: sessions.id })
      .from(sessions)
      .where(eq(sessions.startedAt, first.date))
      .all();
    if (existing.length > 0) {
      sessionsSkipped++;
      continue;
    }

    // Insert the session record (bypass startSession() to control startedAt)
    const sessionId = newId();
    const condVals = first.conditionValues;
    db.insert(sessions).values({
      id: sessionId,
      createdAt: first.date,
      updatedAt: first.date,
      dirty: 1,
      title: first.title ?? null,
      startedAt: first.date,
      endedAt: null,
      conditionValues: condVals ? encodeConditions(condVals) : null,
    }).run();

    // Group rows by exercise name, preserving order of first appearance
    const exerciseOrder: string[] = [];
    const byExercise = new Map<string, ExportSession[]>();
    for (const row of sessionRows) {
      if (!byExercise.has(row.exercise)) {
        exerciseOrder.push(row.exercise);
        byExercise.set(row.exercise, []);
      }
      byExercise.get(row.exercise)!.push(row);
    }

    for (const exName of exerciseOrder) {
      // Resolve exercise id (check cache, then DB, then create)
      let exId = exerciseByName.get(exName);
      if (!exId) {
        const found = db
          .select({ id: exercises.id })
          .from(exercises)
          .where(eq(exercises.name, exName))
          .all();
        if (found.length > 0) {
          exId = found[0].id as string;
        } else {
          exId = createExercise(db, exName);
          exercisesCreated++;
        }
        exerciseByName.set(exName, exId);
      }

      const seId = addExerciseToSession(db, sessionId, exId);

      const exRows = byExercise.get(exName)!;
      for (const row of exRows) {
        const setId = newId();
        const metricVals = row.setMetricValues;
        db.insert(setLogs).values({
          id: setId,
          createdAt: first.date,
          updatedAt: first.date,
          dirty: 1,
          sessionExerciseId: seId,
          setNo: Math.max(0, row.setNo - 1),   // Hevy is 1-indexed; SBL is 0-indexed
          weightKg: row.weightKg,
          reps: row.reps,
          rir: row.rir ?? null,
          note: null,
          metricValues: metricVals ? encodeConditions(metricVals) : null,
          completed: 1,
        }).run();
        setsInserted++;
      }
    }

    sessionsImported++;
  }

  return { sessionsImported, sessionsSkipped, exercisesCreated, setsInserted };
}
