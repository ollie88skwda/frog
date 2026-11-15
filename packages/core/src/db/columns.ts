// Column metadata for tooling (seed/import scripts) that maps Postgres rows
// to Convex documents. Lives in @frog/core so scripts reach drizzle-orm
// through this package's own dependency.
import { getTableColumns, getTableName, type Table } from "drizzle-orm";
import * as schema from "./schema";

export type ColumnInfo = {
  /** camelCase field name (Convex / app row types). */
  key: string;
  /** snake_case SQL column name. */
  name: string;
  kind: "number" | "string" | "boolean" | "json";
};

const NUMBER_TYPES = new Set([
  "PgBigInt53",
  "PgBigInt64",
  "PgInteger",
  "PgReal",
  "PgDoublePrecision",
  "PgNumeric",
  "PgSmallInt",
]);

/** SQL table name → its columns, for every table in schema.ts. */
export function tableColumns(): Record<string, ColumnInfo[]> {
  const out: Record<string, ColumnInfo[]> = {};
  for (const x of Object.values(schema)) {
    if (
      typeof x !== "object" ||
      x === null ||
      !(Symbol.for("drizzle:IsDrizzleTable") in x)
    ) {
      continue;
    }
    const t = x as Table;
    out[getTableName(t)] = Object.entries(getTableColumns(t)).map(
      ([key, col]) => ({
        key,
        name: col.name,
        kind: NUMBER_TYPES.has(col.columnType)
          ? "number"
          : col.dataType === "json"
            ? "json"
            : col.dataType === "boolean"
              ? "boolean"
              : "string",
      }),
    );
  }
  return out;
}
