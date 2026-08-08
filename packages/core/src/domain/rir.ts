/** Collapsed RIR range read for a stored set: `rirMin`/`rirMax`, falling back
 * to the legacy scalar `rir` (a set logged before rir became a range carries
 * only that scalar — reads back as a zero-width range, min=max, never
 * fabricating a spread that was never captured).
 *
 * Owned here (framework-free) so both the UI readers (apps/web/src/lib/rir.ts
 * re-exports this) and the findings engine's RIR statistics collapse the same
 * way. Every RIR reader goes through this. */
export function rirRange(s: {
  rir?: number | null;
  rirMin: number | null;
  rirMax: number | null;
}): { min: number; max: number } | null {
  if (s.rirMin != null || s.rirMax != null) {
    return { min: s.rirMin ?? s.rirMax, max: s.rirMax ?? s.rirMin } as {
      min: number;
      max: number;
    };
  }
  if (s.rir != null) return { min: s.rir, max: s.rir };
  return null;
}
