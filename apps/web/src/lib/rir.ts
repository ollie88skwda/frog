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
 * The collapsed "@2-3 RPE 8" effort readout, in one place: the session's
 * committed rows (both lines of a unilateral pair), its draft-row preview and
 * the history detail all render the same string, so a change to the format
 * can't make the same set read differently on two screens. RIR goes through
 * rirRange so a legacy scalar still renders. Empty when neither is logged.
 */
export function effortReadout(s: {
  rir?: number | null;
  rirMin: number | null;
  rirMax: number | null;
  rpe: number | null;
}): string {
  return [formatRirRange(rirRange(s)), s.rpe != null ? `RPE ${s.rpe}` : null]
    .filter(Boolean)
    .join(" ");
}

/**
 * Seeds the min/max edit fields from a stored set. Distinct from rirRange(),
 * which is a *display* collapse: it back-fills a missing bound so a half-open
 * range still reads as one number. Seeding an editable field that way would
 * make merely opening the set for edit persist a bound the user never entered,
 * so the absent side seeds blank. The legacy scalar seeds both, because
 * min === max is exactly what it means.
 */
export function rirEditFields(s: {
  rir?: number | null;
  rirMin: number | null;
  rirMax: number | null;
}): { min: string; max: string } {
  if (s.rirMin != null || s.rirMax != null)
    return {
      min: s.rirMin != null ? String(s.rirMin) : "",
      max: s.rirMax != null ? String(s.rirMax) : "",
    };
  if (s.rir != null) return { min: String(s.rir), max: String(s.rir) };
  return { min: "", max: "" };
}

/**
 * Parses the min/max RIR text fields of an authored *target* (routine editor).
 * A non-numeric entry reads as empty, and an inverted range is dropped to null
 * rather than persisted — a prescription the session UI would render backwards
 * is unreadable either way, and no work was performed to preserve.
 */
export function parseTargetRirFields(
  min: string,
  max: string,
): { rirMin: number | null; rirMax: number | null } {
  const lo = parseIntOrNull(min);
  const hi = parseIntOrNull(max);
  if (lo != null && hi != null && lo > hi)
    return { rirMin: null, rirMax: null };
  return { rirMin: lo, rirMax: hi };
}

/**
 * Parses the same two fields for a *performed* set (session logging). Same
 * numeric rule, but an inverted range is swapped rather than dropped: the
 * effort was real, min 3 / max 1 has exactly one readable reading (1–3), and
 * discarding it would lose logged data the target path never had. One owner
 * for the session write rule so the collapsed preview can't show a value the
 * commit then changes.
 */
export function parseLoggedRirFields(
  min: string,
  max: string,
): { rirMin: number | null; rirMax: number | null } {
  const lo = parseIntOrNull(min);
  const hi = parseIntOrNull(max);
  if (lo != null && hi != null && lo > hi) return { rirMin: hi, rirMax: lo };
  return { rirMin: lo, rirMax: hi };
}
