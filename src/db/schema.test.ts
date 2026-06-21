import { describe, it, expect } from "vitest";
import { makeTestDb } from "./test-db";
import { exercises } from "./schema";

describe("schema", () => {
  it("inserts and reads an exercise", () => {
    const db = makeTestDb();
    const now = 1_000;
    db.insert(exercises).values({ id: "x1", createdAt: now, updatedAt: now, dirty: 1, name: "Incline Press" }).run();
    const rows = db.select().from(exercises).all();
    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe("Incline Press");
    expect(rows[0].deletedAt).toBeNull();
  });
});
