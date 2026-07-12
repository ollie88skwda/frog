import { describe, expect, it } from "vitest";
import type { ExportBundle } from "../repo/types";
import { setsCsv } from "./csv";

const base = { createdAt: 1, updatedAt: 1, deletedAt: null };

const bundle: ExportBundle = {
  schemaVersion: 1,
  exportedAt: 1,
  exercises: [
    {
      ...base,
      id: "ex1",
      ownerId: "u1",
      name: "Bench, Press",
      tags: null,
      isCustom: true,
    },
  ],
  metrics: [
    {
      ...base,
      id: "m1",
      ownerId: null,
      name: "Sleep (h)",
      type: "number",
      scope: "session",
      exerciseIds: null,
    },
    {
      ...base,
      id: "m2",
      ownerId: "u1",
      name: "Seat",
      type: "number",
      scope: "set",
      exerciseIds: null,
    },
  ],
  sessions: [
    {
      ...base,
      id: "s1",
      ownerId: "u1",
      title: null,
      startedAt: Date.UTC(2026, 0, 2, 10, 0, 0),
      endedAt: null,
      conditionValues: { m1: 7.5 },
    },
  ],
  sessionExercises: [
    {
      ...base,
      id: "se1",
      ownerId: "u1",
      sessionId: "s1",
      exerciseId: "ex1",
      orderIndex: 0,
    },
  ],
  setLogs: [
    {
      ...base,
      id: "sl1",
      ownerId: "u1",
      sessionExerciseId: "se1",
      setNo: 0,
      weightKg: 100,
      reps: 5,
      rir: 2,
      note: 'felt "heavy"',
      metricValues: null,
      completed: true,
    },
  ],
};

describe("setsCsv", () => {
  it("flattens sets with denormalized conditions and escapes fields", () => {
    const csv = setsCsv(bundle);
    const [header, row] = csv.split("\n");
    expect(header).toBe(
      "session_started_at,session_title,exercise,set_no,weight_kg,reps,rir,note,Sleep (h)",
    );
    expect(row).toBe(
      '2026-01-02T10:00:00.000Z,,"Bench, Press",0,100,5,2,"felt ""heavy""",7.5',
    );
  });

  it("skips soft-deleted sets", () => {
    const withDeleted: ExportBundle = {
      ...bundle,
      setLogs: [{ ...bundle.setLogs[0], deletedAt: 5 }],
    };
    expect(setsCsv(withDeleted).split("\n")).toHaveLength(1);
  });
});
