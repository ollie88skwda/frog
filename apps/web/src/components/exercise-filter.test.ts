import { describe, expect, it } from "vitest";
import { filterExercises, primaryTier } from "./exercise-filter";

type Row = {
  name: string;
  muscleTargets:
    | { muscle: string; tier: "S" | "A" | "B" | "C" | null }[]
    | null;
  aliases?: string[] | null;
  equipment?: string | null;
};

const PEC_FLY: Row = {
  name: "Cable Fly",
  muscleTargets: [{ muscle: "pecs", tier: "A" }],
  equipment: "cable",
};
const INCLINE_PRESS: Row = {
  name: "Incline Press",
  muscleTargets: [{ muscle: "upper-pecs", tier: "S" }],
};
const SIDE_RAISE: Row = {
  name: "Lateral Raise",
  muscleTargets: [{ muscle: "side-delts", tier: "S" }],
};
const UNRATED_ROW: Row = {
  name: "Homemade Gadget",
  muscleTargets: [{ muscle: "quads", tier: null }],
};
const OTHER: Row = { name: "Oddity", muscleTargets: null };

const ROWS = [PEC_FLY, INCLINE_PRESS, SIDE_RAISE, UNRATED_ROW, OTHER];

describe("filterExercises — muscle search aliases (Note 18)", () => {
  it('"chest" finds pec + upper-pec exercises via MUSCLE_ALIASES', () => {
    expect(filterExercises(ROWS, "chest", "").map((r) => r.name)).toEqual([
      "Cable Fly",
      "Incline Press",
    ]);
  });

  it('"shoulders" finds delt work', () => {
    expect(filterExercises(ROWS, "shoulders", "").map((r) => r.name)).toEqual([
      "Lateral Raise",
    ]);
  });

  it('the label itself still matches ("pecs", "delts")', () => {
    // "pecs" also matches "Upper pecs" (label substring) — upper pec tissue
    // is pec work, so that's a hit, not noise.
    expect(filterExercises(ROWS, "pecs", "").map((r) => r.name)).toEqual([
      "Cable Fly",
      "Incline Press",
    ]);
    expect(filterExercises(ROWS, "delts", "").map((r) => r.name)).toEqual([
      "Lateral Raise",
    ]);
  });

  it("a region search reaches muscles with no alias of their own", () => {
    // rotator-cuff has no "shoulders" alias — the region rollup supplies it.
    const rows: Row[] = [
      {
        name: "Cuban Rotation",
        muscleTargets: [{ muscle: "rotator-cuff", tier: null }],
      },
      UNRATED_ROW,
    ];
    expect(filterExercises(rows, "shoulders", "").map((r) => r.name)).toEqual([
      "Cuban Rotation",
    ]);
  });
});

describe("filterExercises — quality tier (Note 17)", () => {
  it("primaryTier follows the index-0 grouping rule", () => {
    expect(primaryTier(PEC_FLY)).toBe("A");
    expect(primaryTier(UNRATED_ROW)).toBeNull();
    expect(primaryTier(OTHER)).toBeNull();
  });

  it("filters to one tier", () => {
    expect(filterExercises(ROWS, "", "", "S").map((r) => r.name)).toEqual([
      "Incline Press",
      "Lateral Raise",
    ]);
    expect(filterExercises(ROWS, "", "", "A").map((r) => r.name)).toEqual([
      "Cable Fly",
    ]);
  });

  it('"unrated" keeps only exercises with no primary-muscle rating', () => {
    expect(filterExercises(ROWS, "", "", "unrated").map((r) => r.name)).toEqual(
      ["Homemade Gadget", "Oddity"],
    );
  });

  it("combines with muscle filter", () => {
    expect(filterExercises(ROWS, "", "pecs", "A").map((r) => r.name)).toEqual([
      "Cable Fly",
    ]);
    expect(filterExercises(ROWS, "", "pecs", "S")).toEqual([]);
  });
});

describe("filterExercises — equipment (Note 19)", () => {
  it("filters to one equipment kind by key", () => {
    expect(
      filterExercises(ROWS, "", "", "", "cable").map((r) => r.name),
    ).toEqual(["Cable Fly"]);
  });

  it("empty equipment means no equipment filter", () => {
    expect(filterExercises(ROWS, "", "", "", "").length).toBe(ROWS.length);
  });

  it("combines with the muscle filter", () => {
    expect(
      filterExercises(ROWS, "", "pecs", "", "cable").map((r) => r.name),
    ).toEqual(["Cable Fly"]);
    expect(filterExercises(ROWS, "", "upper-pecs", "", "cable")).toEqual([]);
  });

  it("combines with the tier filter", () => {
    expect(
      filterExercises(ROWS, "", "", "S", "cable").map((r) => r.name),
    ).toEqual([]);
  });
});
