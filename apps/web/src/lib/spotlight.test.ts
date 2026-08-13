import { describe, expect, it } from "vitest";
import { compareToLast, rirSegmentOf, segmentToFields } from "./spotlight";

describe("rirSegmentOf", () => {
  it("reads an empty pair as no segment", () => {
    expect(rirSegmentOf("", "")).toBeNull();
  });

  it("reads a legacy scalar (min===max) as that segment", () => {
    expect(rirSegmentOf("2", "2")).toBe(2);
    expect(rirSegmentOf("0", "0")).toBe(0);
  });

  it("reads a min-only value under 4 as that segment", () => {
    expect(rirSegmentOf("3", "")).toBe(3);
  });

  it("reads any min ≥ 4 as the open-ended 4+ segment", () => {
    expect(rirSegmentOf("4", "")).toBe(4);
    expect(rirSegmentOf("6", "")).toBe(4);
  });

  it("reads an asymmetric range under 4 as no single segment", () => {
    expect(rirSegmentOf("1", "3")).toBeNull();
  });
});

describe("segmentToFields", () => {
  it("writes a zero-width min/max pair for 0-3", () => {
    expect(segmentToFields(2)).toEqual({ min: "2", max: "2" });
  });

  it("writes an open-ended range (no max) for 4+", () => {
    expect(segmentToFields(4)).toEqual({ min: "4", max: "" });
  });

  it("round-trips through rirSegmentOf for every segment", () => {
    for (const v of [0, 1, 2, 3, 4]) {
      const { min, max } = segmentToFields(v);
      expect(rirSegmentOf(min, max)).toBe(v);
    }
  });
});

describe("compareToLast", () => {
  it("reports no last data when there's nothing to compare against", () => {
    expect(compareToLast(100, null, "kg")).toEqual({
      text: "no last data",
      state: "none",
    });
  });

  it("reports same as last when the field is still empty", () => {
    expect(compareToLast(null, 85, "kg")).toEqual({
      text: "same as last",
      state: "none",
    });
  });

  it("reports same as last when the values match exactly", () => {
    expect(compareToLast(85, 85, "kg")).toEqual({
      text: "same as last",
      state: "same",
    });
  });

  it("reports a positive delta with the unit suffix as up", () => {
    expect(compareToLast(90, 85, "kg")).toEqual({
      text: "▲ +5 kg on last",
      state: "up",
    });
  });

  it("reports a negative delta as down, magnitude only", () => {
    expect(compareToLast(80, 85, "kg")).toEqual({
      text: "▼ −5 kg on last",
      state: "down",
    });
  });

  it("omits the unit suffix for a unitless field (reps)", () => {
    expect(compareToLast(6, 5, "")).toEqual({
      text: "▲ +1 on last",
      state: "up",
    });
  });

  it("rounds a fractional delta to one decimal", () => {
    expect(compareToLast(87.55, 85, "kg")).toEqual({
      text: "▲ +2.5 kg on last",
      state: "up",
    });
  });
});
