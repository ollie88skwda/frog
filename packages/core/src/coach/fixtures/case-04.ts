// Case 4: short sleep + high stress, reps falling: C9d holds; C7 needs ≥3 prior; C8 blocks volume change.
import { expect } from "vitest";
import { type CaseFixture, EX, find, input, P, ruleIds, S, set } from "./build";

const dl = (md: string, top: string, sleep: number, stress: number) => {
  const s = S(md, "18:00", [top], {
    planned: P(3, 5, 2, 2, 1),
    exerciseId: "deadlift",
    sleep,
    stress,
  });
  s.exercises.push({
    exerciseId: "row",
    planned: null,
    sets: [1, 2, 3].map((n) => set("60x8@2", n)),
  });
  return s;
};
const s1 = dl("11-06", "140x5@2", 7.5, 3);
const s2 = dl("11-09", "140x4@2", 5, 8);
const s3 = dl("11-11", "140x3@1", 5.5, 9);
const ex = { exercises: [EX.deadlift, EX.row] };
export const fixture: CaseFixture = {
  id: 4,
  title:
    "short sleep + high stress week (C9d hold; C7 not yet; C8 blocks volume)",
  points: [
    {
      at: "11-09",
      input: input([s1, s2], ex),
      check: (r) => {
        const c = find(r, "C9d", "deadlift");
        expect(c?.action).toEqual({
          kind: "hold_load",
          exerciseId: "deadlift",
          loadKg: 140,
        });
        expect(c?.data?.backToBack).toBe(false);
        expect(find(r, "C7", "deadlift")).toBeUndefined();
      },
    },
    {
      at: "11-11",
      input: input([s1, s2, s3], ex),
      check: (r) => {
        const c = find(r, "C9d", "deadlift");
        expect(c?.data?.backToBack).toBe(true); // second back-to-back short night
        expect(find(r, "C7", "deadlift")).toBeUndefined(); // <3 prior comparable
        const ids = ruleIds(r);
        for (const banned of ["C10", "C14", "C4", "C5", "C11", "C12"])
          expect(ids).not.toContain(banned);
        expect(r.perExercise.get("deadlift")?.stalled).toBeNull();
        expect(r.banner?.ruleId).toBe("C9d");
      },
    },
  ],
};
