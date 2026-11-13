import { describe, expect, it } from "vitest";
import {
  bhAdjust,
  cohensD,
  detrend,
  permutationP,
  thresholdSplit,
} from "./stats";

describe("findings/stats", () => {
  it("cohensD", () => {
    expect(cohensD([10, 11, 12], [10, 11, 12])).toBe(0);
    expect(cohensD([1, 2, 3, 4, 5], [3, 4, 5, 6, 7])).toBeCloseTo(-1.265, 3);
    expect(cohensD([1], [1, 2])).toBeNull();
    expect(cohensD([2, 2], [2, 2])).toBeNull();
  });
  it("permutationP is deterministic and sensible", () => {
    const same = permutationP([1, 2, 3, 4, 5, 6], [1, 2, 3, 4, 5, 6]);
    expect(same).toBeGreaterThan(0.9);
    const far = permutationP([1, 2, 3, 4, 5, 6], [20, 21, 22, 23, 24, 25]);
    expect(far).toBeLessThan(0.02);
    expect(permutationP([1, 2, 3], [4, 5, 9])).toBe(
      permutationP([1, 2, 3], [4, 5, 9]),
    );
  });
  it("bhAdjust", () => {
    const q = bhAdjust([0.01, 0.04, 0.03]);
    expect(q[0]).toBeCloseTo(0.03, 6);
    expect(q[1]).toBeCloseTo(0.04, 6);
    expect(q[2]).toBeCloseTo(0.04, 6);
  });
  it("detrend removes a pure line", () => {
    const r = detrend(
      [0, 1, 2, 3, 4].map((d) => ({ day: d, value: 100 + 2 * d })),
    );
    for (const p of r) expect(p.resid).toBeCloseTo(0, 9);
  });
  it("thresholdSplit puts the flagged side in high", () => {
    const items = [5, 6, 7, 8].map((v) => ({ value: v, item: v }));
    expect(thresholdSplit(items, 6, "below")).toEqual({
      high: [5],
      low: [6, 7, 8],
    });
    expect(thresholdSplit(items, 7, "atLeast")).toEqual({
      high: [7, 8],
      low: [5, 6],
    });
  });
});
