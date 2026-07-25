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
      unitExplicit: true,
      reps: 5,
    });
  });

  it("parses kg with kilos wording and no trailing 'reps' word", () => {
    expect(parseSetUtterance("deadlift 100 kilos for 3", "lb")).toEqual({
      name: "deadlift",
      weightDisplay: 100,
      unit: "kg",
      unitExplicit: true,
      reps: 3,
    });
  });

  it("defaults the unit when omitted from speech and flags it implicit", () => {
    expect(parseSetUtterance("squat 225 for 3", "kg")).toEqual({
      name: "squat",
      weightDisplay: 225,
      unit: "kg",
      unitExplicit: false,
      reps: 3,
    });
  });

  it("parses reps without a connector word", () => {
    expect(parseSetUtterance("bench press 225 8", "lb")).toEqual({
      name: "bench press",
      weightDisplay: 225,
      unit: "lb",
      unitExplicit: false,
      reps: 8,
    });
  });

  it("parses reps without a connector word after a unit word", () => {
    expect(parseSetUtterance("bench press 225 lbs 8 reps", "kg")).toEqual({
      name: "bench press",
      weightDisplay: 225,
      unit: "lb",
      unitExplicit: true,
      reps: 8,
    });
  });

  it("still prefers the connector interpretation when one is spoken", () => {
    expect(parseSetUtterance("squat 5 x 5", "kg")).toEqual({
      name: "squat",
      weightDisplay: 5,
      unit: "kg",
      unitExplicit: false,
      reps: 5,
    });
  });

  it("parses weight-only (no reps mentioned)", () => {
    expect(parseSetUtterance("bicep curl 25 lbs", "kg")).toEqual({
      name: "bicep curl",
      weightDisplay: 25,
      unit: "lb",
      unitExplicit: true,
      reps: null,
    });
  });

  it("parses reps-only (no weight mentioned)", () => {
    expect(parseSetUtterance("pull ups for 10 reps", "kg")).toEqual({
      name: "pull ups",
      weightDisplay: null,
      unit: "kg",
      unitExplicit: false,
      reps: 10,
    });
  });

  it("does not read a trailing bare 'reps' word as weight-only", () => {
    expect(parseSetUtterance("bench press 225 reps", "kg")).toBeNull();
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
