// Pure QA logic (sampling + dedupe), split out from qa.ts's CLI entry
// point so it's importable by tests without executing that file's CLI body
// (this repo's scripts run their CLI unconditionally at module bottom —
// see import-free-exercise-db.ts).
import { dedupeKey } from "./normalize-lib";
import type { StagingMachine } from "./types";

// Deterministic PRNG (mulberry32) so a QA sample is reproducible given the
// same seed — re-running qa.ts on an unchanged batch reviews the same rows,
// rather than a fresh random draw each time.
export function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function sample<T>(items: readonly T[], pct: number, seed: number): T[] {
  if (items.length === 0) return [];
  const count = Math.max(1, Math.round((items.length * pct) / 100));
  const rand = mulberry32(seed);
  const indices = items.map((_, i) => i);
  // Fisher-Yates partial shuffle, first `count` entries.
  for (let i = 0; i < count && i < indices.length; i++) {
    const j = i + Math.floor(rand() * (indices.length - i));
    [indices[i], indices[j]] = [indices[j], indices[i]];
  }
  return indices.slice(0, count).map((i) => items[i]);
}

export function findDupes(
  items: readonly StagingMachine[],
): StagingMachine[][] {
  const groups = new Map<string, StagingMachine[]>();
  for (const m of items) {
    const key = dedupeKey(m);
    const group = groups.get(key) ?? [];
    group.push(m);
    groups.set(key, group);
  }
  return [...groups.values()].filter((g) => g.length > 1);
}

// ---- seed-overlap detection --------------------------------------------
// The phase-1 seed (migrated from the static catalog) already owns one row
// per machine; a phase-2 batch must not re-insert a machine the seed
// already has. Exact (brand, model) is the obvious key, but the static
// catalog's hand-written names differ from the official product names the
// crawler picks up in three systematic ways, all handled here:
//   - "Plate Loaded"/"Plate-Loaded" prefix: seed "Plate Loaded Glute
//     Drive" vs official "Glute Drive" (the prefix is the mechanism, not
//     the name);
//   - word order: seed "Insignia Series Dual Axis Chest Press" vs official
//     "Insignia Series Chest Press - Dual Axis";
//   - separator noise: "Pec Fly/Rear Deltoid" vs "Pec Fly / Rear Deltoid".
// Comparison is a sorted bag of alphanumeric words (case-insensitive,
// separators dropped) — deliberately NOT fuzzy (no stemming, no typo
// tolerance): near-dups it can't prove (e.g. "Hip Abductor / Adductor" vs
// seed "Hip Abduction/Adduction") are left for the human QA review, not
// auto-dropped.

export function seedCompareWords(model: string): string[] {
  const stripped = model.replace(/^plate[- ]loaded\s+/i, "");
  return stripped
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
    .sort();
}

export function sameSeedMachine(modelA: string, modelB: string): boolean {
  const wa = seedCompareWords(modelA);
  const wb = seedCompareWords(modelB);
  return wa.length === wb.length && wa.every((w, i) => w === wb[i]);
}

// Rows of `machines` whose (brand, model) already exists in `seedRows`
// (the static-catalog seed set) under a same-machine name. Returns the
// overlapping staging rows — the caller drops them before the migration.
export function findSeedOverlaps(
  machines: readonly StagingMachine[],
  seedRows: readonly { brand: string; model: string }[],
): StagingMachine[] {
  const seedByBrand = new Map<string, string[][]>();
  for (const s of seedRows) {
    const words = seedCompareWords(s.model);
    const list = seedByBrand.get(s.brand) ?? [];
    list.push(words);
    seedByBrand.set(s.brand, list);
  }
  return machines.filter((m) => {
    const words = seedCompareWords(m.model);
    return (seedByBrand.get(m.brand) ?? []).some(
      (sw) => sw.length === words.length && sw.every((w, i) => w === words[i]),
    );
  });
}
