import { describe, it, expect } from "vitest";
import { makeTestDb } from "./test-db";
import { createExercise, listExercises } from "./exercises";

describe("exercises db", () => {
  it("creates and lists", () => {
    const db = makeTestDb();
    createExercise(db, "Chest Fly (Machine)");
    createExercise(db, "Bicep Curl (Cable)", ["elbow flexion"]);
    const all = listExercises(db);
    expect(all.map((e) => e.name)).toEqual(["Bicep Curl (Cable)", "Chest Fly (Machine)"]);
    expect(JSON.parse(all[0].tags!)).toEqual(["elbow flexion"]);
  });
});
