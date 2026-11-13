// Case 9: C14 deload after two declining weeks, before any C2 drop-load.
import { expect } from "vitest";
import { type CaseFixture, find, input, S } from "./build";

const sessions = [
  S("10-05", "18:00", ["100x6@2", "90x7@2"]),
  S("10-08", "18:00", ["100x6@2", "90x7@2"]),
  S("10-12", "18:00", ["100x6@2", "90x7@2"]),
  S("10-15", "18:00", ["100x6@2", "90x7@2"]),
  S("10-19", "18:00", ["100x5@2", "90x7@2"]),
  S("10-22", "18:00", ["100x5@2", "90x7@2"]),
  S("10-26", "18:00", ["95x5@2", "85x7@2"]),
];
export const fixture: CaseFixture = {
  id: 9,
  title: "C14 fires before C2 drop-load: deload 1 set at 95 kg, 3-4 RIR",
  points: [
    {
      at: "10-26",
      input: input(sessions),
      check: (r) => {
        const c = find(r, "C14", "squat");
        expect(c?.action).toEqual({
          kind: "deload",
          exerciseIds: ["squat"],
          setsPerExercise: { squat: 1 },
          loadKg: { squat: 95 },
          rir: [3, 4],
          weeks: 1,
        });
        // Stall is confirmed on the trigger session but waits (deload first).
        expect(r.perExercise.get("squat")?.stalled).toBe(true);
        expect(find(r, "C2c-stall")).toBeUndefined();
        expect(
          r.suppressed.some(
            (s) => s.ruleId === "C2c-stall" && s.supersededBy === c?.id,
          ),
        ).toBe(true);
        expect(r.suggestions.some((s) => s.action.kind === "set_load")).toBe(
          false,
        );
        expect(r.perExercise.get("squat")?.dropPct).toBeCloseTo(0.082, 3);
        expect(r.banner?.ruleId).toBe("C14");
        expect(r.perExercise.get("squat")?.prescription).toMatchObject({
          loadKg: 95,
          sets: 1,
          rir: [3, 4],
          delta: "deload",
        });
      },
    },
  ],
};
