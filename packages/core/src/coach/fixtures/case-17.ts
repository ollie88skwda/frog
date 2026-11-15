// Case 17: C10 short-sleep share + falling weekly bests; C14 stays off at exactly -2.5%.
import { expect } from "vitest";
import { type CaseFixture, find, input, S } from "./build";

const s = [
  S("10-19", "18:00", ["100x6@2", "90x7@2"]),
  S("10-22", "18:00", ["100x6@2", "90x7@2"], { sleep: 7, stress: 4 }),
  S("10-26", "18:00", ["100x5@2", "90x7@2"]),
  S("10-29", "18:00", ["100x5@2", "90x7@2"], { sleep: 5.5, stress: 5 }),
  S("11-02", "18:00", ["97.5x5@2", "85x7@2"], { sleep: 5, stress: 6 }),
  S("11-05", "18:00", ["95x5@2", "85x7@2"], { sleep: 5.5, stress: 5 }),
];
export const fixture: CaseFixture = {
  id: 17,
  title: "C10 fires at 75% short sleep; C14 does not at exactly -2.50%",
  points: [
    {
      at: "11-02 (50% short sleep, -2.50%)",
      input: input(s.slice(0, 5)),
      check: (r) => {
        expect(find(r, "C10")).toBeUndefined();
        expect(find(r, "C14")).toBeUndefined();
        expect(find(r, "C9d", "squat")?.data?.backToBack).toBe(true);
      },
    },
    {
      at: "11-05",
      input: input(s),
      check: (r) => {
        const c = find(r, "C10", "squat");
        expect(c?.action).toMatchObject({
          kind: "deload",
          setsPerExercise: { squat: 1 },
          loadKg: { squat: 95 },
          rir: [3, 4],
        });
        expect(c?.data?.share).toBeCloseTo(0.75, 2);
        expect(find(r, "C14")).toBeUndefined();
        // short-sleep hold fired, but the deload (same loads) outranks it
        expect(
          r.suppressed.some(
            (x) => x.ruleId === "C9d" && x.supersededBy?.startsWith("C10"),
          ),
        ).toBe(true);
        expect(find(r, "C7")).toBeUndefined();
        expect(find(r, "C2c-stall")).toBeUndefined();
        expect(r.banner?.ruleId).toBe("C10");
        expect(r.perExercise.get("squat")?.prescription).toMatchObject({
          loadKg: 95,
          sets: 1,
          delta: "deload",
        });
      },
    },
  ],
};
