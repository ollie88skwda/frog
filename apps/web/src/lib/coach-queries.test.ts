import type { RoutineDetail } from "@frog/core";
import { describe, expect, it } from "vitest";
import {
  estimateMinutes,
  formatReps,
  formatRir,
  restartGapDays,
  routinePrescription,
} from "./coach-queries";

const set = (o: Record<string, unknown>) => ({ setType: "normal", ...o });
const ex = {
  id: "re1",
  exerciseId: "e1",
  exerciseName: "RDL",
  restSec: 120,
  sets: [
    set({ setType: "warmup", targetWeightKg: 40, targetReps: 6 }),
    set({
      targetWeightKg: 100,
      targetReps: 6,
      targetRepsMax: 8,
      targetRirMin: 1,
      targetRirMax: 3,
    }),
    set({ targetWeightKg: 100, targetReps: 6, targetRepsMax: 8 }),
  ],
} as never;

describe("routine-stub prescription", () => {
  it("excludes warm-ups and reads the first working set", () => {
    const p = routinePrescription(ex);
    expect(p.sets).toBe(2);
    expect(p.loadKg).toBe(100);
    expect(formatReps(p)).toBe("6-8");
    expect(formatRir(p)).toBe("@1-3");
  });
  it("estimates minutes from working sets only", () => {
    const d = { routine: {}, exercises: [ex] } as unknown as RoutineDetail;
    expect(estimateMinutes(d)).toBe(5);
  });
});

describe("C15 restart gap", () => {
  const now = Date.UTC(2026, 10, 13);
  it("fires at 14+ days", () => {
    expect(restartGapDays(now - 14 * 86_400_000, now)).toBe(14);
    expect(restartGapDays(now - 13 * 86_400_000, now)).toBeNull();
    expect(restartGapDays(null, now)).toBeNull();
  });
});
