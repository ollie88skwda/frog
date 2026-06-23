// DB-level export assembly: joins all tables into ExportSession[] for the pure
// serialization functions in src/domain/export.ts.

import { and, asc, eq, isNull } from "drizzle-orm";
import { exercises, sessions, sessionExercises, setLogs } from "./schema";
import { decodeConditions } from "../domain/conditions";
import { listMetrics } from "./metrics";
import type { ConditionMap } from "../domain/conditions";
import type { ExportSession } from "../domain/export";

type DB = any;

// Remaps ConditionMap keys from metric IDs to friendly metric names where known.
// Keys not found in the lookup (e.g. legacy string keys) are passed through unchanged.
function remapConditionKeys(map: ConditionMap, nameById: Map<string, string>): ConditionMap {
  const out: ConditionMap = {};
  for (const [k, v] of Object.entries(map)) {
    out[nameById.get(k) ?? k] = v;
  }
  return out;
}

// Returns one ExportSession row per set, ordered by session start → exercise order → set number.
// Condition values (session-level) and set metric values (set-level) are included when present.
// Metric IDs in condition keys are resolved to their friendly names via the metrics table.
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

  const metricRows = listMetrics(db);
  const nameById = new Map<string, string>(metricRows.map((m: any) => [m.id as string, m.name as string]));

  return rows.map((r: any) => {
    const condVals   = remapConditionKeys(decodeConditions(r.conditionValues), nameById);
    const metricVals = remapConditionKeys(decodeConditions(r.metricValues), nameById);
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
