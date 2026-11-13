// Run: bun test scripts/classify-exercises  (scripts/ is outside the workspace
// test filter, like scripts/machine-catalog).
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import {
  JOINT_ACTIONS,
  MUSCLES,
  roleAt,
} from "../../packages/core/src/domain/anatomy";
import { MOVEMENT_PATTERNS } from "../../packages/core/src/domain/exercise-types";
import { loadBaseExercises } from "./base-seed";
import {
  applyClassification,
  classifyAll,
  defaultCredit,
  fromModelItem,
  parseTargetSpec,
} from "./classify-lib";
import { CURATED } from "./curated";
import { CLASSIFICATION_PATH, SEED_PATH } from "./paths";
import type { ClassificationFile } from "./types";

// Pre-merge rows (frozen-SQL replay), the classifier's real input.
const seed = await loadBaseExercises();
const byName = new Map(seed.map((e) => [e.name, e]));

describe("curated table", () => {
  test("every curated name resolves to a seed row", () => {
    const missing = Object.keys(CURATED).filter((n) => !byName.has(n));
    expect(missing).toEqual([]);
  });
  test("every curated spec parses and uses known vocab", () => {
    for (const [n, c] of Object.entries(CURATED)) {
      const t = parseTargetSpec(c.t, byName.get(n)!.muscleTargets ?? []);
      expect(t.length).toBeGreaterThan(0);
      expect(MOVEMENT_PATTERNS).toContain(c.pat);
      for (const j of c.ja)
        expect(JOINT_ACTIONS.map((a) => a.key)).toContain(j);
    }
  });
});

describe("merged seed", () => {
  const merged = seed.map((e) => ({ ...e }));
  const file: ClassificationFile = JSON.parse(
    readFileSync(CLASSIFICATION_PATH, "utf8"),
  );
  for (const r of merged) applyClassification(r, file.byId[r.id]);

  test(">=95% of rows carry mechanic + jointActions + roles", () => {
    const ok = merged.filter(
      (r) =>
        r.mechanic &&
        r.jointActions?.length &&
        r.muscleTargets?.length &&
        r.muscleTargets.every((t: { role?: string }) => t.role),
    );
    expect(ok.length / merged.length).toBeGreaterThanOrEqual(0.95);
  });
  test("every classified muscle target has a valid muscle, a role and a 0..1 weight; exactly one-or-more primaries", () => {
    const keys = new Set(MUSCLES.map((m) => m.key));
    for (const r of merged) {
      if (!r.muscleTargets?.length) continue;
      expect(
        r.muscleTargets.some((t: { role?: string }) => t.role === "primary"),
      ).toBe(true);
      for (const t of r.muscleTargets) {
        expect(keys.has(t.muscle)).toBe(true);
        expect(t.weight).toBeGreaterThanOrEqual(0);
        expect(t.weight).toBeLessThanOrEqual(1);
      }
    }
  });
  test("first target is a primary (library grouping keys off index 0)", () => {
    for (const r of merged) {
      if (!r.muscleTargets?.length) continue;
      expect(roleAt(r.muscleTargets, 0)).toBe("primary");
    }
  });
  test("merge never drops a seed muscle", () => {
    for (const r of merged) {
      const got = new Set(r.muscleTargets?.map((t) => t.muscle));
      for (const t of byName.get(r.name)!.muscleTargets ?? [])
        expect(got.has(t.muscle)).toBe(true);
    }
  });
  test("committed global-seed.json matches merging classification.json over the replayed rows", () => {
    const committed = new Map(
      (
        JSON.parse(readFileSync(SEED_PATH, "utf8")) as {
          exercises: Record<string, unknown>[];
        }
      ).exercises.map((e) => [e.id, e]),
    );
    expect(committed.size).toBe(merged.length);
    for (const r of merged) {
      const c = committed.get(r.id)!;
      for (const k of [
        "mechanic",
        "movementPattern",
        "jointActions",
        "muscleTargets",
      ])
        expect([r.id, k, c[k]]).toEqual([r.id, k, r[k]]);
    }
  });

  // R7 (indirect 0.5) + programs-set-sums.md: Program A weekly sets, 3.5 sessions/week.
  test("Program A weekly meter totals match the program doc", () => {
    const slots: [string, number][] = [
      ["Leg Press", 3],
      ["Leg Extension", 2],
      ["Romanian Deadlift", 3],
      ["Dumbbell Bench Press", 3],
      ["Seated Cable Row", 3],
      ["Lateral Raise", 3],
      ["Incline Dumbbell Curl", 2],
      ["Triceps Overhead Extension with Rope", 2],
      ["Standing Calf Raises", 3],
    ];
    const tot: Record<string, number> = {};
    for (const [n, sets] of slots) {
      const r = merged.find((m) => m.name === n)!;
      for (const t of r.muscleTargets)
        tot[t.muscle] = (tot[t.muscle] ?? 0) + sets * t.weight * 3.5;
    }
    expect(tot.quads).toBe(17.5);
    expect(tot.hamstrings).toBe(10.5);
    expect(tot.pecs).toBe(10.5);
    expect(tot.lats).toBe(10.5);
    expect(tot.glutes).toBe(10.5);
    expect(tot.triceps).toBe(12.25);
    expect(tot.biceps).toBe(12.25);
    expect(tot["side-delts"]).toBe(10.5);
    expect(tot.calves).toBe(10.5);
    // no adductor / front-delt / rear-delt credit (program doc)
    expect(tot.adductors ?? 0).toBe(0);
    expect(tot["front-delts"] ?? 0).toBe(0);
    expect(tot["rear-delts"] ?? 0).toBe(0);
  });
  test("RDL has two-primary-capable roles via roleAt; first-listed stays primary", () => {
    const rdl = merged.find((m) => m.name === "Romanian Deadlift")!;
    expect(roleAt(rdl.muscleTargets, 0)).toBe("primary");
    expect(rdl.muscleTargets[0].lengthened).toBe(true);
  });
});

describe("rules + model fallbacks", () => {
  test("defaultCredit: S/A secondaries 0.5, others 0", () => {
    expect(defaultCredit("primary", null)).toBe(1);
    expect(defaultCredit("secondary", "A")).toBe(0.5);
    expect(defaultCredit("secondary", "B")).toBe(0);
    expect(defaultCredit("secondary", null)).toBe(0);
  });
  test("classifyAll without a model is deterministic", async () => {
    const a = await classifyAll(seed.slice(0, 60));
    const b = await classifyAll(seed.slice(0, 60));
    expect(a).toEqual(b);
    expect(a.meta.mode).toBe("mock");
  });
  test("off-vocabulary model answers fall back to rules", () => {
    const ex = byName.get("Zottman Curl")!;
    const c = fromModelItem(ex, {
      mechanic: "bogus",
      movementPattern: "nope",
      jointActions: ["nonsense"],
      primaryMuscle: "zzz",
    });
    expect(c.mechanic).toBe("isolation");
    expect(c.jointActions).toEqual(["elbow-flexion"]);
    expect(c.muscleTargets[0].role).toBe("primary");
  });
  test("a model primary that is not the first seed muscle moves to index 0", () => {
    const ex = {
      id: "x",
      name: "X",
      equipment: null,
      exerciseType: null,
      laterality: null,
      muscleTargets: [
        { muscle: "front-delts", tier: null },
        { muscle: "side-delts", tier: null },
      ],
    };
    const c = fromModelItem(ex, { primaryMuscle: "side-delts" });
    expect(c.muscleTargets.map((t) => [t.muscle, t.role])).toEqual([
      ["side-delts", "primary"],
      ["front-delts", "secondary"],
    ]);
  });
  test("a curated primary missing from the seed goes first", () => {
    const t = parseTargetSpec("side-delts 1 p", [
      { muscle: "front-delts", tier: null },
    ]);
    expect(t.map((x) => [x.muscle, x.role, x.weight])).toEqual([
      ["side-delts", "primary", 1],
      ["front-delts", "secondary", 0],
    ]);
  });
});
