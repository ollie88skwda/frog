// CLI: classify every seed exercise -> classification.json (committed input
// to `seed-convex.ts --generate`). Live mode when FROG_EXTRACT_API_KEY is set
// (same env contract as scripts/machine-catalog/extract.ts); otherwise, or
// with --dry-run, deterministic mock mode (curated Tier 1 + name/muscle rules).
//
//   bun scripts/classify-exercises/classify.ts [--dry-run]
import { readFileSync, writeFileSync } from "node:fs";
import {
  callModel,
  classifyAll,
  parseModelBatch,
  readModelConfig,
} from "./classify-lib";
import { CLASSIFICATION_PATH, SEED_PATH } from "./paths";
import type { SeedExercise } from "./types";

async function main() {
  const seed = (
    JSON.parse(readFileSync(SEED_PATH, "utf8")) as { exercises: SeedExercise[] }
  ).exercises;
  const cfg = process.argv.includes("--dry-run") ? null : readModelConfig();
  const file = await classifyAll(seed, {
    model: cfg
      ? async (items) => parseModelBatch(await callModel(items, cfg))
      : undefined,
  });
  writeFileSync(CLASSIFICATION_PATH, `${JSON.stringify(file, null, 1)}\n`);
  console.log(
    `wrote ${CLASSIFICATION_PATH} mode=${file.meta.mode} ${JSON.stringify(file.meta.counts)}`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
