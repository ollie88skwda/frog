import { describe, expect, test } from "vitest";
import {
  countSets,
  groupSetsBySetNo,
  sessionSetCount,
  sessionVolumeKg,
  setVolumeKg,
} from "./volume";

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
        {
          weightKg: 60,
          reps: 10,
          setType: "warmup",
          completed: true,
          setNo: 0,
        },
        {
          weightKg: 100,
          reps: 5,
          setType: "normal",
          completed: true,
          setNo: 1,
        },
        {
          weightKg: 100,
          reps: 5,
          setType: "normal",
          completed: false,
          setNo: 2,
        },
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

describe("countSets", () => {
  test("a unilateral pair (two rows, one set_no) counts once", () => {
    const sets = [
      { setNo: 0, side: "left" as const },
      { setNo: 0, side: "right" as const },
      { setNo: 1, side: "left" as const },
      { setNo: 1, side: "right" as const },
      { setNo: 2, side: "left" as const },
      { setNo: 2, side: "right" as const },
    ];
    expect(countSets(sets)).toBe(3);
  });

  test("bilateral rows (side: null) always count", () => {
    expect(
      countSets([
        { setNo: 0, side: null },
        { setNo: 1, side: null },
      ]),
    ).toBe(2);
  });

  test("a one-side-only row (injury case) still counts as one set", () => {
    expect(countSets([{ setNo: 0, side: "left" }])).toBe(1);
  });

  test("volume is unaffected by pairing — both rows still sum", () => {
    const sets = [
      { weightKg: 30, reps: 10, side: "left" as const, setNo: 0 },
      { weightKg: 28, reps: 8, side: "right" as const, setNo: 0 },
    ];
    expect(sessionVolumeKg([{ exerciseType: "weight_reps", sets }], null)).toBe(
      30 * 10 + 28 * 8,
    );
    expect(countSets(sets)).toBe(1);
  });
});

describe("groupSetsBySetNo", () => {
  test("a unilateral pair becomes one group, left first", () => {
    const groups = groupSetsBySetNo([
      { setNo: 0, side: "left", reps: 10 },
      { setNo: 0, side: "right", reps: 8 },
      { setNo: 1, side: "left", reps: 9 },
      { setNo: 1, side: "right", reps: 7 },
    ]);
    expect(groups).toHaveLength(2);
    expect(groups.map((g) => g[0].reps)).toEqual([10, 9]);
    expect(groups[0][1].reps).toBe(8);
  });

  test("bilateral rows are singleton groups, in order", () => {
    const groups = groupSetsBySetNo([
      { setNo: 0, side: null, reps: 5 },
      { setNo: 1, side: null, reps: 6 },
    ]);
    expect(groups.map((g) => g.map((s) => s.reps))).toEqual([[5], [6]]);
  });

  test("a one-side-only row is still its own group", () => {
    expect(groupSetsBySetNo([{ setNo: 0, side: "left" }])).toHaveLength(1);
  });

  test("group count matches countSets", () => {
    const sets = [
      { setNo: 0, side: "left" },
      { setNo: 0, side: "right" },
      { setNo: 1, side: null },
      { setNo: 2, side: "left" },
    ];
    expect(groupSetsBySetNo(sets)).toHaveLength(countSets(sets));
  });
});
