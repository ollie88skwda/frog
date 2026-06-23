// DB-level export assembly: joins all tables into ExportSession[] for the pure
// serialization functions in src/domain/export.ts.

import { and, asc, eq, isNull } from "drizzle-orm";
import { exercises, sessions, sessionExercises, setLogs } from "./schema";
import { decodeConditions } from "../domain/conditions";
import type { ExportSession } from "../domain/export";

type DB = any;

// Returns one ExportSession row per set, ordered by session start → exercise order → set number.
// Condition values (session-level) and set metric values (set-level) are included when present.
export function buildExportSessions(db: DB): ExportSession[] {
  const rows = db
    .select({
      startedAt: sessions.startedAt,
      sessionTitle: sessions.title,
      conditionValues: sessions.conditionValues,
      exerciseName: exercises.name,
      orderIndex: sessionExercises.orderIndex,
      setNo: setLogs.setNo,
      weightKg: setLogs.weightKg,
      reps: setLogs.reps,
      rir: setLogs.rir,
      metricValues: setLogs.metricValues,
    })
    .from(setLogs)
    .innerJoin(sessionExercises, eq(setLogs.sessionExerciseId, sessionExercises.id))
    .innerJoin(sessions, eq(sessionExercises.sessionId, sessions.id))
    .innerJoin(exercises, eq(sessionExercises.exerciseId, exercises.id))
    .where(
      and(
        isNull(setLogs.deletedAt),
        isNull(sessionExercises.deletedAt),
        isNull(sessions.deletedAt),
        isNull(exercises.deletedAt),
      ),
    )
    .orderBy(asc(sessions.startedAt), asc(sessionExercises.orderIndex), asc(setLogs.setNo))
    .all();

  return rows.map((r: any) => {
    const condVals   = decodeConditions(r.conditionValues);
    const metricVals = decodeConditions(r.metricValues);
    return {
      date: r.startedAt as number,
      title: r.sessionTitle ?? null,
      exercise: r.exerciseName as string,
      setNo: r.setNo as number,
      weightKg: r.weightKg ?? null,
      reps: r.reps ?? null,
      rir: r.rir ?? null,
      ...(Object.keys(condVals).length   > 0 ? { conditionValues: condVals }   : {}),
      ...(Object.keys(metricVals).length > 0 ? { setMetricValues: metricVals } : {}),
    };
  });
}
