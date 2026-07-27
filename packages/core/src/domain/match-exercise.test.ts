import { describe, expect, it } from "vitest";
import {
  MATCH_CONFIDENCE_THRESHOLD,
  matchExerciseName,
  normalizeExerciseName,
} from "./match-exercise";

const CANDIDATES = [
  { id: "1", name: "Rear Delt Flyes" },
  { id: "2", name: "Bench Press" },
  { id: "3", name: "Pull Ups" },
];

describe("normalizeExerciseName", () => {
  it("lowercases and strips punctuation", () => {
    expect(normalizeExerciseName("Rear-Delt  Flyes!")).toBe("rear delt flyes");
  });
});

describe("matchExerciseName", () => {
  it("picks the exact match", () => {
    const match = matchExerciseName("bench press", CANDIDATES);
    expect(match?.id).toBe("2");
    expect(match?.score).toBe(1);
  });

  it("tolerates a wording variant above the confidence threshold", () => {
    const match = matchExerciseName("rear delt flies", CANDIDATES);
    expect(match?.id).toBe("1");
    expect(match?.score).toBeGreaterThanOrEqual(MATCH_CONFIDENCE_THRESHOLD);
  });

  it("matches a spoken plural against a singular candidate", () => {
    const match = matchExerciseName("squats", [{ id: "9", name: "Squat" }]);
    expect(match?.id).toBe("9");
    expect(match?.score).toBe(1);
  });

  it("matches a spoken singular against a plural candidate", () => {
    const match = matchExerciseName("pull up", CANDIDATES);
    expect(match?.id).toBe("3");
    expect(match?.score).toBe(1);
  });

  it("scores an unrelated name low", () => {
    const match = matchExerciseName("banana smoothie", CANDIDATES);
    expect(match?.score).toBeLessThan(MATCH_CONFIDENCE_THRESHOLD);
  });

  it("keeps a single shared token out of two words below the threshold", () => {
    const match = matchExerciseName("incline press", CANDIDATES);
    expect(match?.id).toBe("2");
    expect(match?.score).toBeLessThan(MATCH_CONFIDENCE_THRESHOLD);
  });

  it("accepts a one-word shorthand contained in exactly one candidate", () => {
    const match = matchExerciseName("bench", CANDIDATES);
    expect(match?.id).toBe("2");
    expect(match?.score).toBeGreaterThanOrEqual(MATCH_CONFIDENCE_THRESHOLD);
    expect(match?.tied).toHaveLength(1);
  });

  it("does not accept a one-word shorthand shared by two candidates", () => {
    const match = matchExerciseName("press", [
      { id: "2", name: "Bench Press" },
      { id: "4", name: "Overhead Press" },
    ]);
    expect(match?.score).toBeLessThan(MATCH_CONFIDENCE_THRESHOLD);
  });

  it("reports every block tied at the top score as ambiguous", () => {
    const match = matchExerciseName("bench press", [
      { id: "2", name: "Bench Press" },
      { id: "3", name: "Pull Ups" },
      { id: "5", name: "Bench Press" },
    ]);
    expect(match?.score).toBe(1);
    expect(match?.tied.map((c) => c.id)).toEqual(["2", "5"]);
  });

  it("leaves a single unambiguous match untied", () => {
    expect(matchExerciseName("bench press", CANDIDATES)?.tied).toHaveLength(1);
  });

  it("returns null with no candidates", () => {
    expect(matchExerciseName("bench press", [])).toBeNull();
  });

  it("returns null with an empty query", () => {
    expect(matchExerciseName("", CANDIDATES)).toBeNull();
  });
});
