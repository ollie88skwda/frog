// Case 12: overshoot, then short-sleep hold, then normal-night add-load.
import { expect } from "vitest";
import { type CaseFixture, EX, find, input, S } from "./build";

const A = S("11-02", "18:00", ["80x10@2", "70x7@2"], { exerciseId: "bench" });
const B = S("11-05", "18:00", ["80x6@2", "70x7@2"], {
  exerciseId: "bench",
  sleep: 5,
  stress: 4,
});
const C = S("11-07", "18:00", ["82x6@2", "70x7@2"], { exerciseId: "bench" });
const ex = { exercises: [EX.bench] };
const empty = (md: string): ReturnType<typeof S> => ({
  ...S(md, "18:00", ["1x1@2"], { exerciseId: "bench" }),
  exercises: [],
});
export const fixture: CaseFixture = {
  id: 12,
  title: "overshoot → short-sleep hold → add-load on a normal night",
  points: [
    {
      at: "A 11-02",
      input: input([A], ex),
      check: (r) => {
        const st = r.perExercise.get("bench");
        expect(st?.pendingAddLoad?.loadKg).toBe(80);
        expect(find(r, "C2c-overshoot", "bench")?.action).toMatchObject({
          kind: "set_load",
          loadKg: 82,
        });
        // the 115.2 set (80x10@2 → 12 total reps) is flagged, not used
        expect(st?.sessionE1rms[0]).toMatchObject({ flagged: true });
        expect(st?.sessionE1rms[0].e1rm).toBeCloseTo(90, 2);
      },
    },
    {
      at: "B 11-05 (5.0 h sleep)",
      input: input([A, B], ex),
      check: (r) => {
        expect(find(r, "C9d", "bench")?.action).toEqual({
          kind: "hold_load",
          exerciseId: "bench",
          loadKg: 80,
        });
        expect(find(r, "C2c-overshoot", "bench")).toBeUndefined();
        expect(
          r.suppressed.some(
            (s) =>
              s.ruleId === "C2c-overshoot" && s.supersededBy?.startsWith("C9d"),
          ),
        ).toBe(true);
        expect(find(r, "C7")).toBeUndefined();
        expect(r.perExercise.get("bench")?.pendingAddLoad?.loadKg).toBe(80); // still pending
        expect(r.perExercise.get("bench")?.prescription).toMatchObject({
          loadKg: 80,
          delta: "hold",
        });
      },
    },
    {
      at: "C 11-07 (normal night, before the session)",
      input: input([A, B, empty("11-07")], ex),
      check: (r) => {
        expect(find(r, "C9d")).toBeUndefined();
        expect(r.perExercise.get("bench")?.prescription).toMatchObject({
          loadKg: 82,
          delta: "up",
        });
      },
    },
    {
      at: "C 11-07 (after)",
      input: input([A, B, C], ex),
      check: (r) => {
        const e = r.perExercise.get("bench")?.sessionE1rms;
        expect(e?.at(-1)?.e1rm).toBeCloseTo(101.79, 2);
        expect(e?.at(0)?.e1rm).toBeCloseTo(90, 2);
        expect(r.perExercise.get("bench")?.pendingAddLoad).toBeNull();
      },
    },
  ],
};
