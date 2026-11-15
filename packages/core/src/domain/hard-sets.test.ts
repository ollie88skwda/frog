import { describe, expect, it } from "vitest";
import type { MuscleTarget } from "./anatomy";
import {
  creditsFor,
  fractionalHardSets,
  hardSetCount,
  isHardSet,
  sessionDirectCheck,
  weeklyBand,
} from "./hard-sets";

const set = (setNo: number, extra: object = {}) => ({ setNo, ...extra });
const BENCH: MuscleTarget[] = [
  { muscle: "pecs", tier: "S" },
  { muscle: "triceps", tier: "A" },
  { muscle: "front-delts", tier: "A" },
];

describe("isHardSet (R6)", () => {
  it("RIR 4 is hard, RIR 5 is not", () => {
    expect(isHardSet({ rir: 4 }).hard).toBe(true);
    expect(isHardSet({ rir: 5 }).hard).toBe(false);
  });
  it("blank RIR counts as hard but is flagged", () => {
    expect(isHardSet({})).toEqual({ hard: true, rirKnown: false });
  });
  it("warm-ups (R17b) and uncompleted sets never count", () => {
    expect(isHardSet({ setType: "warmup", rir: 0 }).hard).toBe(false);
    expect(isHardSet({ completed: false, rir: 0 }).hard).toBe(false);
  });
  it("a range uses its midpoint; custom cap honoured", () => {
    expect(isHardSet({ rirMin: 4, rirMax: 5 }).hard).toBe(false);
    expect(isHardSet({ rirMin: 3, rirMax: 4 }).hard).toBe(true);
    expect(isHardSet({ rir: 5 }, { rirMax: 6 }).hard).toBe(true);
  });
});

describe("hardSetCount", () => {
  it("a unilateral pair is ONE set; the harder side decides", () => {
    const c = hardSetCount([
      set(1, { side: "left", rir: 1 }),
      set(1, { side: "right", rir: 5 }),
    ]);
    expect(c.hard).toBe(1);
    expect(c.excluded).toBe(0);
  });
  it("counts exclusions and unknown RIR", () => {
    const c = hardSetCount([
      set(1, { setType: "warmup" }),
      set(2, { rir: 2 }),
      set(3),
      set(4, { rir: 6 }),
    ]);
    expect(c).toEqual({ hard: 2, rirUnknown: 1, excluded: 2 });
  });
});

describe("creditsFor / fractionalHardSets (R7)", () => {
  it("bench: primary 1.0, each secondary 0.5", () => {
    const r = fractionalHardSets([
      {
        targets: BENCH,
        sets: [set(1, { rir: 2 }), set(2, { rir: 2 }), set(3, { rir: 1 })],
      },
    ]);
    expect(r.byMuscle.pecs.total).toBe(3);
    expect(r.byMuscle.triceps.total).toBe(1.5);
    expect(r.byMuscle["front-delts"].indirect).toBe(1.5);
    expect(r.byMuscle.pecs.direct).toBe(3);
  });
  it("two explicit primaries (RDL) credit 1.0 each", () => {
    const rdl: MuscleTarget[] = [
      { muscle: "hamstrings", tier: "S", role: "primary" },
      { muscle: "glutes", tier: "S", role: "primary" },
    ];
    const r = fractionalHardSets([
      { targets: rdl, sets: [1, 2, 3, 4].map((n) => set(n, { rir: 2 })) },
    ]);
    expect(r.byMuscle.hamstrings.total).toBe(4);
    expect(r.byMuscle.glutes.total).toBe(4);
    expect(creditsFor(rdl).map((c) => c.kind)).toEqual(["direct", "direct"]);
  });
  it("R6 example: 12 direct + 4 indirect = 14.0", () => {
    const direct: MuscleTarget[] = [{ muscle: "quads", tier: "S" }];
    const comp: MuscleTarget[] = [
      { muscle: "glutes", tier: "S" },
      { muscle: "quads", tier: "A", role: "secondary" },
    ];
    const r = fractionalHardSets([
      {
        targets: direct,
        sets: Array.from({ length: 12 }, (_, i) => set(i + 1, { rir: 2 })),
      },
      {
        targets: comp,
        sets: Array.from({ length: 8 }, (_, i) => set(i + 1, { rir: 2 })),
      },
    ]);
    expect(r.byMuscle.quads.total).toBe(16); // 12 + 8 * 0.5
    expect(r.byMuscle.quads.indirect).toBe(4);
  });
  it("warm-ups excluded; RIR>4 excluded; unmapped counted; noRir tracked", () => {
    const r = fractionalHardSets([
      {
        targets: BENCH,
        sets: [set(1, { setType: "warmup" }), set(2, { rir: 6 }), set(3)],
      },
      { targets: null, sets: [set(1, { rir: 1 })] },
    ]);
    expect(r.byMuscle.pecs.total).toBe(1);
    expect(r.byMuscle.pecs.noRirCount).toBe(1);
    expect(r.byMuscle.triceps.noRirCount).toBe(0.5);
    expect(r.unmapped).toBe(1);
    expect(r.hardSets).toBe(2);
  });
});

describe("bands", () => {
  it("weekly: 9.5 below, 10 in, 19.5 in, 20 over", () => {
    expect(weeklyBand(9.5)).toBe("below");
    expect(weeklyBand(10)).toBe("in");
    expect(weeklyBand(19.5)).toBe("in");
    expect(weeklyBand(20)).toBe("over");
  });
  it("session direct: <2 low, 2-5 ok, >5 high (R7b)", () => {
    expect(sessionDirectCheck(1)).toBe("low");
    expect(sessionDirectCheck(5)).toBe("ok");
    expect(sessionDirectCheck(6)).toBe("high");
  });
});
