import { describe, expect, it } from "vitest";
import {
  conditionConfidence,
  dropConfidence,
  liftConfidence,
  normalCdf,
  tCdf,
  trendConfidence,
  volumeConfidence,
} from "./confidence";
import type { ComparableSession } from "./stall";

const DAY = 86_400_000;

/** n sessions every 3 days; e1RM climbs `rise` per session from 100 plus a
 * deterministic zig-zag of `noise` (fraction). */
function series(n: number, rise: number, noise: number) {
  return Array.from({ length: n }, (_, i) => ({
    day: i * 3,
    e1rm: (100 + rise * i) * (1 + noise * (i % 2 === 0 ? 1 : -1)),
  }));
}
const asComparable = (
  pts: { day: number; e1rm: number }[],
): ComparableSession[] =>
  pts.map((p, i) => ({ sessionId: `s${i}`, at: p.day * DAY, e1rm: p.e1rm }));

describe("cdfs", () => {
  it("normalCdf matches known values", () => {
    expect(normalCdf(0)).toBeCloseTo(0.5, 6);
    expect(normalCdf(1.96)).toBeCloseTo(0.975, 3);
    expect(normalCdf(-1)).toBeCloseTo(0.1587, 3);
  });
  it("tCdf has fatter tails at small df and approaches normal", () => {
    expect(tCdf(2, 3)).toBeLessThan(tCdf(2, 30));
    expect(tCdf(2, 200)).toBeCloseTo(normalCdf(2), 2);
    expect(tCdf(0, 5)).toBeCloseTo(0.5, 6);
  });
});

describe("trendConfidence", () => {
  it("needs two points", () => {
    expect(trendConfidence(series(1, 2, 0), "up")).toBeNull();
  });

  it("is capped and tentative with 3 clean sessions", () => {
    const c = trendConfidence(series(3, 3, 0), "up");
    expect(c).not.toBeNull();
    expect(c?.pct).toBeLessThanOrEqual(75);
    expect(c?.pct).toBeGreaterThan(50);
  });

  it("rises monotonically with more clean sessions (3, 7, 20)", () => {
    const p3 = trendConfidence(series(3, 1, 0.01), "up")?.pct ?? 0;
    const p7 = trendConfidence(series(7, 1, 0.01), "up")?.pct ?? 0;
    const p20 = trendConfidence(series(20, 1, 0.01), "up")?.pct ?? 0;
    expect(p7).toBeGreaterThan(p3);
    expect(p20).toBeGreaterThanOrEqual(p7);
  });

  it("is never 100%", () => {
    const c = trendConfidence(series(20, 5, 0), "up");
    expect(c?.pct).toBe(99);
  });

  it("noisy data is less confident than clean data at the same n", () => {
    const clean = trendConfidence(series(7, 1.5, 0.005), "up")?.pct ?? 0;
    const noisy = trendConfidence(series(7, 1.5, 0.06), "up")?.pct ?? 0;
    expect(clean).toBeGreaterThan(noisy);
  });

  it("a flat series is confident in 'flat' and not in 'up'", () => {
    const pts = series(12, 0, 0.01);
    expect(trendConfidence(pts, "flat")?.pct).toBeGreaterThan(80);
    expect(trendConfidence(pts, "up")?.pct).toBeLessThan(50);
  });

  it("claims are consistent: up + down never exceed 100%", () => {
    const pts = series(6, 1, 0.03);
    const up = trendConfidence(pts, "up")?.pct ?? 0;
    const down = trendConfidence(pts, "down")?.pct ?? 0;
    expect(up + down).toBeLessThanOrEqual(100);
  });

  it("says what would raise it", () => {
    const c = trendConfidence(series(3, 1, 0.02), "up");
    expect(c?.raise).toMatch(/more session|small next to/);
    expect(c?.formula.length).toBeGreaterThan(40);
  });
});

describe("trendConfidence raise text", () => {
  const T1 = [97, 97.5, 98.5, 93, 93.5, 92.5, 87].map((w, i) => ({
    day: i * 3,
    e1rm: w * 1.2,
  }));
  it("says more sessions would lower an 'up' call the fit contradicts", () => {
    const s = trendConfidence(T1, "up");
    expect(s?.level).toBe("low");
    expect(s?.raise).toBe(
      "Your fitted trend points the other way from this call, so more sessions like these would lower it, not raise it.",
    );
  });
  it("keeps the log-more advice when the fit agrees with the claim", () => {
    const s = trendConfidence(
      [100, 103, 106].map((e1rm, i) => ({ day: i * 3, e1rm })),
      "up",
    );
    expect(s?.pct).toBeLessThan(80);
    expect(s?.raise).toMatch(/^Log about \d+ more sessions? of this lift/);
  });
});

describe("liftConfidence", () => {
  it("returns null for a single session", () => {
    expect(
      liftConfidence(asComparable(series(1, 1, 0)), "insufficient"),
    ).toBeNull();
  });
  it("gives a best guess from 2 sessions", () => {
    const r = liftConfidence(asComparable(series(2, 15, 0)), "insufficient");
    expect(r?.claim).toBe("up");
    expect(r?.score.pct).toBeLessThanOrEqual(75);
  });
  it("uses the 7-session status as the claim", () => {
    const r = liftConfidence(asComparable(series(8, 0, 0.01)), "stalled");
    expect(r?.claim).toBe("flat");
  });
  it("a stall on a clear decline claims 'down', not a near-zero 'flat'", () => {
    const w = asComparable(
      [100, 99, 97, 95, 93, 91, 89, 87].map((e1rm, i) => ({
        day: i * 3,
        e1rm,
      })),
    );
    const r = liftConfidence(w, "stalled");
    expect(r?.claim).toBe("down");
    expect(r?.score.pct).toBeGreaterThanOrEqual(50);
  });
  it("a steady +6% before 7 sessions is a 'flat' best guess, not 'up'", () => {
    const w = asComparable(
      [100, 101, 102, 104, 106].map((e1rm, i) => ({ day: i * 3, e1rm })),
    );
    expect(liftConfidence(w, "insufficient")?.claim).toBe("flat");
  });
  it("a +20% climb before 7 sessions is an 'up' best guess", () => {
    const w = asComparable(
      [100, 105, 110, 115, 120].map((e1rm, i) => ({ day: i * 3, e1rm })),
    );
    expect(liftConfidence(w, "insufficient")?.claim).toBe("up");
  });
  it("a stall declining inside the 10% band stays 'flat'", () => {
    const w = asComparable(
      [100, 100, 99, 98, 97, 96, 95, 94].map((e1rm, i) => ({
        day: i * 3,
        e1rm,
      })),
    );
    expect(liftConfidence(w, "stalled")?.claim).toBe("flat");
  });
  it("a level stall still claims 'flat'", () => {
    const r = liftConfidence(asComparable(series(8, 0, 0.01)), "stalled");
    expect(r?.claim).toBe("flat");
    expect(r?.score.pct).toBeGreaterThanOrEqual(50);
  });
  it("honours a dip the status found before 7 sessions", () => {
    const w = asComparable([...series(4, 0, 0.01), { day: 12, e1rm: 80 }]);
    const r = liftConfidence(w, "dropped");
    expect(r?.claim).toBe("drop");
    expect(r?.score).toEqual(dropConfidence(w));
  });
});

describe("dropConfidence", () => {
  const base = (latest: number, noise: number) =>
    asComparable([...series(6, 0, noise), { day: 18, e1rm: latest }]);
  it("needs three prior sessions", () => {
    expect(dropConfidence(asComparable(series(3, 0, 0)))).toBeNull();
  });
  it("a big dip on clean data is likelier real than on noisy data", () => {
    const clean = dropConfidence(base(98.5, 0.002))?.pct ?? 0;
    const noisy = dropConfidence(base(98.5, 0.07))?.pct ?? 0;
    expect(clean).toBeGreaterThan(noisy);
    expect(clean).toBeLessThanOrEqual(75);
  });
  it("no dip is low confidence", () => {
    expect(dropConfidence(base(100, 0.02))?.pct).toBeLessThanOrEqual(50);
  });
});

describe("conditionConfidence", () => {
  it("rises with sample size at the same effect", () => {
    const f = (n: number) =>
      conditionConfidence({
        nHigh: n,
        nLow: n,
        effectSize: 0.9,
        q: 0.001,
        conditionName: "Sleep",
      }).pct;
    expect(f(7)).toBeLessThan(f(20));
  });
  it("is limited by the adjusted p-value", () => {
    const c = conditionConfidence({
      nHigh: 20,
      nLow: 20,
      effectSize: 2,
      q: 0.3,
      conditionName: "Sleep",
    });
    expect(c.pct).toBeLessThanOrEqual(70);
  });
  it("never reaches 100%", () => {
    const c = conditionConfidence({
      nHigh: 50,
      nLow: 50,
      effectSize: 3,
      q: 0,
      conditionName: "Sleep",
    });
    expect(c.pct).toBe(99);
  });
});

describe("volumeConfidence", () => {
  it("one week is capped at 60%", () => {
    expect(volumeConfidence([14])?.score.pct).toBeLessThanOrEqual(60);
  });
  it("steady weeks inside the band get firmer with more weeks", () => {
    const a = volumeConfidence([14, 15, 14])?.score.pct ?? 0;
    const b =
      volumeConfidence(
        Array(8)
          .fill(0)
          .map((_, i) => 14 + (i % 2)),
      )?.score.pct ?? 0;
    expect(b).toBeGreaterThan(a);
  });
  it("labels the claim", () => {
    expect(volumeConfidence([4, 5, 4])?.claim).toBe("below");
    expect(volumeConfidence([25, 26, 24])?.claim).toBe("high");
    expect(volumeConfidence([15, 14, 16])?.claim).toBe("in-band");
  });
  it("null with no data", () => {
    expect(volumeConfidence([])).toBeNull();
  });
});
