// C17 display inputs: 7-calendar-day body-weight average (≥4 entries) and the
// weekly rate (both windows need ≥4). TODO(J1): delegate to domain/bodyweight.ts
// (`sevenDayAverage`, `weeklyRatePct`) once J1 merges; same definitions.

const MIN_ENTRIES = 4;
const dayNum = (iso: string): number =>
  Math.floor(Date.parse(`${iso}T00:00:00Z`) / 86_400_000);

export function sevenDayAverage(
  entries: { measuredOn: string; kg: number }[],
  endDay: number,
): { avg: number | null; n: number } {
  const w = entries.filter((e) => {
    const d = dayNum(e.measuredOn);
    return d > endDay - 7 && d <= endDay;
  });
  if (w.length < MIN_ENTRIES) return { avg: null, n: w.length };
  return { avg: w.reduce((a, e) => a + e.kg, 0) / w.length, n: w.length };
}

export function bodyweightSummary(
  entries: { measuredOn: string; kg: number }[] | undefined,
  asOfDay: number,
): { avg7: number | null; weeklyRatePct: number | null; n: number } {
  if (!entries?.length) return { avg7: null, weeklyRatePct: null, n: 0 };
  const cur = sevenDayAverage(entries, asOfDay);
  const prev = sevenDayAverage(entries, asOfDay - 7);
  const rate =
    cur.avg != null && prev.avg != null
      ? ((cur.avg - prev.avg) / prev.avg) * 100
      : null;
  return { avg7: cur.avg, weeklyRatePct: rate, n: cur.n };
}
