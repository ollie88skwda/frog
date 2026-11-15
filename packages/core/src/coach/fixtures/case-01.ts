// Case 1: flat squat, no stall yet. A 7th comparable session with no new best fires C2c-stall.
import { expect } from "vitest";
import { type CaseFixture, EX, find, input, planChanging, S } from "./build";

const six = [
  S("10-05", "18:00", ["100x6@2", "90x7@2"], { carbs: 60, caffeine: 150 }),
  S("10-08", "18:00", ["100x5@2", "90x7@2"], {
    sleep: 7,
    stress: 4,
    carbs: 55,
    caffeine: 0,
  }),
  S("10-12", "18:00", ["102.5x5@2", "92.5x6@2"], {
    sleep: 8,
    stress: 2,
    carbs: 70,
  }),
  S("10-15", "18:00", ["100x6@2", "90x7@2"]),
  S("10-19", "18:00", ["100x5@2", "90x7@2"], {
    sleep: 6.5,
    stress: 5,
    carbs: 50,
    caffeine: 100,
  }),
  S("10-22", "18:00", ["102.5x5@2", "92.5x6@2"], { carbs: 65 }),
];
export const fixture: CaseFixture = {
  id: 1,
  title: "flat squat, no stall yet (C2c-stall needs a 7th comparable session)",
  points: [
    {
      at: "10-22 (six sessions)",
      input: input(six),
      check: (r) => {
        const st = r.perExercise.get("squat");
        expect(st?.stalled).toBeNull();
        expect(st?.comparableSessions).toBe(6);
        expect(planChanging(r)).toEqual([]);
        expect(r.suggestions).toEqual([]);
        expect(
          r.notEvaluated.some(
            (n) => n.ruleId === "C2c-stall" && n.reason === "too_few_sessions",
          ),
        ).toBe(true);
        expect(st?.sessionE1rms.map((s) => +s.e1rm.toFixed(2))).toEqual([
          124.14, 120, 123, 124.14, 120, 123,
        ]);
      },
    },
    {
      at: "10-26 (seventh, no best above 124.14)",
      input: input([...six, S("10-26", "18:00", ["100x5@2", "90x7@2"])]),
      check: (r) => {
        expect(r.perExercise.get("squat")?.stalled).toBe(true);
        expect(find(r, "C2c-stall", "squat")?.action).toMatchObject({
          kind: "change_rep_range",
          reps: [4, 6],
        });
      },
    },
  ],
};
void EX;
