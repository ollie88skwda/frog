import { describe, it, expect, vi } from "vitest";
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

  it("ghost prefill returns ONLY the most recent prior session, even with identical timestamps", () => {
    const db = makeTestDb();
    // Force every createdAt to the SAME millisecond so ordering cannot rely on the clock —
    // this exercises the rowid tiebreaker. (Previously this test passed only by luck.)
    const clock = vi.spyOn(Date, "now").mockReturnValue(5000);
    try {
      const ex = createExercise(db, "Lat Pulldown (Cable)");
      const s1 = addExerciseToSession(db, startSession(db), ex);
      logSet(db, s1, { weightKg: 80, reps: 10 });
      const s2 = addExerciseToSession(db, startSession(db), ex);
      logSet(db, s2, { weightKg: 85, reps: 9 });
      expect(lastSetsForExercise(db, ex)).toEqual([{ weightKg: 85, reps: 9 }]);
    } finally {
      clock.mockRestore();
    }
  });

  it("ghost prefill excludes the current session-exercise (shows the PRIOR one)", () => {
    const db = makeTestDb();
    const ex = createExercise(db, "Incline Press");
    const s1 = addExerciseToSession(db, startSession(db), ex);
    logSet(db, s1, { weightKg: 60, reps: 8 });
    // The in-progress session: a fresh, still-empty session-exercise.
    const sCurrent = addExerciseToSession(db, startSession(db), ex);
    // Excluding the current one surfaces session 1's sets...
    expect(lastSetsForExercise(db, ex, sCurrent)).toEqual([{ weightKg: 60, reps: 8 }]);
    // ...whereas NOT excluding returns the most-recent (empty current) -> [].
    expect(lastSetsForExercise(db, ex)).toEqual([]);
  });
});
