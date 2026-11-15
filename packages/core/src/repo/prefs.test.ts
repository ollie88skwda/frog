import { describe, expect, it } from "vitest";
import type { UserPrefs } from "../db/schema";
import { resolveUserPrefs, USER_PREF_DEFAULTS } from "./prefs";

const legacy: UserPrefs = {
  id: "p1",
  createdAt: 1,
  updatedAt: 2,
  deletedAt: null,
  ownerId: "u",
  includeWarmupsInStats: true,
  defaultRestSec: null,
  previousValuesScope: "routine",
  bodyDiagram: "neutral",
  plateConfig: null,
  displayName: "Ol",
  bio: null,
  goal: null,
  trainingStatus: null,
  exerciseGrouping: null,
  coachEnabled: null,
  coachRulesOff: null,
  showEvidenceLabels: null,
  hardSetRirMax: null,
};

describe("resolveUserPrefs (redesign §9.2)", () => {
  it("fills §9.2 defaults for a pre-redesign row, keeping saved values", () => {
    const p = resolveUserPrefs(legacy);
    expect(p.exerciseGrouping).toBe("joint_action");
    expect(p.coachEnabled).toBe(true);
    expect(p.coachRulesOff).toEqual([]);
    expect(p.showEvidenceLabels).toBe(true);
    expect(p.hardSetRirMax).toBe(4); // R6
    expect(p.goal).toBeNull();
    // existing users keep their saved warm-up choice (R17b only flips new users)
    expect(p.includeWarmupsInStats).toBe(true);
    expect(p.previousValuesScope).toBe("routine");
    expect(p.displayName).toBe("Ol");
  });

  it("new users (no row) exclude warm-ups from stats", () => {
    expect(resolveUserPrefs(null).includeWarmupsInStats).toBe(false);
    expect(USER_PREF_DEFAULTS.includeWarmupsInStats).toBe(false);
  });

  it("saved values win over defaults", () => {
    const p = resolveUserPrefs({
      ...legacy,
      goal: "cut",
      coachRulesOff: ["C7"],
      hardSetRirMax: 3,
      coachEnabled: false,
    });
    expect([p.goal, p.hardSetRirMax, p.coachEnabled]).toEqual([
      "cut",
      3,
      false,
    ]);
    expect(p.coachRulesOff).toEqual(["C7"]);
  });
});
