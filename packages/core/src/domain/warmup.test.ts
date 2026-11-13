import { describe, expect, it } from "vitest";
import { DEFAULT_WARMUP_METHOD, warmupPlan, warmupSets } from "./warmup";

describe("warm-ups (R17b)", () => {
  it("default is 40% x 6 then 80% x 3", () => {
    expect(DEFAULT_WARMUP_METHOD).toEqual([
      { pct: 0.4, reps: 6 },
      { pct: 0.8, reps: 3 },
    ]);
    expect(warmupSets(100)).toEqual([
      { weightKg: 40, reps: 6 },
      { weightKg: 80, reps: 3 },
    ]);
  });
  it("first heavy lift = full ramp, later main = one 60-70% step, isolation = none", () => {
    expect(warmupPlan(100, "first_heavy")).toHaveLength(2);
    const later = warmupPlan(100, "later_main");
    expect(later).toHaveLength(1);
    expect(later[0].weightKg).toBeGreaterThanOrEqual(60);
    expect(later[0].weightKg).toBeLessThanOrEqual(70);
    expect(warmupPlan(100, "isolation")).toEqual([]);
  });
  it("a saved custom method is honoured for the first heavy lift", () => {
    expect(warmupPlan(100, "first_heavy", [{ pct: 0.5, reps: 5 }])).toEqual([
      { weightKg: 50, reps: 5 },
    ]);
  });
  it("no working weight, no warm-ups", () => {
    expect(warmupSets(0)).toEqual([]);
  });
});
