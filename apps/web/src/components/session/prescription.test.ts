import { describe, expect, it } from "vitest";
import {
  driftNudge,
  formatRange,
  planFromSeed,
  planFromSnapshot,
  rangeState,
  reportE1rm,
  rirPreselect,
  setTarget,
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
  const at = (...rirs: (number | null)[]) =>
    rirs.map((rir) => ({ rir, planned }));
  it("never fires with fewer than two logged sets", () => {
    expect(driftNudge(at(5))).toBeNull();
  });
  it("fires when the last two sets are 2+ above plan", () => {
    expect(driftNudge(at(2, 5, 5))).toBe("last two sets ~5 left, plan is 1-3");
  });
  it("stays quiet when either of the last two is near plan or blank", () => {
    expect(driftNudge(at(1, 5))).toBeNull();
    expect(driftNudge(at(5, null))).toBeNull();
  });
  it("judges each set against its own planned RIR", () => {
    // top set planned 0-1, back-offs planned 3-4: back-offs at 4 are on plan
    expect(
      driftNudge([
        { rir: 1, planned: { rirMin: 0, rirMax: 1 } },
        { rir: 4, planned: { rirMin: 3, rirMax: 4 } },
        { rir: 4, planned: { rirMin: 3, rirMax: 4 } },
      ]),
    ).toBeNull();
  });
});

describe("setTarget (back-off sets)", () => {
  const top = {
    setType: "normal",
    weightKg: 100,
    reps: 4,
    repsMax: 6,
    rirMin: 1,
    rirMax: 2,
  };
  const backoff = { setType: "normal", weightKg: 85, reps: 8, repsMax: 10 };
  const plan = planFromSeed([top, backoff]);
  it("uses the set's own seed range, inheriting the plan's RIR", () => {
    const t = setTarget(plan, backoff);
    expect(t).toEqual({ repsMin: 8, repsMax: 10, rirMin: 1, rirMax: 2 });
    // 85 x 10 is the top of 8-10, not "+4 over" the top set's 4-6
    expect(
      rangeState({
        reps: 10,
        repsMin: 8,
        repsMax: 10,
        rir: 1,
        plannedRirMin: 1,
        plannedRirMax: 2,
      })?.kind,
    ).toBe("top");
  });
  it("falls back to the plan without a working seed", () => {
    expect(setTarget(plan, undefined)).toBe(plan);
  });
});

describe("reportE1rm (C2c-e1rm)", () => {
  it("is Brzycki with RIR", () => {
    // 100 x 8 @ 2 -> 100*36/27 = 133.3 -> 133.5 at 0.5 kg
    expect(reportE1rm({ weightKg: 100, reps: 8, rir: 2 })).toEqual({
      kind: "value",
      kg: 133.5,
    });
  });
  it("flags sets over 10 total reps", () => {
    expect(reportE1rm({ weightKg: 60, reps: 10, rir: 2 })).toEqual({
      kind: "not_estimable",
    });
    expect(reportE1rm({ weightKg: 60, reps: 10, rir: 0 })).toMatchObject({
      kind: "value",
    });
  });
  it("reads a logged RIR range by its midpoint, like core", () => {
    // 100 x 8 @ 1-3 -> RIR 2 -> 100*36/27 = 133.3 -> 133.5
    expect(
      reportE1rm({ weightKg: 100, reps: 8, rirMin: 1, rirMax: 3 }),
    ).toEqual({ kind: "value", kg: 133.5 });
  });
  it("is null without load or reps", () => {
    expect(reportE1rm({ weightKg: null, reps: 5, rir: 1 })).toBeNull();
  });
});
