// E2E-ONLY web entry. index.js (the package.json main) loads this instead of
// expo-router/entry when EXPO_PUBLIC_E2E=1. It asynchronously instantiates the
// sql.js WASM database, restores any persisted bytes, runs migrations on a fresh
// DB, hands the ready DB to the test client, and only THEN renders the real
// expo-router app. This guarantees the app's synchronous getDb() finds an
// initialised database. The shipped app uses expo-router/entry directly and never
// loads this.

import initSqlJs from "sql.js";
import {
  __setSqlJsDatabase,
  __restoreBytes,
  __applyMigrations,
} from "./test-client";

async function boot() {
  const SQL = await initSqlJs({
    // Served alongside the bundle by e2e/web/serve.cjs at /sql-wasm.wasm.
    locateFile: () => "/sql-wasm.wasm",
  });

  const restored = __restoreBytes();
  const db = restored ? new SQL.Database(restored) : new SQL.Database();
  __setSqlJsDatabase(db);
  if (!restored) {
    __applyMigrations(); // fresh DB -> create tables
  }

  // Signal readiness for the Playwright spec to wait on, then render the app.
  (globalThis as any).__SBL_E2E_DB_READY__ = true;

  // Require (not dynamic import) so the app stays in this single bundle — a
  // dynamic import() makes Metro emit a separate async chunk that the static web
  // export's runtime can't fetch ("Requiring unknown module"). require() pulls in
  // an already-bundled CommonJS module synchronously. Requiring entry-classic
  // triggers renderRootComponent(App).
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require("expo-router/entry-classic");
}

boot().catch((err) => {
  (globalThis as any).__SBL_E2E_BOOT_ERROR__ = String(err);
  // Surface in the page so failures are visible to the spec.
  // eslint-disable-next-line no-console
  console.error("[e2e] boot failed", err);
});
