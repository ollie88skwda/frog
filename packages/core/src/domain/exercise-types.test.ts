import { describe, expect, it } from "vitest";
import {
  isWeightRequired,
  LATERALITY,
  LATERALITY_LABELS,
  MECHANIC_LABELS,
  MECHANICS,
  MOVEMENT_PATTERN_LABELS,
  MOVEMENT_PATTERNS,
} from "./exercise-types";

describe("mechanic / movement-pattern / laterality vocab", () => {
  it("every value has a label", () => {
    for (const m of MECHANICS) expect(MECHANIC_LABELS[m]).toBeTruthy();
    for (const p of MOVEMENT_PATTERNS)
      expect(MOVEMENT_PATTERN_LABELS[p]).toBeTruthy();
    for (const l of LATERALITY) expect(LATERALITY_LABELS[l]).toBeTruthy();
  });
});

describe("isWeightRequired", () => {
  it("requires a weight for weight-bearing types", () => {
    expect(isWeightRequired("weight_reps", "barbell")).toBe(true);
    expect(isWeightRequired("weight_reps", null)).toBe(true);
    expect(isWeightRequired("weighted_bodyweight", "bodyweight")).toBe(true);
    expect(isWeightRequired("assisted_bodyweight", "machine")).toBe(true);
  });
  it("lets bodyweight / no-load exercises save without one", () => {
    expect(isWeightRequired("bodyweight_reps", "bodyweight")).toBe(false);
    expect(isWeightRequired("weight_reps", "bodyweight")).toBe(false);
    expect(isWeightRequired("duration", null)).toBe(false);
  });
});
