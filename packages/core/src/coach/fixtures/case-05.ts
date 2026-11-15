// Case 5: body-weight average with too few entries (C17 count gate).
import { expect } from "vitest";
import { type CaseFixture, input, S } from "./build";

const sess = [S("11-12", "18:00", ["100x5@2"])];
const three = [
  { measuredOn: "2026-11-06", kg: 82.4 },
  { measuredOn: "2026-11-09", kg: 82.1 },
  { measuredOn: "2026-11-11", kg: 81.9 },
];
export const fixture: CaseFixture = {
  id: 5,
  title: "7-day body-weight average needs ≥4 entries; rate needs both windows",
  points: [
    {
      at: "11-12 (3 entries)",
      input: input(sess, { bodyweight: three }),
      check: (r) => {
        expect(r.bodyweight.avg7).toBeNull();
        expect(r.bodyweight.weeklyRatePct).toBeNull();
        expect(r.bodyweight.n).toBe(3);
      },
    },
    {
      at: "11-12 (4th entry, prior window short)",
      input: input(sess, {
        bodyweight: [...three, { measuredOn: "2026-11-12", kg: 81.7 }],
      }),
      check: (r) => {
        expect(r.bodyweight.avg7).toBeCloseTo(82.025, 3);
        expect(r.bodyweight.weeklyRatePct).toBeNull();
      },
    },
  ],
};
