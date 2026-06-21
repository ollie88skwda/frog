import { describe, it, expect } from "vitest";
import { makeTestDb } from "./test-db";
import {
  createMetric,
  listMetrics,
  listMetricsByScope,
  getSessionConditionValues,
  saveSessionConditionValues,
} from "./metrics";
import { startSession } from "./sessions";

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
