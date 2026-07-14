import { describe, expect, it } from "vitest";
import { isOutlier, robustTrend } from "./progression";

describe("progression", () => {
  it("needs >=5 sessions", () => {
    const r = robustTrend([
      { day: 0, e1rm: 100 },
      { day: 7, e1rm: 101 },
    ]);
    expect(r.verdict).toBe("INSUFFICIENT");
  });
  it("flags steady increase as PROGRESSING", () => {
    const pts = [0, 7, 14, 21, 28, 35].map((d, i) => ({
      day: d,
      e1rm: 100 + i * 5,
    }));
    expect(robustTrend(pts).verdict).toBe("PROGRESSING");
  });
  it("flags decline as REGRESSING", () => {
    const pts = [0, 7, 14, 21, 28, 35].map((d, i) => ({
      day: d,
      e1rm: 200 - i * 8,
    }));
    expect(robustTrend(pts).verdict).toBe("REGRESSING");
  });
  it("is robust to a single bad-data spike", () => {
    // one implausible 1000 entry must not flip the verdict
    const pts = [
      { day: 0, e1rm: 100 },
      { day: 7, e1rm: 102 },
      { day: 14, e1rm: 1000 },
      { day: 21, e1rm: 104 },
      { day: 28, e1rm: 106 },
      { day: 35, e1rm: 108 },
    ];
    expect(robustTrend(pts).verdict).toBe("PROGRESSING");
  });
  it("detects MAD outliers", () => {
    expect(isOutlier([20, 21, 19, 22, 20, 158], 158)).toBe(true);
    expect(isOutlier([20, 21, 19, 22, 20], 21)).toBe(false);
  });
});
