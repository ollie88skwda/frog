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
import { normalizedPath, qaDupesPath, qaSamplePath } from "./paths";
import { findDupes, sample } from "./qa-lib";
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

  const reviewSample = sample(batch.machines, pct, seed).map((m) => ({
    brand: m.brand,
    model: m.model,
    category: m.category,
    sourceUrl: m.sourceUrl,
    sourceNote: m.sourceNote,
  }));
  const dupeGroups = findDupes(batch.machines);

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
    `QA for "${brandKey}": sampled ${reviewSample.length}/${batch.machines.length} rows (${pct}%) -> ${samplePath}`,
  );
  console.error(
    `dedupe check: ${dupeGroups.length} duplicate (brand, model) group(s) -> ${dupesPath}`,
  );
}

await main();
