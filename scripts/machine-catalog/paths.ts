// Shared staging-directory layout for the pipeline. One place so every
// stage (crawl/extract/normalize/qa/generate-migration) agrees on where the
// previous stage's output lives.
//
// Root defaults to the gitignored staging/ dir; set FROG_MC_ROOT to point
// every stage at a different root instead — used to reproduce the
// committed reference example against scripts/machine-catalog/sample/
// without ever writing into the gitignored dir.
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const PKG_ROOT = dirname(fileURLToPath(import.meta.url));

export const STAGING_ROOT =
  process.env.FROG_MC_ROOT ?? join(PKG_ROOT, "staging");

export function rawDir(brandKey: string): string {
  return join(STAGING_ROOT, "raw", brandKey);
}

export function manifestPath(brandKey: string): string {
  return join(rawDir(brandKey), "manifest.json");
}

export function extractedPath(brandKey: string): string {
  return join(STAGING_ROOT, "extracted", `${brandKey}.json`);
}

export function normalizedPath(brandKey: string): string {
  return join(STAGING_ROOT, "normalized", `${brandKey}.json`);
}

export function qaSamplePath(brandKey: string): string {
  return join(STAGING_ROOT, "qa", `${brandKey}-sample.json`);
}

export function qaDupesPath(brandKey: string): string {
  return join(STAGING_ROOT, "qa", `${brandKey}-dupes.json`);
}

// The QA-reviewed migration feed: the normalized batch minus rows the
// phase-1 seed already owns and minus wrong-brand rows. generate-migration.ts
// prefers this file when present (see its header).
export function qaReviewPath(brandKey: string): string {
  return join(STAGING_ROOT, "qa", `${brandKey}-review.json`);
}

export function migrationOutPath(brandKey: string): string {
  return join(STAGING_ROOT, "migrations", `${brandKey}.sql`);
}
