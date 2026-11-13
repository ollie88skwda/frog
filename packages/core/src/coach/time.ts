import { DAY_MS } from "./constants";

/** Local calendar day index (days since 1970-01-01 in the user's zone). */
export function localDayIndex(ms: number, tzOffsetMin: number): number {
  return Math.floor((ms + tzOffsetMin * 60_000) / DAY_MS);
}

/** Minutes after local midnight. */
export function localMinuteOfDay(ms: number, tzOffsetMin: number): number {
  const l = ms + tzOffsetMin * 60_000;
  return Math.floor((((l % DAY_MS) + DAY_MS) % DAY_MS) / 60_000);
}

/** Local day index of the week's first day (`weekStart`: 0=Sun, 1=Mon). Two
 * keys 7 apart are consecutive weeks. */
export function weekKey(
  ms: number,
  tzOffsetMin: number,
  weekStart: number,
): number {
  const d = localDayIndex(ms, tzOffsetMin);
  const dow = (((d + 4) % 7) + 7) % 7; // 1970-01-01 was a Thursday
  return d - ((dow - weekStart + 7) % 7);
}
