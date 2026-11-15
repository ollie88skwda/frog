// Stage 2 CLI: turns each raw page/PDF-text document from crawl.ts's
// manifest into the report.md §3 field shape (StagingMachine), via a cheap
// model in JSON mode. See extract-lib.ts for the extraction logic itself.
//
// The captain explicitly ruled out a frontier model for this — the model
// endpoint is fully env-configurable (any OpenAI-chat-completions-shaped
// endpoint works: deepseek-v4-flash-class providers, a local inference
// server, etc.):
//   FROG_EXTRACT_API_KEY     required for live mode
//   FROG_EXTRACT_BASE_URL    default: https://api.deepseek.com/v1
//   FROG_EXTRACT_MODEL       default: deepseek-chat
//   FROG_EXTRACT_PROVIDER    label only, default: deepseek
//
// No FROG_EXTRACT_API_KEY in the environment (or an explicit --dry-run
// flag) -> deterministic mock mode: a small keyword/JSON-LD heuristic
// parser that proves the pipeline mechanics end-to-end without ever
// calling out to a model. Every mock-mode row's sourceNote says so
// plainly, and ExtractionMeta.mode records which mode produced a batch —
// state which mode you validated with in the PR, don't silently mix them.
//
// Usage: bun scripts/machine-catalog/extract.ts <brandKey> [--dry-run]
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { brandConfig } from "./brands";
import {
  callModel,
  mockExtractOne,
  readExtractConfig,
  toStagingMachine,
} from "./extract-lib";
import { extractedPath, manifestPath } from "./paths";
import type { CrawlManifest, ExtractionBatch, StagingMachine } from "./types";

async function main() {
  const brandKey = process.argv[2];
  if (!brandKey) {
    console.error(
      "usage: bun scripts/machine-catalog/extract.ts <brandKey> [--dry-run]",
    );
    process.exit(1);
  }
  const forceDryRun = process.argv.includes("--dry-run");
  const liveConfig = forceDryRun ? null : readExtractConfig();
  const mode: "live" | "dry-run" = liveConfig ? "live" : "dry-run";

  const manifestFile = manifestPath(brandKey);
  if (!existsSync(manifestFile)) {
    console.error(
      `no crawl manifest for "${brandKey}" — run crawl.ts first (looked for ${manifestFile})`,
    );
    process.exit(1);
  }
  const manifest: CrawlManifest = JSON.parse(
    readFileSync(manifestFile, "utf8"),
  );
  // Brand hint: many storefronts' product JSON-LD omits the manufacturer
  // (Precor, corehandf, gym80.de all do), and a page's own text may never
  // name it either — the model is told the brand instead of guessing.
  const brandHint = brandConfig(brandKey).brand;

  const machines: StagingMachine[] = [];
  const failures: { url: string; reason: string }[] = [];

  for (const doc of manifest.documents) {
    if (mode === "dry-run") {
      const row = mockExtractOne(doc, manifest.brandKey);
      if (row) machines.push(row);
      else
        failures.push({
          url: doc.url,
          reason: "mock extraction could not resolve a clean row",
        });
      continue;
    }
    try {
      const raw = await callModel(doc, liveConfig!, brandHint);
      const parsed = JSON.parse(raw);
      const rows = Array.isArray(parsed.machines) ? parsed.machines : [parsed];
      for (const r of rows) machines.push(toStagingMachine(r, doc.url));
    } catch (err) {
      failures.push({ url: doc.url, reason: (err as Error).message });
    }
  }

  for (const bin of manifest.binaries) {
    failures.push({
      url: bin.url,
      reason:
        "PDF text extraction not implemented in this environment (no pdftotext/PDF-parsing lib) — staged raw only",
    });
  }

  const batch: ExtractionBatch = {
    meta: {
      brandKey,
      extractedAt: new Date().toISOString(),
      mode,
      provider: liveConfig?.provider ?? null,
      model: liveConfig?.model ?? null,
    },
    machines,
  };

  const outPath = extractedPath(brandKey);
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, JSON.stringify(batch, null, 2));

  console.error(
    `extracted ${machines.length} rows for "${brandKey}" in ${mode} mode (${failures.length} unresolved) -> ${outPath}`,
  );
  for (const f of failures) console.error(`  skipped ${f.url}: ${f.reason}`);
}

await main();
