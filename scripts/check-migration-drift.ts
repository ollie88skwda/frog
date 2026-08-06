// CI gate: fails loudly when the hosted Supabase project is missing
// migrations that are committed to supabase/migrations/. This is the
// automated guard for the 2026-08-06 outage (docs/DECISIONS.md) — the hosted
// database sat 7 migrations behind the deployed frontend for days, every
// query naming a new column 400'd, and the app rendered as "you have no
// data" with nothing telling anyone the database was stale.
//
// Mechanism: `supabase migration list --db-url <url>`, the same command
// (minus `--linked`) used to diagnose and verify the fix for that outage. It
// prints one row per migration known to either side, with `remote` blank
// wherever the committed migration was never applied to the target
// database. This intentionally does NOT run `supabase db push` or write
// anything — see "Automate vs. detect" in docs/DECISIONS.md for why.
//
// Credential: SUPABASE_DRIFT_DB_URL, a Postgres connection string (repo
// secret, not committed here) for a role with exactly this and nothing
// else — genuinely read-only, can't push, can't touch app data:
//
//   CREATE ROLE drift_check_ro LOGIN PASSWORD '<pick one>';
//   GRANT USAGE ON SCHEMA supabase_migrations TO drift_check_ro;
//   GRANT SELECT ON supabase_migrations.schema_migrations TO drift_check_ro;
//
// Run that against the hosted project (SQL editor or `psql`), then set
// SUPABASE_DRIFT_DB_URL to
// `postgresql://drift_check_ro:<password>@<host>:<port>/postgres` (host/port
// from the hosted project's connection info) as a GitHub Actions repo
// secret. Deliberately NOT SUPABASE_ACCESS_TOKEN: Supabase has no
// narrower-scoped personal access token, so that one can do anything the
// account can do (including `db push`) even though this script would never
// call it — captain's call, see docs/DECISIONS.md.
import { execFileSync } from "node:child_process";
import { readdirSync } from "node:fs";

const local = readdirSync("supabase/migrations")
  .filter((f) => /^\d{14}_.*\.sql$/.test(f))
  .map((f) => f.slice(0, 14));
if (local.length === 0) {
  throw new Error(
    "no migrations found under supabase/migrations/ — check script is broken",
  );
}

const dbUrl = process.env.SUPABASE_DRIFT_DB_URL;
if (!dbUrl) {
  console.log(
    "::warning::migration-drift check is not configured — set " +
      "SUPABASE_DRIFT_DB_URL as a GitHub Actions repo secret (see the " +
      "header of this script for the exact read-only role to create). " +
      "Until then this check cannot see whether hosted is behind.",
  );
  process.exit(0);
}

let out: string;
try {
  out = execFileSync(
    "supabase",
    ["migration", "list", "--db-url", dbUrl, "--output-format", "json"],
    { encoding: "utf8" },
  );
} catch (e) {
  console.error(
    "Could not reach the target database to check migration drift.",
  );
  console.error(e instanceof Error ? e.message : String(e));
  process.exit(1);
}

// The CLI prints a "Connecting…" status line before the JSON payload.
const jsonLine = out.trim().split("\n").at(-1) ?? "";
let parsed: { migrations: { local: string; remote: string }[] };
try {
  parsed = JSON.parse(jsonLine);
} catch {
  console.error(`Couldn't parse \`supabase migration list\` output:\n${out}`);
  process.exit(1);
}

const missing = parsed.migrations
  .filter((m) => m.local && !m.remote)
  .map((m) => m.local);

if (missing.length > 0) {
  console.error(
    `Hosted database is missing ${missing.length} migration(s) that are ` +
      `committed to supabase/migrations/:\n` +
      missing.map((v) => `  - ${v}`).join("\n") +
      "\n\nApply them with `supabase db push` after review — see " +
      "docs/DECISIONS.md for the outage this check guards against.",
  );
  process.exit(1);
}

console.log(
  `Hosted database matches all ${local.length} committed migrations.`,
);
