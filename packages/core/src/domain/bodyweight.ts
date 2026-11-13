// Body-weight averages (C17). COACH-LOGIC "Computation defaults":
// 7-calendar-day mean, used only with 4+ entries; rates never use a
// single-entry fallback. Compute unrounded; display to 0.1 kg.

export type BwEntry = { at: number; kg: number };

export const BW_AVG_DAYS = 7;
export const BW_AVG_MIN_ENTRIES = 4;

const DAY_MS = 86_400_000;

/** Mean of entries in the half-open window (asOf - 7d, asOf]. Null kg under 4. */
export function bodyweightAverage7d(
  entries: BwEntry[],
  asOf: number,
): { kg: number | null; n: number } {
  const from = asOf - BW_AVG_DAYS * DAY_MS;
  const inWindow = entries.filter((e) => e.at > from && e.at <= asOf);
  const n = inWindow.length;
  if (n < BW_AVG_MIN_ENTRIES) return { kg: null, n };
  return { kg: inWindow.reduce((a, e) => a + e.kg, 0) / n, n };
}

/** Weekly rate, % (C17): current 7-day average vs the previous 7-day average;
 * only when both windows have 4+ entries. Negative = losing. */
export function weeklyBodyweightRatePct(
  entries: BwEntry[],
  asOf: number,
): number | null {
  const cur = bodyweightAverage7d(entries, asOf).kg;
  const prev = bodyweightAverage7d(entries, asOf - BW_AVG_DAYS * DAY_MS).kg;
  if (cur == null || prev == null || prev === 0) return null;
  return ((cur - prev) / prev) * 100;
}

/** Display rounding for body weight: 0.1 kg. */
export function roundBodyweightDisplay(kg: number): number {
  return Math.round(kg * 10) / 10;
}
