// Case 11: C19 shows carbs beside e1RM, never a target or a message.
import { expect } from "vitest";
import { type CaseFixture, input, S } from "./build";

export const fixture: CaseFixture = {
  id: 11,
  title: "C19 carbs shown beside session e1RM; no carb message",
  points: [
    {
      at: "10-12",
      input: input([
        S("10-05", "18:00", ["100x6@2", "90x7@2"], { carbs: 60 }),
        S("10-08", "18:00", ["100x5@2", "90x7@2"], { carbs: 25 }),
        S("10-12", "18:00", ["100x6@2", "90x7@2"], { carbs: 65 }),
      ]),
      check: (r) => {
        const st = r.perExercise.get("squat");
        expect(st?.sessionE1rms.map((s) => s.carbsG)).toEqual([60, 25, 65]);
        expect(r.suggestions.some((s) => s.ruleId === "C19")).toBe(false);
        expect(r.suggestions.some((s) => /carb/i.test(s.message))).toBe(false);
        expect(r.suggestions.some((s) => s.ruleId === "C2")).toBe(false);
      },
    },
  ],
};
