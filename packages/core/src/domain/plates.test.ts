import { describe, expect, it } from "vitest";
import { platesFor } from "./plates";
import {
  adjustRest,
  restRemainingSec,
  shouldStartRest,
  startRest,
} from "./rest-timer";
import {
  DEFAULT_WARMUP_METHOD,
  DEFAULT_WARMUP_ROUNDING,
  warmupSets,
} from "./warmup";

describe("platesFor", () => {
  it("builds the per-side stack greedily", () => {
    // 100kg target, 20kg bar → 40/side → 25+10+5
    const r = platesFor(100, 20, [25, 20, 10, 5, 2.5]);
    expect(r).toEqual({ exact: true, perSide: [25, 10, 5] });
  });

  it("reports the closest achievable weight when unbuildable", () => {
    // 50lb target, 20lb bar → 15/side from 35/25/10/5 → 10+5 exact? yes.
    // Make it unbuildable: 52 target → 16/side, plates 35/25/10/5 → 15 → 50.
    const r = platesFor(52, 20, [35, 25, 10, 5]);
    expect(r.exact).toBe(false);
    if (!r.exact) expect(r.closest).toBe(50);
  });

  it("target below bar weight", () => {
    const r = platesFor(15, 20, [25, 10, 5]);
    expect(r.exact).toBe(false);
    if (!r.exact) expect(r.closest).toBe(20);
  });
});

describe("warmupSets", () => {
  it("generates the default ramp rounded to the barbell step", () => {
    const sets = warmupSets(
      100,
      DEFAULT_WARMUP_METHOD,
      DEFAULT_WARMUP_ROUNDING,
    );
    expect(sets).toEqual([
      { weightKg: 40, reps: 8 },
      { weightKg: 60, reps: 5 },
      { weightKg: 80, reps: 3 },
    ]);
  });

  it("uses the dumbbell step for dumbbells", () => {
    const sets = warmupSets(
      30,
      [{ pct: 0.5, reps: 5 }],
      DEFAULT_WARMUP_ROUNDING,
      "dumbbell",
    );
    expect(sets).toEqual([{ weightKg: 16, reps: 5 }]);
  });

  it("never rounds below one step and rejects nonpositive weights", () => {
    expect(warmupSets(0)).toEqual([]);
    const sets = warmupSets(4, [{ pct: 0.4, reps: 8 }]);
    expect(sets[0].weightKg).toBe(2.5);
  });
});

describe("rest timer", () => {
  it("counts down with ±15s adjustments", () => {
    const t0 = 1_000_000;
    let t = startRest(90, t0);
    expect(restRemainingSec(t, t0 + 10_000)).toBe(80);
    t = adjustRest(t, 15);
    expect(restRemainingSec(t, t0 + 10_000)).toBe(95);
    t = adjustRest(t, -30);
    expect(restRemainingSec(t, t0 + 10_000)).toBe(65);
  });

  it("suppressed before drop sets and without a target", () => {
    expect(shouldStartRest(90, "drop")).toBe(false);
    expect(shouldStartRest(0, "normal")).toBe(false);
    expect(shouldStartRest(null, "normal")).toBe(false);
    expect(shouldStartRest(90, "normal")).toBe(true);
    expect(shouldStartRest(90, null)).toBe(true);
  });
});
