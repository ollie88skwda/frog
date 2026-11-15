// Stage 5 CLI: migration generator. Turns a reviewed staging batch into an
// idempotent Supabase seed migration for the `machine_catalog` table,
// matching supabase/migrations/20260715055811_seed_free_exercise_db.sql's
// shape exactly: deterministic uuids (so re-running is a no-op), one
// `insert ... on conflict (id) do nothing`, owner_id null (global seed row).
// See migration-lib.ts for the SQL-generation logic itself.
//
// Input: prefers staging/qa/<brand>-review.json (the QA-reviewed feed —
// batch minus phase-1-seed overlaps and wrong-brand rows, written by
// qa.ts), falling back to staging/normalized/<brand>.json. It does NOT
// gate on the review having happened — it trusts the caller, same as
// before.
//
// IMPORTANT — this script never writes into supabase/migrations/ itself.
// The `machine_catalog` table and its migrations directory are owned
// outside this pipeline (table shape: docs/schema.md); this generator only
// produces SQL text (stdout, or a file under this pipeline's own
// staging/migrations/ with -o). To land a batch, run:
//   bun scripts/machine-catalog/generate-migration.ts <brandKey> > supabase/migrations/<ts>_seed_machine_catalog_<brand>.sql
//
// Usage: bun scripts/machine-catalog/generate-migration.ts <brandKey> [-o path]
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { generateSql } from "./migration-lib";
import { migrationOutPath, normalizedPath, qaReviewPath } from "./paths";
import type { ExtractionBatch } from "./types";

async function main() {
  const brandKey = process.argv[2];
  if (!brandKey) {
    console.error(
      "usage: bun scripts/machine-catalog/generate-migration.ts <brandKey> [-o path]",
    );
    process.exit(1);
  }
  const reviewPath = qaReviewPath(brandKey);
  const batch: ExtractionBatch = existsSync(reviewPath)
    ? JSON.parse(readFileSync(reviewPath, "utf8"))
    : JSON.parse(readFileSync(normalizedPath(brandKey), "utf8"));
  const sql = generateSql(brandKey, batch.machines);

  const outFlagIdx = process.argv.indexOf("-o");
  if (outFlagIdx !== -1) {
    const outPath = process.argv[outFlagIdx + 1] ?? migrationOutPath(brandKey);
    mkdirSync(dirname(outPath), { recursive: true });
    writeFileSync(outPath, sql);
    console.error(`wrote ${batch.machines.length} rows -> ${outPath}`);
  } else {
    process.stdout.write(sql);
    console.error(
      `generated ${batch.machines.length} rows for "${brandKey}" (stdout)`,
    );
  }
}

await main();
