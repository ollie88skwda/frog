import { describe, it, expect } from "vitest";
import { makeTestDb } from "./test-db";
import { createExercise } from "./exercises";
import { startSession, addExerciseToSession, logSet, lastSetsForExercise } from "./sessions";

describe("sessions db", () => {
  it("logs sets with auto set numbers", () => {
    const db = makeTestDb();
    const ex = createExercise(db, "Seated Row (Machine)");
    const s = startSession(db, "Pull A");
    const se = addExerciseToSession(db, s, ex);
    logSet(db, se, { weightKg: 100, reps: 8 });
    logSet(db, se, { weightKg: 100, reps: 7 });
    const ghost = lastSetsForExercise(db, ex);
    expect(ghost).toEqual([{ weightKg: 100, reps: 8 }, { weightKg: 100, reps: 7 }]);
  });

  it("ghost prefill returns ONLY the most recent prior session", () => {
    const db = makeTestDb();
    const ex = createExercise(db, "Lat Pulldown (Cable)");
    const s1 = addExerciseToSession(db, startSession(db), ex);
    logSet(db, s1, { weightKg: 80, reps: 10 });
    const s2 = addExerciseToSession(db, startSession(db), ex);
    logSet(db, s2, { weightKg: 85, reps: 9 });
    expect(lastSetsForExercise(db, ex)).toEqual([{ weightKg: 85, reps: 9 }]);
  });
});
