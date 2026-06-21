// E2E-ONLY drop-in replacement for `src/db/client.ts`.
//
// Why this exists: `expo-sqlite`'s synchronous web API (`openDatabaseSync`) relies
// on a busy-wait worker handshake that reliably times out on the first call in a
// browser ("Sync operation timeout"), which crashes the real app at boot on web.
// The app's screens call `getDb()` synchronously, so an async driver can't be
// swapped in without changing app source.
//
// For headless web E2E we instead back Drizzle with `sql.js` (a synchronous WASM
// SQLite). This is a *driver* swap only — the schema, the migration SQL, and every
// query function in `src/db/*` are the real app code, unchanged. Metro aliases
// `src/db/client` -> this file when `EXPO_PUBLIC_E2E=1` (see metro.config.js); the
// shipped app never imports it.
//
// Persistence: sql.js is in-memory, so after every getDb() we export the DB to
// bytes and stash them in localStorage. On init we restore from localStorage. This
// makes the "fully relaunch -> data persists" step verifiable on web (a page reload
// in the same browser profile is the web analogue of an app relaunch).

import { drizzle } from "drizzle-orm/sql-js";
import * as schema from "../../src/db/schema";
// The single migration's raw SQL. Metro bundles `.sql` as a string (sourceExts).
import migrationSql from "../../drizzle/0000_wise_tusk.sql";

const STORAGE_KEY = "sbl-e2e-sqljs";

type Drizzle = ReturnType<typeof drizzle>;
let _db: Drizzle | null = null;
let _raw: any = null; // sql.js Database instance

// Set by the E2E entry (e2e/web/entry.ts) BEFORE the app renders. sql.js wasm
// instantiation is async, so it must be awaited up front; the app then calls the
// synchronous getDb() below and finds everything ready.
export function __setSqlJsDatabase(rawDb: any) {
  _raw = rawDb;
  // Expose the raw DB so the Playwright spec can assert on DB state directly
  // (e.g. count logged sets) without scraping the UI. E2E build only.
  (globalThis as any).__SBL_RAW_DB__ = rawDb;
}

function persist() {
  if (!_raw) return;
  const bytes: Uint8Array = _raw.export();
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  globalThis.localStorage?.setItem(STORAGE_KEY, btoa(binary));
}

export function __restoreBytes(): Uint8Array | null {
  const b64 = globalThis.localStorage?.getItem(STORAGE_KEY);
  if (!b64) return null;
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export function __applyMigrations() {
  if (!_raw) throw new Error("[e2e] sql.js DB not set before migration");
  // Strip drizzle's statement-breakpoint markers and run the schema. Safe to
  // re-run because restored DBs already have the tables (guard with IF NOT EXISTS
  // by only migrating a fresh DB — see entry.ts).
  _raw.run(migrationSql.replace(/-->\s*statement-breakpoint/g, ""));
}

export function getDb(): Drizzle {
  if (_db) return _db;
  if (!_raw) {
    throw new Error(
      "[e2e] getDb() called before sql.js was initialised. The E2E entry must " +
        "set the database before rendering."
    );
  }
  // Drizzle's sql-js driver writes via `client.prepare(sql)` then `stmt.run(params)`.
  // Wrap `prepare` so the returned statement's `run` (the write path) persists the
  // whole DB to localStorage after each mutation. Reads (step/getAsObject) are
  // untouched.
  const rawPrepare = _raw.prepare.bind(_raw);
  _raw.prepare = (sqlText: string) => {
    const stmt = rawPrepare(sqlText);
    const rawRun = stmt.run.bind(stmt);
    stmt.run = (...args: any[]) => {
      const r = rawRun(...args);
      persist();
      return r;
    };
    return stmt;
  };
  _db = drizzle(_raw, { schema });
  return _db;
}
