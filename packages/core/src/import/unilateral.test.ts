import { describe, expect, it } from "vitest";
import { countSets, groupSetsBySetNo } from "../domain/volume";
import { draftToImportedSessions, emptyDraft, importDraftSet } from "./draft";
import { physicalSetCount } from "./set-nos";
import { isUnilateralName, pairUnilateralSets } from "./unilateral";

describe("isUnilateralName", () => {
  it.each([
    "Unilateral Cuffed Cable Extension",
    "Uni Dumbbell Curl",
    "uni dumbbell curl",
    "UNILATERAL row",
    "Cable Row (Uni)",
    "Single-arm uni-press",
  ])("%s", (n) => expect(isUnilateralName(n)).toBe(true));
  it.each([
    "Universal Press",
    "Unity Curl",
    "Bench Press",
    "Communion Row",
    "Reunion",
  ])("not %s", (n) => expect(isUnilateralName(n)).toBe(false));
});

describe("pairUnilateralSets", () => {
  it("doubles side-less sets into left/right and keeps pairs that already have sides", () => {
    const out = pairUnilateralSets([
      { side: null, reps: 8 },
      { side: null, reps: 6 },
    ]);
    expect(out.map((s) => s.side)).toEqual(["left", "right", "left", "right"]);
    const given = [{ side: "left" }, { side: "right" }];
    expect(pairUnilateralSets(given)).toBe(given);
  });
});

describe("draftToImportedSessions", () => {
  it("emits one left/right pair per set for unilateral-named exercises only", () => {
    const d = emptyDraft("text", "kg");
    const set = () => importDraftSet({ weight: 20, reps: 10 });
    d.sessions.push({
      id: "s",
      title: "t",
      startedAt: 1000,
      hasTime: true,
      endedAt: null,
      confidence: 1,
      flags: [],
      exercises: [
        {
          id: "a",
          rawName: "Uni Dumbbell Curl",
          confidence: 1,
          sets: [set(), set(), set()],
        },
        {
          id: "b",
          rawName: "Bench Press",
          confidence: 1,
          sets: [set(), set()],
        },
      ],
    });
    const [s] = draftToImportedSessions(d, (n) => n);
    const [uni, bi] = s.exercises;
    expect(uni.sets).toHaveLength(6);
    expect(physicalSetCount(uni.sets)).toBe(3);
    expect(uni.sets.map((x) => x.side)).toEqual([
      "left",
      "right",
      "left",
      "right",
      "left",
      "right",
    ]);
    expect(bi.sets.every((x) => x.side == null)).toBe(true);
    const rows = uni.sets.map((x, i) => ({ ...x, setNo: Math.floor(i / 2) }));
    expect(countSets(rows)).toBe(3);
    expect(groupSetsBySetNo(rows).every((g) => g.length === 2)).toBe(true);
  });
});
