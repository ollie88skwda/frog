// Case 6: dormant protein rule (C16) must not fire even with protein_g present.
import { expect } from "vitest";
import { type CaseFixture, input, S } from "./build";

const sess = ["11-06", "11-09", "11-11"].map((d) =>
  S(d, "18:00", ["100x6@2", "90x7@2"], { carbs: 60 }),
);
const bw = ["11-06", "11-09", "11-11"].map((d) => ({
  measuredOn: `2026-${d}`,
  kg: 80,
}));
export const fixture: CaseFixture = {
  id: 6,
  title:
    "dormant C16 never fires (flag on or off); C19 shows carbs with no message",
  points: [
    {
      at: "11-11 (feature off)",
      input: input(sess, { bodyweight: bw }),
      check: (r) => {
        expect(r.suggestions.map((s) => s.ruleId)).toEqual([]);
        const n = r.notEvaluated.find((x) => x.ruleId === "C16");
        expect(n?.reason).toBe("dormant");
      },
    },
    {
      at: "11-11 (proteinG flag on)",
      input: input(sess, {
        bodyweight: bw,
        prefs: { features: { proteinG: true } },
      }),
      check: (r) => {
        expect(r.suggestions).toEqual([]);
        const n = r.notEvaluated.find((x) => x.ruleId === "C16");
        expect(n?.reason).toBe("dormant");
        expect(n?.detail).toContain("not implemented");
      },
    },
  ],
};
