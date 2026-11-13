// Body-weight averages (C17, C9 dose). COACH-LOGIC "Computation defaults":
// 7-calendar-day mean, used only with 4+ entries; dose falls back to the latest
// entry within 14 days; rates never use a single-entry fallback. Compute
// unrounded; display to 0.1 kg.

export type BwEntry = { at: number; kg: number };

export const BW_AVG_DAYS = 7;
export const BW_AVG_MIN_ENTRIES = 4;
export const BW_FALLBACK_DAYS = 14;

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

/** Body weight for mg/kg doses: 7-day average (4+), else latest entry within 14
 * days, else null. */
export function bodyweightForDose(
  entries: BwEntry[],
  asOf: number,
): number | null {
  const avg = bodyweightAverage7d(entries, asOf).kg;
  if (avg != null) return avg;
  const from = asOf - BW_FALLBACK_DAYS * DAY_MS;
  let latest: BwEntry | null = null;
  for (const e of entries)
    if (e.at > from && e.at <= asOf && (!latest || e.at > latest.at))
      latest = e;
  return latest ? latest.kg : null;
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

/** C9 dose in mg per kg of body weight; null without a weight. */
export function caffeineMgPerKg(
  mg: number,
  bodyweightKg: number | null,
): number | null {
  if (!bodyweightKg || bodyweightKg <= 0) return null;
  return mg / bodyweightKg;
}

/** Display rounding for body weight: 0.1 kg. */
export function roundBodyweightDisplay(kg: number): number {
  return Math.round(kg * 10) / 10;
}
