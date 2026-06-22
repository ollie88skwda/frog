import { describe, it, expect } from "vitest";
import { makeTestDb } from "./test-db";
import {
  createMetric,
  listMetrics,
  listMetricsByScope,
  getSessionConditionValues,
  saveSessionConditionValues,
  getSetMetricValues,
  saveSetMetricValues,
} from "./metrics";
import { startSession, addExerciseToSession, logSet } from "./sessions";
import { createExercise } from "./exercises";

describe("metrics db", () => {
  it("creates and lists metrics in alpha order", () => {
    const db = makeTestDb();
    createMetric(db, "Stress (1-10)", "scale", "session");
    createMetric(db, "Sleep (h)", "number", "session");
    createMetric(db, "RIR override", "number", "set");
    const all = listMetrics(db);
    expect(all).toHaveLength(3);
    expect(all[0].name).toBe("RIR override");
    expect(all[1].name).toBe("Sleep (h)");
    expect(all[2].name).toBe("Stress (1-10)");
  });

  it("stores type and scope fields correctly", () => {
    const db = makeTestDb();
    createMetric(db, "Sleep (h)", "number", "session");
    const [m] = listMetrics(db);
    expect(m.type).toBe("number");
    expect(m.scope).toBe("session");
  });

  it("filters by scope", () => {
    const db = makeTestDb();
    createMetric(db, "Sleep (h)", "number", "session");
    createMetric(db, "Fatigue (1-10)", "scale", "session");
    createMetric(db, "RIR override", "number", "set");
    expect(listMetricsByScope(db, "session")).toHaveLength(2);
    expect(listMetricsByScope(db, "set")).toHaveLength(1);
  });

  it("saves and retrieves condition values on a session", () => {
    const db = makeTestDb();
    const sessionId = startSession(db, "Push A");
    const vals = { "m-sleep": 7.5, "m-stress": 3 };
    saveSessionConditionValues(db, sessionId, vals);
    expect(getSessionConditionValues(db, sessionId)).toEqual(vals);
  });

  it("returns empty map for a session with no condition values", () => {
    const db = makeTestDb();
    const sessionId = startSession(db);
    expect(getSessionConditionValues(db, sessionId)).toEqual({});
  });

  it("overwriting condition values replaces the full map", () => {
    const db = makeTestDb();
    const sessionId = startSession(db, "Pull B");
    saveSessionConditionValues(db, sessionId, { sleep: 6 });
    saveSessionConditionValues(db, sessionId, { sleep: 8, stress: 2 });
    expect(getSessionConditionValues(db, sessionId)).toEqual({ sleep: 8, stress: 2 });
  });
});

describe("set-level metric values", () => {
  function setupSet(db: ReturnType<typeof makeTestDb>) {
    const exId = createExercise(db, "Bench Press (Barbell)");
    const seId = addExerciseToSession(db, startSession(db, "Push A"), exId);
    return logSet(db, seId, { weightKg: 80, reps: 8 });
  }

  it("returns empty map for a set with no metric values", () => {
    const db = makeTestDb();
    const setId = setupSet(db);
    expect(getSetMetricValues(db, setId)).toEqual({});
  });

  it("saves and retrieves set metric values", () => {
    const db = makeTestDb();
    const setId = setupSet(db);
    saveSetMetricValues(db, setId, { "m-form": 8, "m-rir": 2 });
    expect(getSetMetricValues(db, setId)).toEqual({ "m-form": 8, "m-rir": 2 });
  });

  it("overwriting set metric values replaces the full map", () => {
    const db = makeTestDb();
    const setId = setupSet(db);
    saveSetMetricValues(db, setId, { "m-form": 7 });
    saveSetMetricValues(db, setId, { "m-form": 9, "m-rir": 1 });
    expect(getSetMetricValues(db, setId)).toEqual({ "m-form": 9, "m-rir": 1 });
  });

  it("set metric values are independent per set", () => {
    const db = makeTestDb();
    const exId = createExercise(db, "Row (Barbell)");
    const seId = addExerciseToSession(db, startSession(db), exId);
    const id1 = logSet(db, seId, { weightKg: 60, reps: 10 });
    const id2 = logSet(db, seId, { weightKg: 60, reps: 9 });
    saveSetMetricValues(db, id1, { "m-form": 8 });
    expect(getSetMetricValues(db, id2)).toEqual({});
    expect(getSetMetricValues(db, id1)).toEqual({ "m-form": 8 });
  });
});
