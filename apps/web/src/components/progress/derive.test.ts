import type { RecordsSessionInput } from "@frog/core";
import { describe, expect, it } from "vitest";
import {
  bodyweightEntries,
  liftSeries,
  liftVerdict,
  noiseBand,
  scopeSessions,
  summarizeSessions,
  verdictWord,
  volumeRows,
} from "./derive";

const DAY = 86_400_000;
const NOW = 100 * DAY;

function set(
  weightKg: number,
  reps: number,
  rir: number | null,
  setType = "normal",
  setNo = 0,
) {
  return {
    setType,
    weightKg,
    reps,
    durationSec: null,
    distanceM: null,
    rir,
    rirMin: null,
    rirMax: null,
    rpe: null,
    setNo,
    side: null,
  } as RecordsSessionInput["exercises"][number]["sets"][number];
}
function sess(
  id: string,
  daysAgo: number,
  ex: string,
  sets: ReturnType<typeof set>[],
): RecordsSessionInput {
  return {
    sessionId: id,
    startedAt: NOW - daysAgo * DAY,
    exercises: [{ exerciseId: ex, exerciseType: "weight_reps", sets }],
  };
}

describe("liftSeries / liftVerdict (C2c-e1rm)", () => {
  it("uses Brzycki with RIR and ignores warm-ups", () => {
    const h = [
      sess("a", 3, "sq", [set(60, 5, null, "warmup"), set(100, 8, 2)]),
    ];
    const s = liftSeries(h, "sq");
    // 100 * 36 / (37 - 10) = 133.33
    expect(s.points[0].e1rm).toBeCloseTo(133.33, 1);
  });
  it("keeps a high-rep lift visible with the not-estimable note", () => {
    const h = [sess("a", 3, "curl", [set(20, 15, 0)])];
    const s = liftSeries(h, "curl");
    expect(s.points).toHaveLength(0);
    expect(s.flaggedSets).toHaveLength(1);
    const v = liftVerdict(s);
    expect(v.kind).toBe("not_estimable");
    expect(verdictWord(v)).toBe("No estimate");
    expect(v.kind === "not_estimable" && v.note).toBe(
      "strength estimate needs 10 or fewer total reps",
    );
  });
  it("bases the noise band on the post-break baseline, not older sessions", () => {
    const before = [1, 2, 3, 4, 5, 6].map((i) =>
      sess(`o${i}`, 80 - i, "sq", [set(200, 5, 2)]),
    );
    const after = [1, 2, 3, 4].map((i) =>
      sess(`n${i}`, 10 - i, "sq", [set(100, 5, 2)]),
    );
    const v = liftVerdict(liftSeries([...before, ...after], "sq"));
    expect(v.kind).toBe("status");
    if (v.kind !== "status") return;
    expect(v.status.n).toBe(4);
    expect(verdictWord(v)).toBe("Rough: 4 of 7");
    const band = noiseBand(v.status.baselineMedian);
    // 100 kg x5 @2 RIR -> Brzycki 100*36/(37-7) = 120
    expect(band?.lo).toBeCloseTo(108, 1);
    expect(band?.hi).toBeCloseTo(132, 1);
  });
  it("reads as rough before 7 comparable sessions", () => {
    const h = [1, 2, 3].map((i) =>
      sess(`s${i}`, 20 - i, "sq", [set(100, 5, 2)]),
    );
    const v = liftVerdict(liftSeries(h, "sq"));
    expect(v.kind === "status" && v.rough).toBe(true);
    expect(verdictWord(v)).toContain("Rough");
  });
});

describe("volumeRows", () => {
  const muscles = new Map([
    [
      "sq",
      {
        targets: [
          { muscle: "quads", tier: "S" },
          { muscle: "glutes", tier: "A" },
        ],
      },
    ],
  ]) as never;
  it("credits 1.0 direct / 0.5 indirect and excludes warm-ups", () => {
    const h = [
      sess("a", 2, "sq", [
        set(40, 6, null, "warmup", 0),
        set(100, 6, 2, "normal", 1),
        set(100, 6, 2, "normal", 2),
      ]),
    ];
    const r = volumeRows(h, muscles, "7d", NOW);
    expect(r.rows.find((m) => m.muscle === "quads")?.total).toBe(2);
    expect(r.rows.find((m) => m.muscle === "glutes")?.total).toBe(1);
    expect(r.hardSets).toBe(2);
  });
  it("4wk window is a weekly average", () => {
    const h = [sess("a", 20, "sq", [set(100, 6, 2)])];
    expect(volumeRows(h, muscles, "4wk", NOW).rows[0].total).toBe(0.25);
  });
});

describe("scope + summaries + body", () => {
  const h = [
    sess("a", 80, "sq", [set(100, 5, 2)]),
    sess("b", 5, "sq", [set(105, 5, 2)]),
  ];
  it("scopes", () => {
    expect(scopeSessions(h, "30d", NOW).map((s) => s.sessionId)).toEqual(["b"]);
    expect(scopeSessions(h, "last", NOW)).toHaveLength(1);
    expect(scopeSessions(h, "all", NOW)).toHaveLength(2);
  });
  it("summarizes hard sets and delta vs previous", () => {
    const m = summarizeSessions(h);
    expect(m.get("b")?.hardSets).toBe(1);
    expect(m.get("b")?.headline?.deltaPct).toBeGreaterThan(0);
    expect(m.get("a")?.headline?.deltaPct).toBeNull();
  });
  it("never headlines an assisted lift with an e1RM", () => {
    const assisted: RecordsSessionInput = {
      sessionId: "c",
      startedAt: NOW - DAY,
      exercises: [
        {
          exerciseId: "pullup",
          exerciseType: "assisted_bodyweight",
          sets: [set(30, 8, 2), set(30, 8, 2)],
        },
      ],
    };
    expect(summarizeSessions([assisted]).get("c")?.headline).toBeNull();
  });
  it("bodyweight entries sorted, nulls dropped", () => {
    const e = bodyweightEntries([
      { measuredOn: "2026-11-02", bodyweightKg: 80 },
      { measuredOn: "2026-11-01", bodyweightKg: null },
      { measuredOn: "2026-10-30", bodyweightKg: 81 },
    ]);
    expect(e.map((x) => x.kg)).toEqual([81, 80]);
  });
});
