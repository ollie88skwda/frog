import { openDatabaseSync } from "expo-sqlite";
import { drizzle } from "drizzle-orm/expo-sqlite";
import { migrate } from "drizzle-orm/expo-sqlite/migrator";
import migrations from "../../drizzle/migrations";
import * as schema from "./schema";

let _db: ReturnType<typeof drizzle> | null = null;
export function getDb() {
  if (_db) return _db;
  const sqlite = openDatabaseSync("sbl.db");
  _db = drizzle(sqlite, { schema });
  migrate(_db, migrations);
  return _db;
}
