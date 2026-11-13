import { describe, expect, it } from "vitest";
import {
  brzycki,
  e1rmOfSet,
  e1rmSet,
  epley,
  rirFromRpe,
  rirMidpoint,
  roundE1rmDisplay,
  sessionE1rm,
} from "./e1rm";

describe("brzycki (C2c-e1rm)", () => {
  it("matches the worked values", () => {
    expect(brzycki(100, 1)).toBeCloseTo(100, 6);
    expect(brzycki(100, 5)).toBeCloseTo(112.5, 6);
    expect(brzycki(100, 10)).toBeCloseTo(133.333, 3);
  });
  it("null when undefined", () => {
    expect(brzycki(0, 5)).toBeNull();
    expect(brzycki(100, 0)).toBeNull();
    expect(brzycki(100, 37)).toBeNull();
  });
});

describe("e1rmSet", () => {
  it("100 kg x 8 @ 2 RIR -> total 10 -> 133.3 (F2 acceptance)", () => {
    const r = e1rmSet(100, 8, 2);
    expect(r.value).toBeCloseTo(133.333, 3);
    expect(r.quality).toBe("ok");
    expect(r.flagged).toBe(false);
  });
  it("refuses over 10 total reps (flagged, no value)", () => {
    const r = e1rmSet(100, 9, 2);
    expect(r.value).toBeNull();
    expect(r.flagged).toBe(true);
    expect(r.quality).toBe("over_10_total_reps");
    expect(e1rmSet(100, 12, 0).value).toBeNull();
  });
  it("missing RIR is assumed 0 and flagged noRir", () => {
    const r = e1rmSet(100, 5, null);
    expect(r.value).toBeCloseTo(112.5, 6);
    expect(r.noRir).toBe(true);
    expect(r.quality).toBe("assumed_rir0");
  });
  it("uses the RIR range midpoint", () => {
    // 5 reps + 1.5 = 6.5 -> 100 x 36 / 30.5
    expect(e1rmSet(100, 5, { rirMin: 1, rirMax: 2 }).value).toBeCloseTo(
      118.03,
      2,
    );
  });
  it("derives RIR from RPE, explicit RIR wins", () => {
    expect(e1rmSet(100, 5, { rpe: 8 }).value).toBeCloseTo(120, 6);
    expect(e1rmSet(100, 5, { rir: 1, rpe: 8 }).value).toBeCloseTo(
      (100 * 36) / 31,
      6,
    );
  });
  it("invalid without load or reps", () => {
    expect(e1rmSet(0, 5, 2).quality).toBe("invalid");
    expect(e1rmSet(100, 0, 2).quality).toBe("invalid");
    expect(e1rmSet(null, 5, 2).value).toBeNull();
  });
  it("e1rmOfSet reads a stored set", () => {
    expect(e1rmOfSet({ weightKg: 100, reps: 6, rir: 2 }).value).toBeCloseTo(
      124.1379,
      3,
    );
  });
  it("coach worked examples: 100x6@2 = 124.14, 102.5x5@2 = 123.00", () => {
    expect(e1rmSet(100, 6, 2).value).toBeCloseTo(124.14, 2);
    expect(e1rmSet(102.5, 5, 2).value).toBeCloseTo(123.0, 2);
    expect(e1rmSet(90, 5, 2).value).toBeCloseTo(108.0, 2);
  });
});

describe("rounding and helpers", () => {
  it("display rounds to 0.5 kg", () => {
    expect(roundE1rmDisplay(112.26)).toBe(112.5);
    expect(roundE1rmDisplay(112.24)).toBe(112);
  });
  it("rirMidpoint", () => {
    expect(rirMidpoint({ rirMin: 0, rirMax: 1 })).toBe(0.5);
    expect(rirMidpoint({ rir: 3 })).toBe(3);
    expect(rirMidpoint({})).toBeNull();
    expect(rirFromRpe(8)).toBe(2);
    expect(rirFromRpe(11)).toBe(0);
  });
});

describe("sessionE1rm", () => {
  it("max over usable sets; back-off never wins", () => {
    const top = e1rmSet(100, 6, 2);
    const back = e1rmSet(90, 7, 2);
    expect(back.value as number).toBeLessThan(top.value as number);
    expect(sessionE1rm([back, top])).toBeCloseTo(124.14, 2);
  });
  it("skips flagged sets", () => {
    expect(sessionE1rm([e1rmSet(100, 15, 0)])).toBeNull();
  });
  it("excludes sets at or under 25% of baseline (C9b)", () => {
    const light = e1rmSet(30, 8, 2);
    expect(sessionE1rm([light], { baselineE1rm: 120 })).toBeNull();
    expect(sessionE1rm([light], { baselineE1rm: 100 })).not.toBeNull();
  });
});

describe("legacy epley", () => {
  it("still computes for legacy web callers", () => {
    expect(epley(100, 5)).toBeCloseTo(116.667, 3);
    expect(epley(0, 5)).toBeNull();
  });
});
