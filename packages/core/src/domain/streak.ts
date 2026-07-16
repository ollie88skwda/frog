// Weekly streak + rest-day counter (Hevy-parity plan §C).
// Unit is consecutive calendar WEEKS with ≥1 logged workout. The current week
// keeps the streak alive even before its first workout (it can't be "missed"
// until it ends); back-dating a workout into a missed week repairs the streak
// because everything is recomputed from session dates.

/** Local YYYY-MM-DD for a ms epoch. */
export function localDateKey(ms: number): string {
  const d = new Date(ms);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Start-of-week (local midnight) for a ms epoch. firstWeekday: 0=Sun…6=Sat. */
export function weekStart(ms: number, firstWeekday: number): number {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  const diff = (d.getDay() - firstWeekday + 7) % 7;
  d.setDate(d.getDate() - diff);
  return d.getTime();
}

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export type StreakResult = {
  /** Consecutive weeks with ≥1 workout, counting the current week if logged. */
  weeks: number;
  /** True when the current week has no workout yet (streak at risk). */
  currentWeekPending: boolean;
  /** Whole days since the last workout (0 = trained today), null if never. */
  restDays: number | null;
};

export function computeStreak(
  sessionStarts: number[],
  firstWeekday: number,
  now: number,
): StreakResult {
  if (sessionStarts.length === 0)
    return { weeks: 0, currentWeekPending: true, restDays: null };

  const weeksWithWork = new Set<number>();
  let lastStart = -Infinity;
  for (const t of sessionStarts) {
    // Future-dated sessions (backdating typos) don't count.
    if (t > now) continue;
    weeksWithWork.add(weekStart(t, firstWeekday));
    if (t > lastStart) lastStart = t;
  }
  if (lastStart === -Infinity)
    return { weeks: 0, currentWeekPending: true, restDays: null };

  const currentWeek = weekStart(now, firstWeekday);
  const currentWeekPending = !weeksWithWork.has(currentWeek);

  // Walk backwards week by week from the newest countable week.
  let cursor = currentWeekPending ? currentWeek - WEEK_MS : currentWeek;
  let weeks = 0;
  // Re-derive the week start each step: DST can make a week ≠ exactly 7*24h,
  // so normalize the cursor back onto a true local week boundary.
  cursor = weekStart(cursor + WEEK_MS / 2, firstWeekday);
  while (weeksWithWork.has(cursor)) {
    weeks += 1;
    cursor = weekStart(cursor - WEEK_MS / 2, firstWeekday);
  }

  const msPerDay = 24 * 60 * 60 * 1000;
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const lastDay = new Date(lastStart);
  lastDay.setHours(0, 0, 0, 0);
  const restDays = Math.max(
    0,
    Math.round((today.getTime() - lastDay.getTime()) / msPerDay),
  );

  return { weeks, currentWeekPending, restDays };
}
