// Case 8: a one-off spike then flat is a stall (the spike is never matched).
import { expect } from "vitest";
import { type CaseFixture, find, input, P, S } from "./build";

const p = P(5, 8, 2, 2, 1);
const days = [
  "09-07",
  "09-10",
  "09-14",
  "09-17",
  "09-21",
  "09-24",
  "09-28",
  "10-01",
];
export const fixture: CaseFixture = {
  id: 8,
  title: "one-off spike then flat is a stall (C2c-stall → C2 shift heavier)",
  points: [
    {
      at: "10-01",
      input: input(
        days.map((d) =>
          S(d, "18:00", [d === "09-21" ? "100x6@2" : "100x5@2"], {
            planned: p,
          }),
        ),
      ),
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
