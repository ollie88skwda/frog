// Case 16: stall and drop on the same session: rep-range shift at 100 kg, never a load drop.
import { expect } from "vitest";
import { type CaseFixture, find, input, S } from "./build";

const sessions = [
  S("10-19", "18:00", ["100x6@2", "90x7@2"]),
  S("10-22", "18:00", ["100x6@2", "90x7@2"]),
  S("10-26", "18:00", ["100x5@2", "90x7@2"]),
  S("10-29", "18:00", ["100x5@2", "90x7@2"]),
  S("11-02", "18:00", ["100x6@2", "90x7@2"]),
  S("11-05", "18:00", ["100x6@2", "90x7@2"]),
  S("11-09", "18:00", ["90x5@2", "80x7@2"]),
];
export const fixture: CaseFixture = {
  id: 16,
  title: "stall + 13% drop on one session → 4-6 reps at 100 kg, no load drop",
  points: [
    {
      at: "11-09",
      input: input(sessions),
      check: (r) => {
        const st = r.perExercise.get("squat");
        expect(st?.stalled).toBe(true);
        expect(st?.dropPct).toBeCloseTo(0.13, 2);
        const c = find(r, "C2c-stall", "squat");
        expect(c?.action).toMatchObject({
          kind: "change_rep_range",
          reps: [4, 6],
        });
        expect(c?.data?.loadKg).toBe(100);
        expect(r.suggestions.some((s) => s.action.kind === "set_load")).toBe(
          false,
        );
        for (const banned of ["C14", "C7"])
          expect(find(r, banned)).toBeUndefined();
        expect(st?.prescription).toMatchObject({
          loadKg: 100,
          reps: [4, 6],
          delta: "range",
        });
      },
    },
  ],
};
