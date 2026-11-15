// Case 13: morning light-load note (C9b) fires: advice only.
import { expect } from "vitest";
import { type CaseFixture, find, input, planChanging, S } from "./build";

const prior = [
  S("10-19", "18:00", ["100x5@2", "90x7@2"]),
  S("10-22", "18:00", ["100x6@2", "90x7@2"], { sleep: 7, stress: 4 }),
  S("10-26", "18:00", ["100x5@2", "90x7@2"], { sleep: 8, stress: 2 }),
  S("10-29", "18:00", ["100x6@2", "90x7@2"]),
  S("11-02", "18:00", ["100x5@2", "90x7@2"], { sleep: 6.5, stress: 5 }),
  S("11-05", "18:00", ["100x6@2", "90x7@2"]),
];
export const fixture: CaseFixture = {
  id: 13,
  title: "C9b fires at 07:30 with a 30 kg light set (baseline 122.07, 24.58%)",
  points: [
    {
      at: "11-09 07:30",
      input: input([
        ...prior,
        S("11-09", "07:30", ["100x5@2", "90x7@2", "30x7@2"]),
      ]),
      check: (r) => {
        const c = find(r, "C9b", "squat");
        expect(c?.evidenceTier).toBe("T3");
        expect(c?.action.kind).toBe("text_only");
        expect(c?.data?.baseline).toBeCloseTo(122.07, 2);
        expect(c?.data?.lightPct).toBeCloseTo(24.58, 2);
        const st = r.perExercise.get("squat");
        expect(st?.sessionE1rms.at(-1)?.e1rm).toBeCloseTo(120, 2); // 30 kg set is not used
        expect(st?.stalled).toBe(false);
        expect(planChanging(r)).toEqual([]);
      },
    },
  ],
};
