// Case 10: C15 restart after 3 weeks off.
import { expect } from "vitest";
import { at, type CaseFixture, find, input, S } from "./build";

const prior = ["09-10", "09-14", "09-17", "09-21", "09-24", "09-28"].map((d) =>
  S(d, "18:00", ["100x5@2"]),
);
export const fixture: CaseFixture = {
  id: 10,
  title:
    "C15 restart at 85 kg (80-90) after a 21-day gap; no drop-load across the gap",
  points: [
    {
      at: "10-19 (before the session)",
      input: {
        ...input(prior),
        currentSessionId: undefined,
        asOf: at("10-19"),
      },
      check: (r) => {
        const c = find(r, "C15", "squat");
        expect(c?.action).toEqual({
          kind: "restart_load",
          exerciseId: "squat",
          loadKg: 85,
          rangeKg: [80, 90],
        });
        expect(
          r.suggestions.some((s) => s.ruleId === "C2" || s.ruleId === "C14"),
        ).toBe(false);
        expect(r.banner?.ruleId).toBe("C15");
        expect(r.perExercise.get("squat")?.prescription).toMatchObject({
          loadKg: 85,
          delta: "restart",
        });
      },
    },
  ],
};
