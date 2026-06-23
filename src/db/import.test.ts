import { describe, it, expect } from "vitest";
import { makeTestDb } from "./test-db";
import { createExercise, listExercises } from "./exercises";
import { listSessions } from "./sessions";
import { importHevySessions } from "./import";
import { buildExportSessions } from "./export";
import { parseHevyCSV } from "../domain/import";

const CLASSIC_CSV = `Date,Workout Name,Duration,Exercise Name,Set Order,Weight (lbs),Reps,RPE
2024-01-15,Push A,3600,Bench Press (Barbell),1,220,5,8
2024-01-15,Push A,3600,Bench Press (Barbell),2,220,4,9
2024-01-15,Push A,3600,Overhead Press (Barbell),1,110,8,
2024-01-22,Push B,3600,Bench Press (Barbell),1,225,5,`;

const NEW_CSV = `Title,Start Time,End Time,Exercise Title,Set Order,Weight,Reps,Distance,Duration,RPE,Notes,Set Type,Weight Unit
Push A,2024-01-15 10:00:00,2024-01-15 11:00:00,Bench Press (Barbell),1,100,5,,,,, normal,kg
Push A,2024-01-15 10:00:00,2024-01-15 11:00:00,Bench Press (Barbell),2,100,4,,,,, normal,kg`;

describe("importHevySessions", () => {
  it("returns zeros on empty input", () => {
    const db = makeTestDb();
    const result = importHevySessions(db, []);
    expect(result).toEqual({ sessionsImported: 0, sessionsSkipped: 0, exercisesCreated: 0, setsInserted: 0 });
  });

  it("imports sessions from parsed classic Hevy CSV", () => {
    const db = makeTestDb();
    const { sessions: parsed } = parseHevyCSV(CLASSIC_CSV);
    const result = importHevySessions(db, parsed);
    expect(result.sessionsImported).toBe(2);    // two distinct dates
    expect(result.sessionsSkipped).toBe(0);
    expect(result.exercisesCreated).toBe(2);    // Bench + OHP
    expect(result.setsInserted).toBe(4);        // 2+1+1
  });

  it("creates exercises by name when they don't exist", () => {
    const db = makeTestDb();
    const { sessions: parsed } = parseHevyCSV(CLASSIC_CSV);
    importHevySessions(db, parsed);
    const exNames = listExercises(db).map((e: any) => e.name);
    expect(exNames).toContain("Bench Press (Barbell)");
    expect(exNames).toContain("Overhead Press (Barbell)");
  });

  it("reuses an existing exercise when name matches", () => {
    const db = makeTestDb();
    createExercise(db, "Bench Press (Barbell)"); // pre-existing
    const { sessions: parsed } = parseHevyCSV(CLASSIC_CSV);
    const result = importHevySessions(db, parsed);
    // Only OHP should be created (Bench already existed)
    expect(result.exercisesCreated).toBe(1);
    // Only 2 exercises total even after import
    expect(listExercises(db)).toHaveLength(2);
  });

  it("skips duplicate sessions (idempotent — same startedAt)", () => {
    const db = makeTestDb();
    const { sessions: parsed } = parseHevyCSV(CLASSIC_CSV);
    importHevySessions(db, parsed);
    const result2 = importHevySessions(db, parsed); // re-import
    expect(result2.sessionsImported).toBe(0);
    expect(result2.sessionsSkipped).toBe(2);
    expect(result2.setsInserted).toBe(0);
    // Total session count should not have changed
    expect(listSessions(db)).toHaveLength(2);
  });

  it("preserves session title and start time", () => {
    const db = makeTestDb();
    const { sessions: parsed } = parseHevyCSV(CLASSIC_CSV);
    importHevySessions(db, parsed);
    const dbSessions = listSessions(db);
    const pushA = dbSessions.find((s: any) => s.title === "Push A");
    expect(pushA).toBeDefined();
    expect(pushA!.startedAt).toBeGreaterThan(0);
  });

  it("converts Hevy lbs to kg correctly", () => {
    const db = makeTestDb();
    const { sessions: parsed } = parseHevyCSV(CLASSIC_CSV);
    importHevySessions(db, parsed);
    const exported = buildExportSessions(db);
    const benchSets = exported.filter((r) => r.exercise === "Bench Press (Barbell)");
    // First set: 220 lbs → ~99.8 kg
    expect(benchSets[0].weightKg).toBeCloseTo(99.8, 0);
  });

  it("handles new format kg CSV without unit conversion", () => {
    const db = makeTestDb();
    const { sessions: parsed } = parseHevyCSV(NEW_CSV);
    importHevySessions(db, parsed);
    const exported = buildExportSessions(db);
    const benchSet = exported.find((r) => r.exercise === "Bench Press (Barbell)");
    // 100 kg in → 100 kg out (no conversion applied)
    expect(benchSet!.weightKg).toBeCloseTo(100, 2);
  });

  it("round-trips: import then export produces consistent exercise names", () => {
    const db = makeTestDb();
    const { sessions: parsed } = parseHevyCSV(CLASSIC_CSV);
    importHevySessions(db, parsed);
    const exported = buildExportSessions(db);
    const exerciseNames = [...new Set(exported.map((r) => r.exercise))];
    expect(exerciseNames.sort()).toEqual(["Bench Press (Barbell)", "Overhead Press (Barbell)"].sort());
  });
});
