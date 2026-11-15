// Stage 4 CLI: QA tooling. Reads staging/normalized/<brand>.json and
// produces two reports:
//   1. a random sample (default 5-10%, configurable) for a human/agent to
//      spot-check against each row's sourceUrl before it's trusted enough
//      to feed generate-migration.ts;
//   2. a dedupe check keyed on normalized (brand, model) — the same key
//      normalize-lib.ts's dedupeKey uses — flagging any group with more
//      than one row.
// See qa-lib.ts for the sampling/dedupe logic itself.
//
// Usage: bun scripts/machine-catalog/qa.ts <brandKey> [--pct 10] [--seed 1]
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { MACHINE_CATALOG } from "../../packages/core/src/data/machine-catalog";
import { brandConfig } from "./brands";
import {
  normalizedPath,
  qaDupesPath,
  qaReviewPath,
  qaSamplePath,
} from "./paths";
import { findDupes, findSeedOverlaps, sample } from "./qa-lib";
import type { ExtractionBatch } from "./types";

const DEFAULT_PCT = 10; // report.md §5: "recommend 5-10%"

async function main() {
  const brandKey = process.argv[2];
  if (!brandKey) {
    console.error(
      "usage: bun scripts/machine-catalog/qa.ts <brandKey> [--pct 10] [--seed 1]",
    );
    process.exit(1);
  }
  const pctFlagIdx = process.argv.indexOf("--pct");
  const pct =
    pctFlagIdx !== -1 ? Number(process.argv[pctFlagIdx + 1]) : DEFAULT_PCT;
  const seedFlagIdx = process.argv.indexOf("--seed");
  const seed = seedFlagIdx !== -1 ? Number(process.argv[seedFlagIdx + 1]) : 1;

  const batch: ExtractionBatch = JSON.parse(
    readFileSync(normalizedPath(brandKey), "utf8"),
  );

  // The phase-1 seed (static catalog) already owns these machines — a
  // re-insert would duplicate a row, so drop them from the migration feed.
  // Also drop rows that normalized to a *different* brand than this batch
  // targets (e.g. Hammer Strength products crawled under the shared
  // life-fitness sitemap land in life-fitness's batch) — they are reported
  // so the caller can re-home them into their own brand's batch.
  const seedOverlaps = findSeedOverlaps(batch.machines, MACHINE_CATALOG);
  const targetBrand = brandConfig(brandKey).brand;
  const wrongBrand = batch.machines.filter(
    (m) => m.brand !== targetBrand && !seedOverlaps.includes(m),
  );
  const seedOverlapKeys = new Set(seedOverlaps.map((m) => m));
  const wrongBrandKeys = new Set(wrongBrand.map((m) => m));
  const reviewRows = batch.machines.filter(
    (m) => !seedOverlapKeys.has(m) && !wrongBrandKeys.has(m),
  );

  const reviewPath = qaReviewPath(brandKey);
  mkdirSync(dirname(reviewPath), { recursive: true });
  writeFileSync(
    reviewPath,
    JSON.stringify(
      {
        brandKey,
        targetBrand,
        reviewedAt: new Date().toISOString(),
        // The migration feed: batch minus seed overlaps minus wrong-brand rows.
        // A human/agent still reviews `sample` below and edits this file (or
        // drops rows) before generate-migration.ts consumes it.
        machines: reviewRows,
        dropped: {
          seedOverlaps: seedOverlaps.map((m) => ({
            brand: m.brand,
            model: m.model,
          })),
          wrongBrand: wrongBrand.map((m) => ({
            brand: m.brand,
            model: m.model,
          })),
        },
      },
      null,
      2,
    ),
  );

  const reviewSample = sample(reviewRows, pct, seed).map((m) => ({
    brand: m.brand,
    model: m.model,
    category: m.category,
    sourceUrl: m.sourceUrl,
    sourceNote: m.sourceNote,
  }));
  const dupeGroups = findDupes(reviewRows);

  const samplePath = qaSamplePath(brandKey);
  mkdirSync(dirname(samplePath), { recursive: true });
  writeFileSync(
    samplePath,
    JSON.stringify(
      {
        brandKey,
        pct,
        seed,
        sampledAt: new Date().toISOString(),
        rows: reviewSample,
      },
      null,
      2,
    ),
  );

  const dupesPath = qaDupesPath(brandKey);
  writeFileSync(
    dupesPath,
    JSON.stringify(
      { brandKey, checkedAt: new Date().toISOString(), dupeGroups },
      null,
      2,
    ),
  );

  console.error(
    `QA for "${brandKey}": ${reviewRows.length}/${batch.machines.length} rows kept (${seedOverlaps.length} dropped as seed dupes, ${wrongBrand.length} dropped as wrong brand) -> ${reviewPath}`,
  );
  console.error(
    `sample: ${reviewSample.length} rows -> ${samplePath}; dedupe: ${dupeGroups.length} group(s) -> ${dupesPath}`,
  );
  if (wrongBrand.length > 0) {
    console.error(
      `wrong-brand rows (re-home into their own brand's batch): ${wrongBrand
        .map((m) => `${m.brand} ${m.model}`)
        .join("; ")}`,
    );
  }
}

await main();
