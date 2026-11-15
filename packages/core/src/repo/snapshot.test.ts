import { describe, expect, it } from "vitest";
import { buildSnapshot } from "../../../../convex/snapshot";

const set = (setNo: number, over: Record<string, unknown> = {}) => ({
  setNo,
  setType: "normal",
  targetWeightKg: null,
  targetReps: null,
  targetRepsMax: null,
  targetRirMin: null,
  targetRirMax: null,
  ...over,
});

describe("buildSnapshot (redesign §9.1; R17b warm-ups are not working sets)", () => {
  it("snapshots first-working-set targets and counts working sets only", () => {
    const snap = buildSnapshot([
      set(0, { setType: "warmup", targetReps: 12 }),
      set(1, {
        targetWeightKg: 100,
        targetReps: 6,
        targetRepsMax: 8,
        targetRirMin: 1,
        targetRirMax: 2,
      }),
      set(2, { targetReps: 8 }),
      set(3, { targetReps: 8, deletedAt: 5 }),
    ]);
    expect(snap).toMatchObject({
      plannedRepsMin: 6,
      plannedRepsMax: 8,
      plannedRirMin: 1,
      plannedRirMax: 2,
      plannedSets: 2,
      plannedLoadKg: 100,
      plannedIsDeload: false,
      snapshotSource: "start",
      prescriptionRuleId: null,
    });
  });

  it("single rep target and single RIR collapse to a degenerate range", () => {
    const snap = buildSnapshot([set(1, { targetReps: 5, targetRirMax: 3 })]);
    expect([snap.plannedRepsMin, snap.plannedRepsMax]).toEqual([5, 5]);
    expect([snap.plannedRirMin, snap.plannedRirMax]).toEqual([3, 3]);
  });

  it("a routine with no targets yields nulls, not zeros", () => {
    const snap = buildSnapshot([]);
    expect(snap.plannedSets).toBeNull();
    expect(snap.plannedRepsMin).toBeNull();
    expect(snap.plannedLoadKg).toBeNull();
  });

  it("coach override wins field by field and records the rule", () => {
    const snap = buildSnapshot(
      [set(1, { targetWeightKg: 100, targetReps: 6, targetRepsMax: 8 })],
      {
        plannedLoadKg: 102.5,
        prescriptionRuleId: "C2c-progress",
        plannedFirstSetMax: true,
        plannedIsDeload: true,
        plannedSets: 1,
      },
    );
    expect(snap).toMatchObject({
      plannedLoadKg: 102.5,
      plannedRepsMin: 6,
      plannedRepsMax: 8,
      prescriptionRuleId: "C2c-progress",
      plannedFirstSetMax: true,
      plannedIsDeload: true,
      plannedSets: 1,
    });
  });

  it("an explicit null override clears a routine value", () => {
    const snap = buildSnapshot([set(1, { targetWeightKg: 100 })], {
      plannedLoadKg: null,
    });
    expect(snap.plannedLoadKg).toBeNull();
  });
});
