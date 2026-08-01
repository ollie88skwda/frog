import { parseIntOrNull } from "@/lib/format";

/**
 * Read-time RIR compat: a set logged before rir became a range carries only
 * the legacy scalar `rir` — reads back as a zero-width range (min=max), never
 * fabricating a spread that was never captured. New logging always writes
 * rirMin/rirMax (even for a single value) and leaves `rir` null going forward.
 * Every RIR reader (session rows, history detail) goes through this.
 */
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

export function formatRirRange(
  r: { min: number; max: number } | null,
): string | null {
  if (!r) return null;
  return r.min === r.max ? `@${r.min}` : `@${r.min}-${r.max}`;
}

/**
 * Parses the min/max RIR text fields into the pair to persist. One owner for
 * the write rule so the collapsed preview can't show a value the commit then
 * drops: a non-numeric entry reads as empty, and an inverted range is dropped
 * to null rather than persisted (same as the routine editor's target range —
 * bounds the session UI would render backwards are unreadable either way).
 */
export function parseRirFields(
  min: string,
  max: string,
): { rirMin: number | null; rirMax: number | null } {
  const lo = parseIntOrNull(min);
  const hi = parseIntOrNull(max);
  if (lo != null && hi != null && lo > hi)
    return { rirMin: null, rirMax: null };
  return { rirMin: lo, rirMax: hi };
}
