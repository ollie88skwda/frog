// Case 2: bad day inside the noise band: C1 only.
import { expect } from "vitest";
import { type CaseFixture, find, input, ruleIds, S } from "./build";

export const fixture: CaseFixture = {
  id: 2,
  title: "bad day inside the 10% band (fires C1 only)",
  points: [
    {
      at: "10-19",
      input: input([
        S("10-08", "18:00", ["100x5@2"]),
        S("10-12", "18:00", ["102.5x5@2"]),
        S("10-15", "18:00", ["100x6@2"]),
        S("10-19", "18:00", ["100x4@2", "90x7@2"]),
      ]),
      check: (r) => {
        expect(ruleIds(r)).toEqual(["C1"]);
        expect(find(r, "C1")?.message).toContain("rough day");
        const st = r.perExercise.get("squat");
        expect(st?.baselineMedian).toBeCloseTo(123, 2);
        expect(st?.dropPct).toBeCloseTo(0.0558, 3);
        expect(st?.sessionE1rms.at(-1)?.e1rm).toBeCloseTo(116.13, 2);
        expect(st?.stalled).toBeNull();
      },
    },
  ],
};
