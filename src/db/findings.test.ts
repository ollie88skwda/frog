import { describe, it, expect } from "vitest";
import { makeTestDb } from "./test-db";
import { createExercise } from "./exercises";
import { startSession, addExerciseToSession, logSet } from "./sessions";
import { sessionHistoryForExercise, buildExerciseMap } from "./findings";
import { epley } from "../domain/e1rm";

describe("db/findings", () => {
  it("returns empty array for exercise with no sessions", () => {
    const db = makeTestDb();
    const exId = createExercise(db, "Bench Press (Barbell)");
    expect(sessionHistoryForExercise(db, exId)).toEqual([]);
  });

  it("assembles ExerciseRecord[] with correct fields", () => {
    const db = makeTestDb();
    const exId = createExercise(db, "Squat (Barbell)");
    const seId = addExerciseToSession(db, startSession(db), exId);
    logSet(db, seId, { weightKg: 100, reps: 5 });
    logSet(db, seId, { weightKg: 100, reps: 3 });

    const records = sessionHistoryForExercise(db, exId);
    expect(records).toHaveLength(2);
    expect(records[0].weightKg).toBe(100);
    expect(records[0].reps).toBe(5);
    expect(records[0].e1rm).toBeCloseTo(epley(100, 5)!, 5);
    expect(records[0].setType).toBe("normal");
    expect(typeof records[0].sessionDay).toBe("number");
    expect(records[0].sessionDay).toBeGreaterThanOrEqual(0);
  });

  it("all records share the same sessionDay for sets in one session", () => {
    const db = makeTestDb();
    const exId = createExercise(db, "Overhead Press (Barbell)");
    const seId = addExerciseToSession(db, startSession(db), exId);
    logSet(db, seId, { weightKg: 60, reps: 8 });
    logSet(db, seId, { weightKg: 60, reps: 6 });

    const records = sessionHistoryForExercise(db, exId);
    expect(records[0].sessionDay).toBe(records[1].sessionDay);
  });

  it("orders records by session startedAt ascending", () => {
    const db = makeTestDb();
    const exId = createExercise(db, "Deadlift (Barbell)");
    const se1 = addExerciseToSession(db, startSession(db), exId);
    logSet(db, se1, { weightKg: 120, reps: 5 });
    const se2 = addExerciseToSession(db, startSession(db), exId);
    logSet(db, se2, { weightKg: 130, reps: 4 });

    const records = sessionHistoryForExercise(db, exId);
    expect(records).toHaveLength(2);
    expect(records[0].weightKg).toBe(120);
    expect(records[1].weightKg).toBe(130);
    expect(records[0].sessionDay).toBeLessThanOrEqual(records[1].sessionDay);
  });

  it("excludes sets with null weight or reps", () => {
    const db = makeTestDb();
    const exId = createExercise(db, "Leg Press (Machine)");
    const seId = addExerciseToSession(db, startSession(db), exId);
    logSet(db, seId, { weightKg: null, reps: 10 }); // no weight
    logSet(db, seId, { weightKg: 80, reps: null });  // no reps
    logSet(db, seId, { weightKg: 80, reps: 8 });     // valid

    const records = sessionHistoryForExercise(db, exId);
    expect(records).toHaveLength(1);
    expect(records[0].weightKg).toBe(80);
  });

  it("buildExerciseMap groups records by exercise name", () => {
    const db = makeTestDb();
    const ex1 = createExercise(db, "Bench Press (Barbell)");
    const ex2 = createExercise(db, "Row (Barbell)");

    const se1 = addExerciseToSession(db, startSession(db), ex1);
    logSet(db, se1, { weightKg: 80, reps: 8 });

    const se2 = addExerciseToSession(db, startSession(db), ex2);
    logSet(db, se2, { weightKg: 60, reps: 10 });

    const map = buildExerciseMap(db);
    expect(map["Bench Press (Barbell)"]).toHaveLength(1);
    expect(map["Row (Barbell)"]).toHaveLength(1);
    expect(map["Bench Press (Barbell)"][0].weightKg).toBe(80);
    expect(map["Row (Barbell)"][0].reps).toBe(10);
  });

  it("omits exercises with no logged sets from buildExerciseMap", () => {
    const db = makeTestDb();
    createExercise(db, "Empty Exercise");
    const map = buildExerciseMap(db);
    expect(map["Empty Exercise"]).toBeUndefined();
  });

  it("buildExerciseMap result feeds holistic() correctly", () => {
    const db = makeTestDb();
    const exId = createExercise(db, "Lat Pulldown (Cable)");
    // Log 5 sessions to meet INSUFFICIENT threshold
    for (let i = 0; i < 5; i++) {
      const seId = addExerciseToSession(db, startSession(db), exId);
      logSet(db, seId, { weightKg: 50 + i * 2, reps: 10 });
    }
    const map = buildExerciseMap(db);
    expect(map["Lat Pulldown (Cable)"]).toHaveLength(5);
    expect(map["Lat Pulldown (Cable)"][0].e1rm).toBeGreaterThan(0);
  });
});
