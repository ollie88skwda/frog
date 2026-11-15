import { describe, expect, it } from "vitest";
import { formatWeight, kgToLb, lbToKg, toDisplayWeight } from "./units";

describe("units", () => {
  it("converts lb to kg", () => {
    expect(lbToKg(100)).toBeCloseTo(45.359237, 5);
  });
  it("round-trips", () => {
    expect(kgToLb(lbToKg(225))).toBeCloseTo(225, 6);
  });
  it("display rounds to 0.5", () => {
    expect(toDisplayWeight(45.359237, "lb")).toBe(100);
  });
  it("formats with unit", () => {
    expect(formatWeight(82.55, "kg")).toBe("82.5 kg");
  });
});
