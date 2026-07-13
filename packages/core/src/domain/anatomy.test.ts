import { describe, expect, it } from "vitest";
import {
  ACTION_RATINGS,
  groupByPrimaryMuscle,
  JOINT_ACTIONS,
  MUSCLES,
  type MuscleTarget,
  ratingsForMuscle,
} from "./anatomy";

const KEBAB = /^[a-z0-9]+(-[a-z0-9]+)*$/;

describe("anatomy vocabulary", () => {
  it("muscle keys are unique kebab-case", () => {
    const keys = MUSCLES.map((m) => m.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const k of keys) expect(k).toMatch(KEBAB);
  });

  it("joint-action keys are unique kebab-case", () => {
    const keys = JOINT_ACTIONS.map((a) => a.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const k of keys) expect(k).toMatch(KEBAB);
  });

  it("every rating references known vocab, unique per pair", () => {
    const muscleKeys = new Set(MUSCLES.map((m) => m.key));
    const actionKeys = new Set(JOINT_ACTIONS.map((a) => a.key));
    const pairs = new Set<string>();
    for (const r of ACTION_RATINGS) {
      expect(muscleKeys.has(r.muscle), r.muscle).toBe(true);
      expect(actionKeys.has(r.jointAction), r.jointAction).toBe(true);
      const pair = `${r.muscle}:${r.jointAction}`;
      expect(pairs.has(pair), pair).toBe(false);
      pairs.add(pair);
    }
  });

  it("every muscle has ratings, ranked best-first (S or A on top)", () => {
    for (const m of MUSCLES) {
      const ratings = ratingsForMuscle(m.key);
      expect(ratings.length, m.key).toBeGreaterThan(0);
      expect(["S", "A"], m.key).toContain(ratings[0]?.tier);
    }
  });
});

describe("groupByPrimaryMuscle", () => {
  type Item = { name: string; muscleTargets: MuscleTarget[] | null };
  const items: Item[] = [
    {
      name: "Hammer Curl",
      muscleTargets: [
        { muscle: "brachialis-brachioradialis", tier: "S" },
        { muscle: "biceps", tier: "A" },
      ],
    },
    { name: "Mystery", muscleTargets: null },
    {
      name: "Squat",
      muscleTargets: [
        { muscle: "quads", tier: "S" },
        { muscle: "glutes", tier: "A" },
      ],
    },
    { name: "Sissy Squat", muscleTargets: [{ muscle: "quads", tier: "A" }] },
    { name: "Leg Extension", muscleTargets: [{ muscle: "quads", tier: "S" }] },
  ];

  it("groups by primary muscle in MUSCLES order, Other last", () => {
    const groups = groupByPrimaryMuscle(items);
    expect(groups.map((g) => g.key)).toEqual([
      "quads",
      "brachialis-brachioradialis",
      "other",
    ]);
  });

  it("sorts within a group by tier for that muscle", () => {
    const groups = groupByPrimaryMuscle(items);
    const quads = groups.find((g) => g.key === "quads");
    expect(quads?.items.map((i) => i.name)).toEqual([
      "Squat",
      "Leg Extension",
      "Sissy Squat",
    ]);
  });

  it("unknown muscle keys fall into Other", () => {
    const groups = groupByPrimaryMuscle([
      { name: "X", muscleTargets: [{ muscle: "nope", tier: "S" }] },
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0]?.key).toBe("other");
  });
});
