// Shared types for the machine-catalog acquisition pipeline
// (crawl -> extract -> normalize -> qa -> generate-migration).
//
// This is the pipeline's OWN staging shape — deliberately not a Drizzle
// table type. The real `machine_catalog` table is being built by a parallel
// task (frog-machine-catalog-phase1) in packages/core/src/db/schema.ts,
// which this pipeline must not touch. The field set mirrors the plan
// (report.md §3) exactly so `generate-migration.ts` maps 1:1 onto that
// table's columns once it exists; `MachineCategory` and `MuscleTarget` are
// imported (read-only) from the app's real domain types so the two shapes
// can't drift on those two fields.
import type { MachineCategory } from "../../packages/core/src/data/machine-catalog";
import type { MuscleTarget } from "../../packages/core/src/domain/anatomy";

export type { MachineCategory, MuscleTarget };

export const MECHANISMS = [
  "selectorized",
  "plate-loaded",
  "cable",
  "pneumatic",
  "smith",
  "bodyweight",
  "electronic",
] as const;
export type Mechanism = (typeof MECHANISMS)[number];

export type Dimensions = {
  lengthCm?: number;
  widthCm?: number;
  heightCm?: number;
  weightKg?: number;
};

// One row as it moves through the pipeline. Every stage after `extract`
// receives and re-emits this same shape (later stages only ever fill in
// previously-null fields or add provenance — never invent a field the
// staging shape doesn't have) so a partial batch is always inspectable.
export type StagingMachine = {
  brand: string;
  model: string;
  aliases: string[] | null;
  category: MachineCategory;
  mechanism: Mechanism | null;
  // Left null by extraction on purpose — the plan (report.md §4) calls
  // muscle-target assignment a human/agent review judgment call, not
  // something to infer from a spec page. Filled in later by a human/agent
  // QA pass, never guessed by `extract.ts` or `normalize.ts`.
  muscleTargets: MuscleTarget[] | null;
  weightStackKg: number | null;
  plateCapacityKg: number | null;
  dimensions: Dimensions | null;
  productUrl: string | null;
  introducedYear: number | null;
  discontinuedYear: number | null;
  sourceUrl: string;
  sourceNote: string | null;
};

// One fetched raw document, written by crawl.ts into staging/raw/<brand>/.
export type RawDocument = {
  url: string;
  brandKey: string;
  fetchedAt: string; // ISO timestamp
  contentType: string;
  // How the text below was obtained from the response body — extraction
  // heuristics (and a human reading the staging dir) need to know this.
  extractionMethod: "jsonld-product" | "stripped-html" | "raw-text";
  text: string;
};

// A PDF (or other binary) raw fetch — kept separate from RawDocument
// because the pipeline cannot extract text from it in this environment
// (no `pdftotext`/PDF-parsing lib available or vendored — see the crawler
// header comment). Staged for a future text-extraction step; extract.ts
// skips these with a clear note rather than silently dropping them.
export type RawBinary = {
  url: string;
  brandKey: string;
  fetchedAt: string;
  contentType: string;
  filePath: string; // relative to the manifest file
  bytes: number;
};

export type CrawlManifest = {
  brandKey: string;
  crawledAt: string;
  sourceListUrl: string | null; // sitemap URL used, or null for a fixed seed list
  documents: RawDocument[];
  binaries: RawBinary[];
  skipped: { url: string; reason: string }[];
};

export type ExtractionMeta = {
  brandKey: string;
  extractedAt: string;
  mode: "live" | "dry-run";
  provider: string | null;
  model: string | null;
};

export type ExtractionBatch = {
  meta: ExtractionMeta;
  machines: StagingMachine[];
};
