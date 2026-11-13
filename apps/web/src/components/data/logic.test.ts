import { describe, expect, it } from "vitest";
import {
  confidenceFrom,
  deltaState,
  meterStatus,
  saveStateFrom,
  sparkGeometry,
} from "./logic";

describe("deltaState (C2c noise band)", () => {
  it("inside the band is neutral, never colored", () => {
    expect(deltaState(0.04, 0.1)).toBe("noise");
    expect(deltaState(-0.099, 0.1)).toBe("noise");
  });
  it("outside the band follows the good direction; bad is amber not red", () => {
    expect(deltaState(0.12, 0.1)).toBe("good");
    expect(deltaState(-0.12, 0.1)).toBe("attn");
    expect(deltaState(-0.12, 0.1, "down")).toBe("good");
  });
  it("direction-less metrics never color", () => {
    expect(deltaState(0.5, 0.1, "none")).toBe("noise");
    expect(deltaState(Number.NaN, 0.1)).toBe("none");
  });
});

describe("meterStatus (R6/R18b, F3)", () => {
  it("maps weekly hard sets to a status", () => {
    expect(meterStatus(4)).toBe("low");
    expect(meterStatus(8)).toBe("below");
    expect(meterStatus(10.5)).toBe("in-band");
    expect(meterStatus(17.5)).toBe("in-band");
    expect(meterStatus(20)).toBe("in-band");
    expect(meterStatus(20.5)).toBe("high");
  });
});

describe("confidenceFrom", () => {
  it("below min-n is zero dots with the n shown", () => {
    expect(confidenceFrom({ n: 3, minN: 7 })).toEqual({
      level: 0,
      label: "Not enough yet (3 of 7 sessions)",
    });
  });
  it("caps by tier and noise", () => {
    expect(confidenceFrom({ n: 20, minN: 7, tier: 2 }).level).toBe(3);
    expect(confidenceFrom({ n: 20, minN: 7, tier: 4 }).level).toBe(2);
    expect(confidenceFrom({ n: 20, minN: 7, tier: 5 }).level).toBe(1);
    expect(
      confidenceFrom({ n: 20, minN: 7, tier: 1, exceedsNoise: false }).level,
    ).toBe(2);
  });
});

describe("saveStateFrom (F15)", () => {
  it("queued until success, failed on error", () => {
    expect(saveStateFrom({ status: "pending", isPaused: true })).toBe("queued");
    expect(saveStateFrom({ status: "success" })).toBe("saved");
    expect(saveStateFrom({ status: "error" })).toBe("failed");
  });
});

describe("sparkGeometry", () => {
  it("returns nothing for no data and never draws missing as zero", () => {
    expect(sparkGeometry([null, null], 64, 24).last).toBeNull();
  });
  it("breaks at gaps >1 and bridges a single gap dashed", () => {
    const g = sparkGeometry([1, 2, null, 3, null, null, 4], 64, 24);
    expect(g.bridges).toHaveLength(1);
    expect(g.segments).toHaveLength(3);
  });
  it("band rect sits inside the box", () => {
    const g = sparkGeometry([10, 12, 11], 64, 24, [10, 12]);
    expect(g.band?.h).toBeGreaterThan(0);
  });
});
