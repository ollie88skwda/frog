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

  it("returns null with no candidates", () => {
    expect(matchExerciseName("bench press", [])).toBeNull();
  });

  it("returns null with an empty query", () => {
    expect(matchExerciseName("", CANDIDATES)).toBeNull();
  });
});
