// Case 18: small-machine step fallback, then reps restart at 10.
import { expect } from "vitest";
import { type CaseFixture, EX, find, input, P, S } from "./build";

const plan = P(10, 15, 1, 3, 2, {
  perSetRir: [
    { min: 1, max: 3 },
    { min: 0, max: 1 },
  ],
});
const o = { planned: plan, exerciseId: "legext" };
const s1 = S("11-02", "18:00", ["20x15@1", "20x15@2"], o);
const s2 = S("11-05", "18:00", ["20x15@1", "20x15@2"], o);
const s3 = S("11-09", "18:00", ["21x10@2", "21x10@1"], o);
const withStep = (stepKg: number | null) => ({
  exercises: [{ ...EX.legext, stepKg }],
});
export const fixture: CaseFixture = {
  id: 18,
  title:
    "machine step: text fallback with no step; 1 kg add-on → 21 kg at 10-15",
  points: [
    {
      at: "11-05 (no step field)",
      input: input([s1, s2], { exercises: [EX.legext] }),
      check: (r) => {
        const c = find(r, "C2c-progress", "legext");
        expect(c?.action.kind).toBe("text_only");
        expect(c?.data?.fallback).toBe("no_step");
        expect(r.perExercise.get("legext")?.pendingAddLoad?.loadKg).toBe(20);
        expect(find(r, "C4")).toBeUndefined();
        expect(find(r, "C5")).toBeUndefined();
      },
    },
    {
      at: "11-05 (2.5 kg step is >10% of 20 kg)",
      input: input([s1, s2], withStep(2.5)),
      check: (r) =>
        expect(find(r, "C2c-progress", "legext")?.data?.fallback).toBe(
          "step_too_big",
        ),
    },
    {
      at: "11-05 (1 kg add-on available)",
      input: input([s1, s2], withStep(1)),
      check: (r) => {
        const a = find(r, "C2c-progress", "legext")?.action;
        expect(a).toMatchObject({
          kind: "set_load",
          loadKg: 21,
          reps: [10, 15],
        });
      },
    },
    {
      at: "11-09",
      input: input([s1, s2, s3], withStep(1)),
      check: (r) => {
        expect(r.perExercise.get("legext")?.pendingAddLoad).toBeNull();
        expect(find(r, "C4")).toBeUndefined();
        expect(find(r, "C5")).toBeUndefined(); // 2 of 6 sets off plan
      },
    },
  ],
};
