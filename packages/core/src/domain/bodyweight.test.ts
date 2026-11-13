import { describe, expect, it } from "vitest";
import { bodyweightAverage7d, weeklyBodyweightRatePct } from "./bodyweight";

const DAY = 86_400_000;
const NOW = Date.UTC(2026, 10, 12, 12);
const e = (daysAgo: number, kg: number) => ({ at: NOW - daysAgo * DAY, kg });

describe("bodyweightAverage7d (C17)", () => {
  it("4 entries in 7 days average to 80.0", () => {
    const r = bodyweightAverage7d(
      [e(0, 80), e(1, 80.4), e(3, 79.6), e(5, 80)],
      NOW,
    );
    expect(r.kg as number).toBeCloseTo(80, 6);
    expect(r.n).toBe(4);
  });
  it("Case 5: 3 entries -> no average", () => {
    expect(
      bodyweightAverage7d([e(0, 80), e(1, 80), e(2, 80)], NOW).kg,
    ).toBeNull();
  });
  it("window is half-open: an entry exactly 7 days back is excluded", () => {
    const r = bodyweightAverage7d(
      [e(7, 100), e(0, 80), e(1, 80), e(2, 80), e(3, 80)],
      NOW,
    );
    expect(r.n).toBe(4);
    expect(r.kg).toBe(80);
  });
});

describe("weeklyBodyweightRatePct", () => {
  const week = (start: number, kg: number) =>
    [0, 1, 2, 3].map((i) => e(start + i, kg));
  it("80 -> 79.2 is -1.0%", () => {
    const r = weeklyBodyweightRatePct(
      [...week(0, 79.2), ...week(7.5, 80)],
      NOW,
    );
    expect(r as number).toBeCloseTo(-1.0, 6);
  });
  it("null unless both windows have 4+ entries", () => {
    expect(weeklyBodyweightRatePct(week(0, 80), NOW)).toBeNull();
    expect(
      weeklyBodyweightRatePct(
        [...week(0, 79), ...week(7.5, 80).slice(0, 3)],
        NOW,
      ),
    ).toBeNull();
  });
});
