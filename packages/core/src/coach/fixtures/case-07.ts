// Case 7: steady small gains are not a stall.
import { expect } from "vitest";
import { type CaseFixture, input, S } from "./build";

const loads: [string, number][] = [
  ["10-05", 100],
  ["10-08", 100],
  ["10-12", 102],
  ["10-15", 102],
  ["10-19", 104],
  ["10-22", 104],
  ["10-26", 106],
  ["10-29", 106],
];
export const fixture: CaseFixture = {
  id: 7,
  title: "steady small gains are not a stall",
  points: [
    {
      at: "10-29",
      input: input(loads.map(([d, kg]) => S(d, "18:00", [`${kg}x5@2`]))),
      check: (r) => {
        const st = r.perExercise.get("squat");
        expect(st?.stalled).toBe(false);
        expect(st?.dropPct ?? 0).toBeLessThan(0.1);
        expect(r.suggestions.map((s) => s.ruleId)).toEqual([]);
        expect(st?.sessionE1rms.at(-1)?.e1rm).toBeCloseTo(127.2, 2);
      },
    },
  ],
};
