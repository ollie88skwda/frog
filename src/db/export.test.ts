import { describe, it, expect } from "vitest";
import { makeTestDb } from "./test-db";
import { createExercise } from "./exercises";
import { startSession, addExerciseToSession, logSet } from "./sessions";
import { saveSessionConditionValues, saveSetMetricValues } from "./metrics";
import { buildExportSessions } from "./export";
import { buildExportRows, toCSV, toJSON } from "../domain/export";

function buildTestData(db: ReturnType<typeof makeTestDb>) {
  const ex1 = createExercise(db, "Bench Press");
  const ex2 = createExercise(db, "Squat");

  const s1 = startSession(db, "Push A");
  const se1a = addExerciseToSession(db, s1, ex1);
  const set1 = logSet(db, se1a, { weightKg: 100, reps: 5 });
  saveSessionConditionValues(db, s1, { sleep: 8, highCarbs: true });
  saveSetMetricValues(db, set1, { formScore: 9 });

  const s2 = startSession(db, "Legs");
  const se2a = addExerciseToSession(db, s2, ex2);
  logSet(db, se2a, { weightKg: 140, reps: 5 });
  logSet(db, se2a, { weightKg: 140, reps: 4 });

  return { s1, s2, ex1, ex2 };
}

describe("buildExportSessions", () => {
  it("returns empty array for empty DB", () => {
    const db = makeTestDb();
    expect(buildExportSessions(db)).toHaveLength(0);
  });

  it("returns one row per set", () => {
    const db = makeTestDb();
    buildTestData(db);
    const rows = buildExportSessions(db);
    // 1 set for s1/ex1 + 2 sets for s2/ex2 = 3 rows
    expect(rows).toHaveLength(3);
  });

  it("populates core fields correctly", () => {
    const db = makeTestDb();
    buildTestData(db);
    const rows = buildExportSessions(db);
    const benchRow = rows.find((r) => r.exercise === "Bench Press");
    expect(benchRow).toBeDefined();
    expect(benchRow!.weightKg).toBe(100);
    expect(benchRow!.reps).toBe(5);
    expect(benchRow!.title).toBe("Push A");
  });

  it("includes session condition values on each set row", () => {
    const db = makeTestDb();
    buildTestData(db);
    const rows = buildExportSessions(db);
    const benchRow = rows.find((r) => r.exercise === "Bench Press");
    expect(benchRow!.conditionValues).toEqual({ sleep: 8, highCarbs: true });
  });

  it("includes set metric values on each set row", () => {
    const db = makeTestDb();
    buildTestData(db);
    const rows = buildExportSessions(db);
    const benchRow = rows.find((r) => r.exercise === "Bench Press");
    expect(benchRow!.setMetricValues).toEqual({ formScore: 9 });
  });

  it("omits conditionValues key when session has none", () => {
    const db = makeTestDb();
    buildTestData(db);
    const rows = buildExportSessions(db);
    const squatRow = rows.find((r) => r.exercise === "Squat");
    expect(squatRow!.conditionValues).toBeUndefined();
  });

  it("orders by session start then exercise order then set number", () => {
    const db = makeTestDb();
    buildTestData(db);
    const rows = buildExportSessions(db);
    // Bench is in s1 (session 1), Squat in s2 (session 2)
    // Within Squat: setNo 0 before setNo 1
    expect(rows[0].exercise).toBe("Bench Press");
    expect(rows[1].exercise).toBe("Squat");
    expect(rows[2].exercise).toBe("Squat");
    expect(rows[1].setNo).toBeLessThan(rows[2].setNo);
  });

  it("integrates with buildExportRows + toCSV", () => {
    const db = makeTestDb();
    buildTestData(db);
    const sessions = buildExportSessions(db);
    const exportRows = buildExportRows(sessions);
    const csv = toCSV(exportRows);
    const lines = csv.split("\n");
    // header + 3 data rows
    expect(lines).toHaveLength(4);
    // Condition columns should appear in header (sleep, highCarbs, formScore)
    const header = lines[0];
    expect(header).toContain("sleep");
    expect(header).toContain("formScore");
  });

  it("integrates with toJSON", () => {
    const db = makeTestDb();
    buildTestData(db);
    const json = toJSON(buildExportRows(buildExportSessions(db)));
    const parsed = JSON.parse(json);
    expect(parsed).toHaveLength(3);
    // First row should have conditions
    expect(parsed[0].conditions).toMatchObject({ sleep: 8 });
  });
});
