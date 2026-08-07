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
