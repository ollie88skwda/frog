import { describe, expect, it } from "vitest";
import type { ExportBundle } from "../repo/types";
import { setsCsv } from "./csv";

const base = { createdAt: 1, updatedAt: 1, deletedAt: null };

const bundle: ExportBundle = {
  schemaVersion: 2,
  exportedAt: 1,
  exercises: [
    {
      ...base,
      id: "ex1",
      ownerId: "u1",
      name: "Bench, Press",
      tags: null,
      isCustom: true,
      machineId: null,
      jointActions: null,
      muscleTargets: null,
      imageUrl: null,
      imageAttribution: null,
      exerciseType: "weight_reps",
      equipment: null,
      instructions: null,
      imageUrls: null,
      mechanic: null,
      movementPattern: null,
      laterality: null,
      defaultRepsMin: null,
      defaultRepsMax: null,
      defaultRestSec: null,
      notes: null,
      aliases: null,
      mediaPath: null,
      mediaType: null,
    },
  ],
  machines: [],
  metrics: [
    {
      ...base,
      id: "m1",
      ownerId: null,
      name: "Sleep (h)",
      type: "number",
      scope: "session",
      unit: null,
      exerciseIds: null,
    },
    {
      ...base,
      id: "m2",
      ownerId: "u1",
      name: "Seat",
      type: "number",
      scope: "set",
      unit: null,
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
      notes: null,
      routineId: null,
      pausedMs: 0,
      shareSlug: null,
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
      supersetGroup: null,
      restSec: null,
      note: null,
      routineExerciseId: null,
    },
  ],
  setLogs: [
    {
      ...base,
      id: "sl1",
      ownerId: "u1",
      sessionExerciseId: "se1",
      setNo: 0,
      setType: "normal",
      weightKg: 100,
      durationSec: null,
      distanceM: null,
      reps: 5,
      rir: 2,
      rirMin: null,
      rirMax: null,
      rpe: 8,
      restSec: 90,
      note: 'felt "heavy"',
      metricValues: null,
      completed: true,
      side: null,
    },
  ],
};

describe("setsCsv", () => {
  it("flattens sets with denormalized conditions and escapes fields", () => {
    const csv = setsCsv(bundle);
    const [header, row] = csv.split("\n");
    expect(header).toBe(
      "session_started_at,session_title,exercise,set_no,side,set_type,weight_kg,reps,duration_sec,distance_m,rir,rir_min,rir_max,rpe,rest_sec,note,Sleep (h)",
    );
    expect(row).toBe(
      '2026-01-02T10:00:00.000Z,,"Bench, Press",0,,normal,100,5,,,2,,,8,90,"felt ""heavy""",7.5',
    );
  });

  it("includes the side column for a unilateral pair", () => {
    const withSide: ExportBundle = {
      ...bundle,
      setLogs: [
        { ...bundle.setLogs[0], side: "left" },
        {
          ...bundle.setLogs[0],
          id: "sl2",
          side: "right",
          weightKg: 28,
          reps: 8,
        },
      ],
    };
    const [, left, right] = setsCsv(withSide).split("\n");
    expect(left).toBe(
      '2026-01-02T10:00:00.000Z,,"Bench, Press",0,left,normal,100,5,,,2,,,8,90,"felt ""heavy""",7.5',
    );
    expect(right).toBe(
      '2026-01-02T10:00:00.000Z,,"Bench, Press",0,right,normal,28,8,,,2,,,8,90,"felt ""heavy""",7.5',
    );
  });

  it("skips soft-deleted sets", () => {
    const withDeleted: ExportBundle = {
      ...bundle,
      setLogs: [{ ...bundle.setLogs[0], deletedAt: 5 }],
    };
    expect(setsCsv(withDeleted).split("\n")).toHaveLength(1);
  });

  it("splits a logged RIR range into rir_min/rir_max columns", () => {
    const withRange: ExportBundle = {
      ...bundle,
      setLogs: [{ ...bundle.setLogs[0], rir: null, rirMin: 1, rirMax: 2 }],
    };
    const [, row] = setsCsv(withRange).split("\n");
    expect(row).toBe(
      '2026-01-02T10:00:00.000Z,,"Bench, Press",0,,normal,100,5,,,,1,2,8,90,"felt ""heavy""",7.5',
    );
  });
});
