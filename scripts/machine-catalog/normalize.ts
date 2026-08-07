// Stage 3: normalization. Reads staging/extracted/<brand>.json, applies
// brand-name canonicalization (brands.ts's BRAND_CANONICAL) and the
// model-family alias table (model-aliases.ts) via normalize-lib.ts, and
// writes staging/normalized/<brand>.json.
//
// Usage: bun scripts/machine-catalog/normalize.ts <brandKey>
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { normalizeMachine } from "./normalize-lib";
import { extractedPath, normalizedPath } from "./paths";
import type { ExtractionBatch } from "./types";

async function main() {
  const brandKey = process.argv[2];
  if (!brandKey) {
    console.error("usage: bun scripts/machine-catalog/normalize.ts <brandKey>");
    process.exit(1);
  }

  const batch: ExtractionBatch = JSON.parse(
    readFileSync(extractedPath(brandKey), "utf8"),
  );
  const machines = batch.machines.map(normalizeMachine);

  const outPath = normalizedPath(brandKey);
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(
    outPath,
    JSON.stringify(
      {
        meta: { ...batch.meta, normalizedAt: new Date().toISOString() },
        machines,
      },
      null,
      2,
    ),
  );
  console.error(
    `normalized ${machines.length} rows for "${brandKey}" -> ${outPath}`,
  );
}

await main();
