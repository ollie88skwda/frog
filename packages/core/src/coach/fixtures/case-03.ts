// Case 3: RIR drift above target: C5 (not C4).
import { expect } from "vitest";
import { type CaseFixture, EX, find, input, P, ruleIds, S } from "./build";

const o = { planned: P(5, 8, 2, 2, 3), exerciseId: "bench" };
export const fixture: CaseFixture = {
  id: 3,
  title: "RIR drift above target (C5 lowers target RIR 2 → 1; C4 silent)",
  points: [
    {
      at: "11-11",
      input: input(
        [
          S("11-07", "18:00", ["80x6@2", "80x6@4", "80x6@4"], o),
          S("11-09", "18:00", ["80x6@2", "80x6@3", "80x6@4"], {
            ...o,
            stress: 4,
          }),
          S("11-11", "18:00", ["80x6@2", "80x6@4", "80x6@4"], o),
        ],
        { exercises: [EX.bench] },
      ),
      check: (r) => {
        const c5 = find(r, "C5", "bench");
        expect(c5?.action).toEqual({
          kind: "set_target_rir",
          exerciseId: "bench",
          rir: [1, 1],
          forDays: 7,
        });
        expect(ruleIds(r)).not.toContain("C4");
        expect(ruleIds(r)).not.toContain("C1");
        expect(c5?.data?.share).toBe(1);
      },
    },
  ],
};
