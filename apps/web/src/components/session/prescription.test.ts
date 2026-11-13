import { describe, expect, it } from "vitest";
import {
  driftNudge,
  formatRange,
  planFromSeed,
  planFromSnapshot,
  rangeState,
  reportE1rm,
  rirPreselect,
} from "./prescription";

describe("rangeState (R8b, C2c overshoot)", () => {
  const plan = { repsMin: 6, repsMax: 8, plannedRirMin: 1, plannedRirMax: 3 };
  it.each([
    [5, undefined, "below"],
    [6, undefined, "in"],
    [7, undefined, "in"],
    [8, undefined, "top"],
    [9, undefined, "top"], // +1 over is still just top of range
    [10, 2, "over"], // +2, RIR within plan
    [10, null, "over"], // +2, RIR blank
    [11, 1, "over"],
    [10, 5, "top"], // +2 but RIR far off plan: not an overshoot
  ] as const)("reps %s rir %s -> %s", (reps, rir, kind) => {
    expect(rangeState({ reps, rir, ...plan })?.kind).toBe(kind);
  });
  it("labels the overshoot", () => {
    expect(rangeState({ reps: 10, rir: 2, ...plan })?.label).toBe(
      "+2 over: add load next time",
    );
  });
  it("treats a fixed rep target as top of range when hit", () => {
    expect(rangeState({ reps: 5, repsMin: 5, repsMax: 5 })?.kind).toBe("top");
  });
  it("is null without a range or reps", () => {
    expect(rangeState({ reps: 5, repsMin: null, repsMax: null })).toBeNull();
    expect(rangeState({ reps: null, repsMin: 6, repsMax: 8 })).toBeNull();
  });
});

describe("rirPreselect (R10)", () => {
  it("uses the midpoint of the plan", () => {
    expect(rirPreselect(1, 3)).toBe(2);
    expect(rirPreselect(2, 2)).toBe(2);
    expect(rirPreselect(0, 1)).toBe(1);
    expect(rirPreselect(3, 4)).toBe(4);
  });
  it("is null with no plan", () => {
    expect(rirPreselect(null, null)).toBeNull();
    expect(rirPreselect(undefined, undefined)).toBeNull();
  });
});

describe("plans", () => {
  it("is null for a pre-snapshot block", () => {
    expect(
      planFromSnapshot({
        plannedRepsMin: null,
        plannedRepsMax: null,
        plannedRirMin: null,
        plannedRirMax: null,
        plannedSets: null,
        plannedLoadKg: null,
        plannedFirstSetMax: null,
        plannedIsDeload: null,
        prescriptionRuleId: null,
      }),
    ).toBeNull();
  });
  it("reads the snapshot", () => {
    const p = planFromSnapshot({
      plannedRepsMin: 6,
      plannedRepsMax: 8,
      plannedRirMin: 1,
      plannedRirMax: 3,
      plannedSets: 3,
      plannedLoadKg: 102.5,
      plannedFirstSetMax: true,
      plannedIsDeload: false,
      prescriptionRuleId: "C2c-progress",
    });
    expect(p).toMatchObject({ loadKg: 102.5, source: "snapshot" });
    expect(formatRange(p?.repsMin ?? null, p?.repsMax ?? null)).toBe("6-8");
  });
  it("falls back to the first working seed set, skipping warm-ups", () => {
    const p = planFromSeed([
      { setType: "warmup", weightKg: 40, reps: 6, repsMax: null },
      {
        setType: "normal",
        weightKg: 100,
        reps: 4,
        repsMax: 8,
        rirMin: 1,
        rirMax: 3,
      },
      { setType: "normal", weightKg: 100, reps: 4, repsMax: 8 },
    ]);
    expect(p).toMatchObject({
      loadKg: 100,
      sets: 2,
      rirMin: 1,
      source: "seed",
    });
  });
});

describe("driftNudge (C4/C5, R11)", () => {
  const planned = { rirMin: 1, rirMax: 3 };
  it("never fires with fewer than two logged sets", () => {
    expect(driftNudge([5], planned)).toBeNull();
  });
  it("fires when the last two sets are 2+ above plan", () => {
    expect(driftNudge([2, 5, 5], planned)).toBe(
      "last two sets ~5 left, plan is 1-3",
    );
  });
  it("does not fire on a single high set or blank RIR", () => {
    expect(driftNudge([1, 5], planned)).toBeNull();
    expect(driftNudge([5, null], planned)).toBeNull();
  });
});

describe("reportE1rm (C2c-e1rm)", () => {
  it("is Brzycki with RIR", () => {
    // 100 x 8 @ 2 -> 100*36/27 = 133.3 -> 133.5 at 0.5 kg
    expect(reportE1rm(100, 8, 2)).toEqual({ kind: "value", kg: 133.5 });
  });
  it("flags sets over 10 total reps", () => {
    expect(reportE1rm(60, 10, 2)).toEqual({ kind: "not_estimable" });
    expect(reportE1rm(60, 10, 0)).toMatchObject({ kind: "value" });
  });
  it("is null without load or reps", () => {
    expect(reportE1rm(null, 5, 1)).toBeNull();
  });
});
