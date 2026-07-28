import { describe, expect, it } from "vitest";
import { parseRoutineText } from "./parse-routine";

describe("parseRoutineText", () => {
  it("parses a title line plus NxM exercise lines", () => {
    const result = parseRoutineText(
      "Push day:\nBench press 4x8\nIncline dumbbell press 3x10\nTricep pushdown 3x12",
    );
    expect(result.name).toBe("Push day");
    expect(result.exercises).toEqual([
      { rawName: "Bench press", sets: 4, reps: 8, repsMax: null },
      { rawName: "Incline dumbbell press", sets: 3, reps: 10, repsMax: null },
      { rawName: "Tricep pushdown", sets: 3, reps: 12, repsMax: null },
    ]);
  });

  it("only the first lettered preamble line becomes the name (first-line-wins)", () => {
    const result = parseRoutineText(
      "Push day\nWeek 3 — heavy\nBench press 4x8",
    );
    expect(result.name).toBe("Push day");
  });

  it("has no name when the text opens straight on an exercise", () => {
    const result = parseRoutineText("Squat 5x5");
    expect(result.name).toBeNull();
    expect(result.exercises).toEqual([
      { rawName: "Squat", sets: 5, reps: 5, repsMax: null },
    ]);
  });

  it("accepts the multiplication sign and spaced x", () => {
    const result = parseRoutineText("Deadlift 3×5\nRow 4 x 12");
    expect(result.exercises).toEqual([
      { rawName: "Deadlift", sets: 3, reps: 5, repsMax: null },
      { rawName: "Row", sets: 4, reps: 12, repsMax: null },
    ]);
  });

  it("parses a rep range with a hyphen or en dash", () => {
    const result = parseRoutineText("Lunge 3x8-10\nCurl 3x8–12");
    expect(result.exercises).toEqual([
      { rawName: "Lunge", sets: 3, reps: 8, repsMax: 10 },
      { rawName: "Curl", sets: 3, reps: 8, repsMax: 12 },
    ]);
  });

  it("strips bullets and numbered-list markers", () => {
    const result = parseRoutineText(
      "- Bench press 4x8\n* OHP 3x8\n1. Squat 5x5\n2) Row 4x10",
    );
    expect(result.exercises.map((e) => e.rawName)).toEqual([
      "Bench press",
      "OHP",
      "Squat",
      "Row",
    ]);
  });

  it("reads the exercise name after a colon separator", () => {
    const result = parseRoutineText("Bench press: 4x8");
    expect(result.exercises).toEqual([
      { rawName: "Bench press", sets: 4, reps: 8, repsMax: null },
    ]);
  });

  it("reads the exercise name when it follows the set×rep token", () => {
    const result = parseRoutineText("4x8 - Bench press");
    expect(result.exercises).toEqual([
      { rawName: "Bench press", sets: 4, reps: 8, repsMax: null },
    ]);
  });

  it("ignores blank lines", () => {
    const result = parseRoutineText("\n\nSquat 5x5\n\n");
    expect(result.exercises).toHaveLength(1);
  });

  it("does not false-match a plain number as a set×rep token (distance/tempo)", () => {
    // Out of v1 scope by design: no "x" separator means no set×rep token,
    // so these lines are dropped rather than guessed at.
    const result = parseRoutineText("Row 500m\nPlank 60s\nSquat 3-1-3-0");
    expect(result.exercises).toEqual([]);
  });

  it("reports the lines it could not read instead of dropping them silently", () => {
    const result = parseRoutineText(
      "Bench press 4x8\nPlank 60s\nFarmer carry 40m\nDeadlift AMRAP",
    );
    expect(result.exercises).toEqual([
      { rawName: "Bench press", sets: 4, reps: 8, repsMax: null },
    ]);
    expect(result.unparsed).toEqual([
      "Plank 60s",
      "Farmer carry 40m",
      "Deadlift AMRAP",
    ]);
  });

  it("reports a set×rep line with no readable name as unparsed", () => {
    const result = parseRoutineText("Squat 5x5\n4x8");
    expect(result.exercises).toHaveLength(1);
    expect(result.unparsed).toEqual(["4x8"]);
  });

  it("does not report the title line or blanks as unparsed", () => {
    const result = parseRoutineText("Push day\n\nBench press 4x8\n");
    expect(result.name).toBe("Push day");
    expect(result.unparsed).toEqual([]);
  });

  it("out of scope: only the first NxM token on a comma-joined line is read", () => {
    const result = parseRoutineText(
      "Bench press 4x8, incline dumbbell press 3x10",
    );
    expect(result.exercises).toEqual([
      { rawName: "Bench press", sets: 4, reps: 8, repsMax: null },
    ]);
  });
});
