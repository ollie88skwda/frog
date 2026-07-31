import { describe, expect, it } from "vitest";
import {
  isConfidentMatch,
  MATCH_CONFIDENCE_THRESHOLD,
  matchExerciseName,
  normalizeExerciseName,
  sameExerciseName,
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
    expect(match?.matchType).toBe("subset");
    expect(match?.tied).toHaveLength(1);
    expect(isConfidentMatch(match!)).toBe(true);
  });

  it("reports the honest overlap ratio for a containment match", () => {
    const match = matchExerciseName("leg", [
      { id: "7", name: "Leg Extension Machine" },
    ]);
    expect(match?.score).toBeCloseTo(1 / 3);
    expect(match?.score).toBeLessThan(MATCH_CONFIDENCE_THRESHOLD);
    expect(isConfidentMatch(match!)).toBe(true);
  });

  it("does not accept a one-word shorthand shared by two candidates", () => {
    const match = matchExerciseName("press", [
      { id: "2", name: "Bench Press" },
      { id: "4", name: "Overhead Press" },
    ]);
    expect(match?.matchType).toBe("overlap");
    expect(match?.score).toBeLessThan(MATCH_CONFIDENCE_THRESHOLD);
    expect(isConfidentMatch(match!)).toBe(false);
  });

  it("reports every block tied at the top score as ambiguous", () => {
    const match = matchExerciseName("bench press", [
      { id: "2", name: "Bench Press" },
      { id: "3", name: "Pull Ups" },
      { id: "5", name: "Bench Press" },
    ]);
    expect(match?.score).toBe(1);
    expect(match?.matchType).toBe("overlap");
    expect(match?.tied.map((c) => c.id)).toEqual(["2", "5"]);
    expect(isConfidentMatch(match!)).toBe(true);
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

  it("does not substring-match inside a longer word (word-boundary aware)", () => {
    // Token-set matching, not character substring — "row" is a distinct
    // token from "narrow", never a substring hit inside it.
    const candidates = [
      { id: "1", name: "Narrow Grip Pulldown" },
      { id: "2", name: "Seated Row" },
    ];
    expect(matchExerciseName("row", candidates)?.id).toBe("2");
  });

  it("does not inflate the score when a candidate repeats a query token", () => {
    const repeated = [{ id: "9", name: "Row Row Row Machine" }];
    const match = matchExerciseName("row boat", repeated);
    expect(isConfidentMatch(match!)).toBe(false);
  });
});

describe("aliases", () => {
  it("resolves a shorthand alias to its candidate", () => {
    const candidates = [
      { id: "1", name: "Overhead Press", aliases: ["OHP"] },
      { id: "2", name: "Bench Press" },
    ];
    const match = matchExerciseName("OHP", candidates);
    expect(match?.id).toBe("1");
    expect(match?.matchType).toBe("subset");
    expect(isConfidentMatch(match!)).toBe(true);
  });

  it("scores against whichever label (name or alias) fits best", () => {
    const candidates = [
      { id: "1", name: "Overhead Press", aliases: ["Military Press"] },
    ];
    const match = matchExerciseName("military press", candidates);
    expect(match?.id).toBe("1");
    expect(match?.score).toBe(1);
  });

  it("ignores a null/absent aliases list", () => {
    const candidates = [{ id: "1", name: "Overhead Press", aliases: null }];
    expect(matchExerciseName("overhead press", candidates)?.id).toBe("1");
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
