// Google Takeout Fitbit sleep files: each `sleep-YYYY-MM-DD.json` is a JSON
// array of night objects. We use dateOfSleep (the morning the sleep ended,
// matching "last night's sleep" for a session that day), minutesAsleep, and
// prefer the main sleep over naps.

type SleepEntry = {
  dateOfSleep?: string; // "2026-06-19"
  minutesAsleep?: number;
  mainSleep?: boolean;
  isMainSleep?: boolean;
};

/** One Takeout sleep JSON file → per-date best entry. */
function entriesOf(text: string): SleepEntry[] {
  const parsed = JSON.parse(text);
  if (!Array.isArray(parsed))
    throw new Error("not a Takeout sleep file (expected a JSON array)");
  return parsed as SleepEntry[];
}

/**
 * Merge one or more Takeout sleep files into `date → hours asleep`.
 * Prefers the main sleep for a date; falls back to the longest entry.
 */
export function parseFitbitSleep(fileTexts: string[]): Map<string, number> {
  const best = new Map<string, { minutes: number; main: boolean }>();
  for (const text of fileTexts) {
    for (const entry of entriesOf(text)) {
      const date = entry.dateOfSleep;
      const minutes = entry.minutesAsleep;
      if (!date || typeof minutes !== "number" || minutes <= 0) continue;
      const main = entry.mainSleep === true || entry.isMainSleep === true;
      const current = best.get(date);
      const wins =
        !current ||
        (main && !current.main) ||
        (main === current.main && minutes > current.minutes);
      if (wins) best.set(date, { minutes, main });
    }
  }
  const hours = new Map<string, number>();
  for (const [date, { minutes }] of best) {
    hours.set(date, Math.round((minutes / 60) * 10) / 10);
  }
  return hours;
}
