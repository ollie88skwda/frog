import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema";

const DDL = `
CREATE TABLE exercises (id TEXT PRIMARY KEY, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, deleted_at INTEGER, dirty INTEGER NOT NULL DEFAULT 1, name TEXT NOT NULL, tags TEXT, is_custom INTEGER NOT NULL DEFAULT 1, owner_id TEXT);
CREATE TABLE metrics (id TEXT PRIMARY KEY, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, deleted_at INTEGER, dirty INTEGER NOT NULL DEFAULT 1, name TEXT NOT NULL, type TEXT NOT NULL, scope TEXT NOT NULL, owner_id TEXT);
CREATE TABLE sessions (id TEXT PRIMARY KEY, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, deleted_at INTEGER, dirty INTEGER NOT NULL DEFAULT 1, title TEXT, started_at INTEGER NOT NULL, ended_at INTEGER, condition_values TEXT);
CREATE TABLE session_exercises (id TEXT PRIMARY KEY, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, deleted_at INTEGER, dirty INTEGER NOT NULL DEFAULT 1, session_id TEXT NOT NULL, exercise_id TEXT NOT NULL, order_index INTEGER NOT NULL);
CREATE TABLE set_logs (id TEXT PRIMARY KEY, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, deleted_at INTEGER, dirty INTEGER NOT NULL DEFAULT 1, session_exercise_id TEXT NOT NULL, set_no INTEGER NOT NULL, weight_kg REAL, reps INTEGER, rir INTEGER, note TEXT, metric_values TEXT, completed INTEGER NOT NULL DEFAULT 0);
`;

export function makeTestDb() {
  const sqlite = new Database(":memory:");
  sqlite.exec(DDL);
  return drizzle(sqlite, { schema });
}
