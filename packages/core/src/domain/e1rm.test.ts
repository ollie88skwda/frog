import { describe, expect, it } from "vitest";
import { e1rmFromEffort, epley, rirFromRpe } from "./e1rm";

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

describe("rirFromRpe", () => {
  it("RPE 10 = 0 RIR, RPE 8 = 2 RIR", () => {
    expect(rirFromRpe(10)).toBe(0);
    expect(rirFromRpe(8)).toBe(2);
  });
  it("clamps below zero", () => {
    expect(rirFromRpe(11)).toBe(0);
  });
});

describe("e1rmFromEffort", () => {
  it("falls back to plain Epley with no effort", () => {
    expect(e1rmFromEffort(100, 5)!).toBeCloseTo(epley(100, 5)!, 6);
  });
  it("projects to failure using RIR (reps + rir)", () => {
    // 100kg x5 @2 RIR ≈ 100kg x7 to failure
    expect(e1rmFromEffort(100, 5, { rir: 2 })!).toBeCloseTo(epley(100, 7)!, 6);
  });
  it("derives RIR from RPE when RIR absent", () => {
    // RPE 8 -> 2 RIR -> same as x7
    expect(e1rmFromEffort(100, 5, { rpe: 8 })!).toBeCloseTo(epley(100, 7)!, 6);
  });
  it("prefers explicit RIR over RPE", () => {
    expect(e1rmFromEffort(100, 5, { rir: 1, rpe: 8 })!).toBeCloseTo(
      epley(100, 6)!,
      6,
    );
  });
  it("null on missing weight or reps", () => {
    expect(e1rmFromEffort(null, 5, { rir: 2 })).toBeNull();
    expect(e1rmFromEffort(100, null, { rir: 2 })).toBeNull();
  });
});
