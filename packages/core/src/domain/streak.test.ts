import { describe, expect, it } from "vitest";
import { computeStreak, localDateKey, weekStart } from "./streak";

// Mon 2026-07-13 12:00 local
const MON = new Date(2026, 6, 13, 12, 0, 0).getTime();
const DAY = 24 * 60 * 60 * 1000;

describe("weekStart", () => {
  it("snaps to the configured first weekday", () => {
    // Monday-start week: Mon 12:00 → Mon 00:00
    const monMidnight = new Date(2026, 6, 13).getTime();
    expect(weekStart(MON, 1)).toBe(monMidnight);
    // Sunday-start week: Mon → previous Sunday
    expect(weekStart(MON, 0)).toBe(new Date(2026, 6, 12).getTime());
  });
});

describe("computeStreak", () => {
  it("empty history → no streak, no rest days", () => {
    expect(computeStreak([], 1, MON)).toEqual({
      weeks: 0,
      currentWeekPending: true,
      restDays: null,
    });
  });

  it("counts consecutive weeks including the current one", () => {
    const starts = [MON, MON - 7 * DAY, MON - 14 * DAY];
    const r = computeStreak(starts, 1, MON);
    expect(r.weeks).toBe(3);
    expect(r.currentWeekPending).toBe(false);
    expect(r.restDays).toBe(0);
  });

  it("current week without a workout keeps the prior streak (pending)", () => {
    const starts = [MON - 7 * DAY, MON - 14 * DAY];
    const r = computeStreak(starts, 1, MON);
    expect(r.weeks).toBe(2);
    expect(r.currentWeekPending).toBe(true);
    expect(r.restDays).toBe(7);
  });

  it("a fully missed week breaks the streak", () => {
    const starts = [MON, MON - 14 * DAY]; // gap: last week empty
    const r = computeStreak(starts, 1, MON);
    expect(r.weeks).toBe(1);
  });

  it("backdating into the missed week repairs the streak", () => {
    // [this week, two weeks ago] is broken (streak 1); backdating a session
    // into last week (MON − 7d falls inside it) repairs it to 3.
    const starts = [MON, MON - 14 * DAY, MON - 7 * DAY];
    expect(computeStreak(starts, 1, MON).weeks).toBe(3);
  });

  it("future-dated sessions don't count", () => {
    const r = computeStreak([MON + 30 * DAY], 1, MON);
    expect(r.weeks).toBe(0);
    expect(r.restDays).toBe(null);
  });
});

describe("localDateKey", () => {
  it("formats local dates", () => {
    expect(localDateKey(new Date(2026, 0, 2, 8).getTime())).toBe("2026-01-02");
  });
});
