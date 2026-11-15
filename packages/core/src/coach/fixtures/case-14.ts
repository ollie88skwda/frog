// Case 14: near-miss at exactly 10:00 (strict boundary), plus the 09:59 and 31.5 kg variants.
import { expect } from "vitest";
import { type CaseFixture, find, input, S } from "./build";

const prior = [
  S("10-22", "18:00", ["102.5x5@2", "90x7@2"]),
  S("10-26", "18:00", ["102.5x6@2", "90x7@2"], { sleep: 7, stress: 4 }),
  S("10-29", "18:00", ["102.5x5@2", "90x7@2"]),
  S("11-02", "18:00", ["102.5x6@2", "90x7@2"], { sleep: 8, stress: 2 }),
  S("11-05", "18:00", ["102.5x5@2", "90x7@2"]),
  S("11-09", "18:00", ["102.5x6@2", "90x7@2"], { stress: 4 }),
];
const today = (hm: string, light: string) =>
  input([...prior, S("11-12", hm, ["102.5x5@2", "90x7@2", `${light}x7@2`])]);
export const fixture: CaseFixture = {
  id: 14,
  title:
    "C9b boundary: 10:00 does not fire, 09:59 does, 31.5 kg (25.18%) does not",
  points: [
    {
      at: "11-12 10:00, 30 kg",
      input: today("10:00", "30"),
      check: (r) => expect(find(r, "C9b")).toBeUndefined(),
    },
    {
      at: "11-12 09:59, 30 kg",
      input: today("09:59", "30"),
      check: (r) => {
        expect(find(r, "C9b")?.data?.baseline).toBeCloseTo(125.12, 2);
        expect(find(r, "C9b")?.data?.lightPct).toBeCloseTo(23.98, 2);
      },
    },
    {
      at: "11-12 10:00, 31.5 kg",
      input: today("10:00", "31.5"),
      check: (r) => expect(find(r, "C9b")).toBeUndefined(),
    },
    {
      at: "11-12 09:59, 31.5 kg",
      input: today("09:59", "31.5"),
      check: (r) => expect(find(r, "C9b")).toBeUndefined(),
    },
  ],
};
