import { describe, expect, it } from "vitest";
import { epley } from "./e1rm";

describe("epley", () => {
  it("computes 1RM (Epley)", () => {
    expect(epley(100, 5)!).toBeCloseTo(116.667, 3);
  });
  it("equals weight at 1 rep window", () => {
    expect(epley(100, 0)).toBeNull();
  });
  it("null on missing", () => {
    expect(epley(0, 5)).toBeNull();
  });
});
