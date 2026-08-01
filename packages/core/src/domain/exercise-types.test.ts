import { describe, expect, it } from "vitest";
import {
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
