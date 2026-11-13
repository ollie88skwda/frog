// Case 19: the exercise swap waits until the C2 steps are used up.
import { expect } from "vitest";
import type { CoachSession } from "../types";
import { type CaseFixture, find, input, P, S } from "./build";

const WEEK = 7 * 86_400_000;
const start = Date.parse("2026-01-05T18:00:00Z"); // a Monday
function week(
  n: number,
  top: string,
  plan: ReturnType<typeof P>,
): CoachSession {
  const s = S("01-05", "18:00", [top], { planned: plan });
  s.id = `w${n}`;
  s.startedAt = start + (n - 1) * WEEK;
  s.endedAt = s.startedAt + 3_600_000;
  return s;
}
const block1 = Array.from({ length: 7 }, (_, i) =>
  week(i + 1, i % 2 ? "100x5@2" : "100x6@2", P(5, 8, 2, 2, 2)),
);
const block2 = Array.from({ length: 7 }, (_, i) =>
  week(i + 8, "100x5@2", P(4, 6, 2, 2, 2)),
);
const block3 = Array.from({ length: 7 }, (_, i) =>
  week(i + 15, "100x3@2", P(3, 4, 2, 2, 2)),
);
export const fixture: CaseFixture = {
  id: 19,
  title: "swap waits: 5-8 → 4-6 → 3-4 → add a set; C3 never fires early",
  points: [
    {
      at: "week 7",
      input: input(block1),
      check: (r) => {
        expect(r.perExercise.get("squat")?.stalled).toBe(true);
        expect(find(r, "C2c-stall", "squat")?.action).toMatchObject({
          kind: "change_rep_range",
          reps: [4, 6],
        });
        expect(find(r, "C3")).toBeUndefined();
        expect(find(r, "C14")).toBeUndefined();
      },
    },
    {
      at: "week 14",
      input: input([...block1, ...block2]),
      check: (r) => {
        expect(r.perExercise.get("squat")?.stalled).toBe(true);
        expect(find(r, "C2c-stall", "squat")?.action).toMatchObject({
          kind: "change_rep_range",
          reps: [3, 4],
        });
        expect(find(r, "C3")).toBeUndefined();
      },
    },
    {
      at: "week 21",
      input: input([...block1, ...block2, ...block3]),
      check: (r) => {
        expect(r.perExercise.get("squat")?.stalled).toBe(true);
        expect(find(r, "C2c-stall", "squat")?.action).toEqual({
          kind: "add_set",
          exerciseId: "squat",
        });
        expect(find(r, "C3")).toBeUndefined();
        expect(find(r, "C14")).toBeUndefined();
      },
    },
  ],
};
