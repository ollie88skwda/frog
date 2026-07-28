import { describe, expect, it } from "vitest";
import { matchExerciseName, sameExerciseName } from "./match-exercise";

const CANDIDATES = [
  { id: "1", name: "Barbell Bench Press" },
  { id: "2", name: "Incline Dumbbell Press" },
  { id: "3", name: "Triceps Pushdown" },
  { id: "4", name: "Back Squat" },
  { id: "5", name: "Seated Row" },
];

describe("matchExerciseName", () => {
  it("matches an exact name case-insensitively", () => {
    expect(matchExerciseName("incline dumbbell press", CANDIDATES)?.id).toBe(
      "2",
    );
  });

  it("matches via substring containment", () => {
    expect(matchExerciseName("bench press", CANDIDATES)?.id).toBe("1");
  });

  it("matches across a trailing-plural mismatch via token overlap", () => {
    expect(matchExerciseName("tricep pushdown", CANDIDATES)?.id).toBe("3");
  });

  it("ignores punctuation and extra whitespace", () => {
    expect(matchExerciseName("  Back-Squat!!  ", CANDIDATES)?.id).toBe("4");
  });

  it("returns null when nothing clears the confidence threshold", () => {
    expect(matchExerciseName("kettlebell snatch", CANDIDATES)).toBeNull();
  });

  it("does not substring-match inside a longer word (word-boundary aware)", () => {
    const candidates = [
      { id: "1", name: "Narrow Grip Pulldown" },
      { id: "2", name: "Seated Row" },
    ];
    expect(matchExerciseName("row", candidates)?.id).toBe("2");
  });

  it("does not inflate the score when a candidate repeats a query token", () => {
    const repeated = [{ id: "9", name: "Row Row Row Machine" }];
    expect(matchExerciseName("row boat", repeated)).toBeNull();
  });

  it("breaks a containment tie by closeness, not library order", () => {
    const wide = { id: "1", name: "Barbell Bent Over Row" };
    const close = { id: "2", name: "Cable Row" };
    expect(matchExerciseName("row", [wide, close])?.id).toBe("2");
    expect(matchExerciseName("row", [close, wide])?.id).toBe("2");
  });

  it("returns null for an empty or whitespace-only query", () => {
    expect(matchExerciseName("   ", CANDIDATES)).toBeNull();
  });

  it("returns null against an empty candidate list", () => {
    expect(matchExerciseName("bench press", [])).toBeNull();
  });
});

describe("sameExerciseName", () => {
  it("treats a trailing-plural mismatch as the same exercise", () => {
    expect(sameExerciseName("Tricep Pushdowns", "Tricep Pushdown")).toBe(true);
  });

  it("ignores case and punctuation", () => {
    expect(sameExerciseName("  Back-Squat!!  ", "back squat")).toBe(true);
  });

  it("returns false for genuinely different exercises", () => {
    expect(sameExerciseName("Barbell Row", "Cable Row")).toBe(false);
  });
});
