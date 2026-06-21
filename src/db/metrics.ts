import { asc, eq, isNull, and } from "drizzle-orm";
import { metrics, sessions } from "./schema";
import { newId } from "../domain/ids";
import type { MetricType, MetricScope, ConditionMap } from "../domain/conditions";
import { decodeConditions, encodeConditions } from "../domain/conditions";

type DB = any;

export function createMetric(db: DB, name: string, type: MetricType, scope: MetricScope): string {
  const id = newId();
  const now = Date.now();
  db.insert(metrics).values({ id, createdAt: now, updatedAt: now, dirty: 1, name, type, scope }).run();
  return id;
}

export function listMetrics(db: DB) {
  return db.select().from(metrics).where(isNull(metrics.deletedAt)).orderBy(asc(metrics.name)).all();
}

export function listMetricsByScope(db: DB, scope: MetricScope) {
  return db
    .select()
    .from(metrics)
    .where(and(isNull(metrics.deletedAt), eq(metrics.scope, scope)))
    .orderBy(asc(metrics.name))
    .all();
}

export function getSessionConditionValues(db: DB, sessionId: string): ConditionMap {
  const row = db
    .select({ conditionValues: sessions.conditionValues })
    .from(sessions)
    .where(eq(sessions.id, sessionId))
    .get();
  return decodeConditions(row?.conditionValues ?? null);
}

export function saveSessionConditionValues(db: DB, sessionId: string, values: ConditionMap): void {
  const now = Date.now();
  db
    .update(sessions)
    .set({ conditionValues: encodeConditions(values), updatedAt: now, dirty: 1 })
    .where(eq(sessions.id, sessionId))
    .run();
}
