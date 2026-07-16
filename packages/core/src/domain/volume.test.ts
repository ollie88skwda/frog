import { describe, expect, test } from "vitest";
import { sessionSetCount, sessionVolumeKg, setVolumeKg } from "./volume";

describe("setVolumeKg", () => {
  test("weight_reps = weight × reps", () => {
    expect(setVolumeKg("weight_reps", { weightKg: 100, reps: 5 }, 80)).toBe(
      500,
    );
  });

  test("bodyweight_reps = bodyweight × reps", () => {
    expect(
      setVolumeKg("bodyweight_reps", { weightKg: null, reps: 10 }, 80),
    ).toBe(800);
  });

  test("bodyweight_reps without logged bodyweight is not computed", () => {
    expect(
      setVolumeKg("bodyweight_reps", { weightKg: null, reps: 10 }, null),
    ).toBe(0);
  });

  test("weighted_bodyweight = (bodyweight + added) × reps", () => {
    expect(
      setVolumeKg("weighted_bodyweight", { weightKg: 20, reps: 5 }, 80),
    ).toBe(500);
  });

  test("assisted_bodyweight = (bodyweight − assistance) × reps, floored at 0", () => {
    expect(
      setVolumeKg("assisted_bodyweight", { weightKg: 30, reps: 8 }, 80),
    ).toBe(400);
    expect(
      setVolumeKg("assisted_bodyweight", { weightKg: 100, reps: 8 }, 80),
    ).toBe(0);
  });

  test("duration/distance types carry no tonnage", () => {
    expect(setVolumeKg("duration", { weightKg: null, reps: null }, 80)).toBe(0);
    expect(
      setVolumeKg("weight_duration", { weightKg: 20, reps: null }, 80),
    ).toBe(0);
    expect(
      setVolumeKg("distance_duration", { weightKg: null, reps: null }, 80),
    ).toBe(0);
    expect(
      setVolumeKg("weight_distance", { weightKg: 20, reps: null }, 80),
    ).toBe(0);
  });
});

describe("session totals", () => {
  const blocks = [
    {
      exerciseType: "weight_reps" as const,
      sets: [
        { weightKg: 60, reps: 10, setType: "warmup", completed: true },
        { weightKg: 100, reps: 5, setType: "normal", completed: true },
        { weightKg: 100, reps: 5, setType: "normal", completed: false },
      ],
    },
  ];

  test("includes warm-ups by default, skips uncompleted", () => {
    expect(sessionVolumeKg(blocks, null)).toBe(1100);
    expect(sessionSetCount(blocks)).toBe(2);
  });

  test("excludes warm-ups when includeWarmups=false", () => {
    expect(sessionVolumeKg(blocks, null, { includeWarmups: false })).toBe(500);
    expect(sessionSetCount(blocks, { includeWarmups: false })).toBe(1);
  });
});
