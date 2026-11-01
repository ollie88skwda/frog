// Postgres (Supabase) row → Convex document mapping, shared by
// scripts/seed-convex.ts and scripts/import-from-supabase.ts. Uses the
// Drizzle table metadata (packages/core/src/db/columns.ts) (the former DDL
// source of truth) so column names, numeric types and nullability come from
// one place.
import { type ColumnInfo, tableColumns } from "../packages/core/src/db/columns";

type Row = Record<string, unknown>;

/** SQL table name → column metadata (from the Drizzle schema). */
export const TABLES: Record<string, ColumnInfo[]> = tableColumns();

/**
 * Import order: parents before children (uuid FKs are checked by the
 * public mutations but not by admin:importRows; ordering keeps a partial
 * import consistent anyway).
 */
export const IMPORT_ORDER = [
  "machines",
  "exercises",
  "metrics",
  "machine_catalog",
  "tracked_conditions",
  "exercise_favorites",
  "exercise_prefs",
  "user_prefs",
  "routine_folders",
  "routines",
  "routine_exercises",
  "routine_sets",
  "programs",
  "sessions",
  "session_exercises",
  "set_logs",
  "session_media",
  "measurements",
  "push_subscriptions",
  "api_tokens",
] as const;

export const GLOBAL_TABLES = new Set([
  "exercises",
  "metrics",
  "machine_catalog",
]);

/** Converts one pg row (snake_case keys) to a Convex document (camelCase). */
export function toConvex(table: string, row: Row): Row {
  const cols = TABLES[table];
  if (!cols) throw new Error(`unknown table ${table}`);
  const out: Row = {};
  for (const col of cols) {
    let val: unknown = row[col.name] ?? null;
    if (val !== null) {
      if (col.kind === "number") val = Number(val);
      else if (col.kind === "json" && typeof val === "string") {
        val = JSON.parse(val);
      } else if (col.kind === "string") val = String(val);
    }
    out[col.key] = val;
  }
  return out;
}

/** Chunks an array so each Convex mutation stays well under its limits. */
export function chunks<T>(xs: T[], size: number): T[][] {
  const r: T[][] = [];
  for (let i = 0; i < xs.length; i += size) r.push(xs.slice(i, i + size));
  return r;
}
