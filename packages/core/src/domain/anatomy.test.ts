import { describe, expect, it } from "vitest";
import {
  ACTION_RATINGS,
  groupByPrimaryMuscle,
  JOINT_ACTIONS,
  MUSCLE_ALIASES,
  MUSCLES,
  type MuscleTarget,
  muscleLabelMatches,
  primaryMuscles,
  ratingsForExercise,
  ratingsForMuscle,
  roleAt,
  secondaryMuscles,
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

describe("ratingsForExercise", () => {
  it("picks the best-matching tier per joint action from the exercise's own muscles", () => {
    // Front Squat: quads (knee-extension = S), glutes (hip-extension = S).
    const ratings = ratingsForExercise({
      jointActions: ["knee-extension", "hip-extension"],
      muscleTargets: [
        { muscle: "quads", tier: "S" },
        { muscle: "glutes", tier: "B" },
      ],
    });
    expect(ratings).toEqual([
      { jointAction: "knee-extension", tier: "S", muscle: "quads" },
      { jointAction: "hip-extension", tier: "S", muscle: "glutes" },
    ]);
  });

  it("returns tier: null for a joint action with no matching rating", () => {
    const ratings = ratingsForExercise({
      jointActions: ["wrist-flexion-extension"],
      muscleTargets: [{ muscle: "quads", tier: "S" }],
    });
    expect(ratings).toEqual([
      { jointAction: "wrist-flexion-extension", tier: null, muscle: null },
    ]);
  });

  it("handles null jointActions/muscleTargets", () => {
    expect(
      ratingsForExercise({ jointActions: null, muscleTargets: null }),
    ).toEqual([]);
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

describe("roleAt", () => {
  it("back-compat: absent role treats index 0 as primary, the rest secondary", () => {
    const targets: MuscleTarget[] = [
      { muscle: "quads", tier: "S" },
      { muscle: "glutes", tier: "A" },
      { muscle: "hamstrings", tier: "B" },
    ];
    expect(roleAt(targets, 0)).toBe("primary");
    expect(roleAt(targets, 1)).toBe("secondary");
    expect(roleAt(targets, 2)).toBe("secondary");
  });

  it("explicit role wins over position, including a second primary", () => {
    const targets: MuscleTarget[] = [
      { muscle: "quads", tier: "S", role: "primary" },
      { muscle: "glutes", tier: "S", role: "primary" },
      { muscle: "hamstrings", tier: "B", role: "secondary" },
    ];
    expect(roleAt(targets, 0)).toBe("primary");
    expect(roleAt(targets, 1)).toBe("primary");
    expect(roleAt(targets, 2)).toBe("secondary");
  });
});

describe("primaryMuscles / secondaryMuscles", () => {
  it("reads back-compat position when role is absent", () => {
    const targets: MuscleTarget[] = [
      { muscle: "quads", tier: "S" },
      { muscle: "glutes", tier: "A" },
    ];
    expect(primaryMuscles(targets)).toEqual(["quads"]);
    expect(secondaryMuscles(targets)).toEqual(["glutes"]);
  });

  it("supports two explicit primaries", () => {
    const targets: MuscleTarget[] = [
      { muscle: "quads", tier: "S", role: "primary" },
      { muscle: "glutes", tier: "S", role: "primary" },
      { muscle: "erectors", tier: "B", role: "secondary" },
    ];
    expect(primaryMuscles(targets)).toEqual(["quads", "glutes"]);
    expect(secondaryMuscles(targets)).toEqual(["erectors"]);
  });

  it("handles null", () => {
    expect(primaryMuscles(null)).toEqual([]);
    expect(secondaryMuscles(null)).toEqual([]);
  });
});

describe("muscleLabelMatches (search aliases)", () => {
  it("every alias key is a real muscle key", () => {
    const keys = new Set(MUSCLES.map((m) => m.key));
    for (const key of Object.keys(MUSCLE_ALIASES)) {
      expect(keys.has(key), key).toBe(true);
    }
  });

  it("matches the label itself", () => {
    expect(muscleLabelMatches("pecs", "pecs")).toBe(true);
    expect(muscleLabelMatches("front-delts", "front delts")).toBe(true);
  });

  it("chest finds the pecs, upper chest finds upper pecs", () => {
    expect(muscleLabelMatches("pecs", "chest")).toBe(true);
    expect(muscleLabelMatches("upper-pecs", "chest")).toBe(true);
    expect(muscleLabelMatches("upper-pecs", "upper chest")).toBe(true);
    expect(muscleLabelMatches("quads", "chest")).toBe(false);
  });

  it("shoulders finds every delt head", () => {
    for (const key of ["front-delts", "side-delts", "rear-delts"]) {
      expect(muscleLabelMatches(key, "shoulders"), key).toBe(true);
    }
    expect(muscleLabelMatches("side-delts", "lateral delts")).toBe(true);
    expect(muscleLabelMatches("rear-delts", "posterior deltoids")).toBe(true);
    expect(muscleLabelMatches("biceps", "shoulders")).toBe(false);
  });
});
