import { describe, expect, it } from "vitest";
import { parseSetUtterance } from "./voice-parse";

describe("parseSetUtterance", () => {
  it("parses the canonical example", () => {
    expect(
      parseSetUtterance("rear delt flies 250 lbs for 5 reps", "lb"),
    ).toEqual({
      name: "rear delt flies",
      weightDisplay: 250,
      unit: "lb",
      reps: 5,
    });
  });

  it("parses kg with kilos wording and no trailing 'reps' word", () => {
    expect(parseSetUtterance("deadlift 100 kilos for 3", "lb")).toEqual({
      name: "deadlift",
      weightDisplay: 100,
      unit: "kg",
      reps: 3,
    });
  });

  it("defaults the unit when omitted from speech", () => {
    expect(parseSetUtterance("squat 225 for 3", "kg")).toEqual({
      name: "squat",
      weightDisplay: 225,
      unit: "kg",
      reps: 3,
    });
  });

  it("parses weight-only (no reps mentioned)", () => {
    expect(parseSetUtterance("bicep curl 25 lbs", "kg")).toEqual({
      name: "bicep curl",
      weightDisplay: 25,
      unit: "lb",
      reps: null,
    });
  });

  it("parses reps-only (no weight mentioned)", () => {
    expect(parseSetUtterance("pull ups for 10 reps", "kg")).toEqual({
      name: "pull ups",
      weightDisplay: null,
      unit: "kg",
      reps: 10,
    });
  });

  it("returns null for garbage with no numbers", () => {
    expect(
      parseSetUtterance("how much wood would a woodchuck chuck", "kg"),
    ).toBeNull();
  });

  it("returns null for empty input", () => {
    expect(parseSetUtterance("   ", "kg")).toBeNull();
  });
});
