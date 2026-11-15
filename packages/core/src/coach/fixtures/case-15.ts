// Case 15: overshoot on the heaviest set only: add load next session (102.5 kg).
import { expect } from "vitest";
import { type CaseFixture, find, input, S } from "./build";

const base = [
  S("10-19", "18:00", ["100x6@2", "90x7@2"]),
  S("10-22", "18:00", ["100x6@2", "90x7@2"]),
  S("10-26", "18:00", ["100x6@2", "90x7@2"]),
];
const s4 = S("10-29", "18:00", ["100x10@2", "95x7@2"]);
const next = { ...S("11-02", "18:00", ["1x1@2"]), exercises: [] };
export const fixture: CaseFixture = {
  id: 15,
  title:
    "overshoot on the heaviest set: next session 102.5 kg; the 100x10 set is excluded",
  points: [
    {
      at: "10-29",
      input: input([...base, s4]),
      check: (r) => {
        const st = r.perExercise.get("squat");
        expect(st?.sessionE1rms.at(-1)?.e1rm).toBeCloseTo(122.14, 2);
        expect(st?.dropPct).toBeCloseTo(0.016, 3);
        expect(find(r, "C2c-overshoot", "squat")).toBeDefined();
        for (const banned of ["C14", "C2", "C7", "C9d", "C1"])
          expect(find(r, banned)).toBeUndefined();
        expect(st?.stalled).toBeNull();
      },
    },
    {
      at: "11-02 (before the session)",
      input: input([...base, s4, next]),
      check: (r) => {
        expect(r.perExercise.get("squat")?.prescription).toMatchObject({
          loadKg: 102.5,
          delta: "up",
          ruleId: "C2c-overshoot",
        });
      },
    },
  ],
};
