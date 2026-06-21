import { describe, it, expect } from "vitest";
import {
  exerciseFinding,
  detectOffDays,
  detectWeightOutliers,
  detectSpikeReverts,
  holistic,
  type ExerciseRecord,
} from "./findings";

function mkRecord(day: number, weightKg: number, reps: number, setType = "normal"): ExerciseRecord {
  const e1rm = weightKg * (1 + reps / 30);
  return { sessionDay: day, e1rm, weightKg, reps, setType };
}

describe("exerciseFinding", () => {
  it("returns INSUFFICIENT for <5 sessions", () => {
    const records = [0, 7, 14, 21].map((d) => mkRecord(d, 100, 5));
    expect(exerciseFinding(records).verdict).toBe("INSUFFICIENT");
  });

  it("returns PROGRESSING for steady increase", () => {
    const records = [0, 7, 14, 21, 28, 35].map((d, i) => mkRecord(d, 100 + i * 5, 5));
    const f = exerciseFinding(records);
    expect(f.verdict).toBe("PROGRESSING");
  });

  it("exposes r2 from linear regression", () => {
    // near-linear increase should yield high r2
    const records = [0, 7, 14, 21, 28, 35].map((d, i) => mkRecord(d, 100 + i * 5, 5));
    expect(exerciseFinding(records).r2).toBeGreaterThan(0.95);
  });

  it("returns REGRESSING for steady decline", () => {
    const records = [0, 7, 14, 21, 28, 35].map((d, i) => mkRecord(d, 200 - i * 8, 5));
    expect(exerciseFinding(records).verdict).toBe("REGRESSING");
  });

  it("returns PLATEAU for flat performance", () => {
    const records = [0, 7, 14, 21, 28, 35].map((d) => mkRecord(d, 100, 5));
    expect(exerciseFinding(records).verdict).toBe("PLATEAU");
  });

  it("ignores warmup sets", () => {
    const working = [0, 7, 14, 21, 28, 35].map((d, i) => mkRecord(d, 100 + i * 5, 5));
    // A massive warmup that would flip the verdict to PLATEAU/REGRESSING if counted
    working.push(mkRecord(35, 300, 1, "warmup"));
    expect(exerciseFinding(working).verdict).toBe("PROGRESSING");
  });

  it("is robust to a single spike outlier", () => {
    const records: ExerciseRecord[] = [
      mkRecord(0, 100, 5),
      mkRecord(7, 102, 5),
      mkRecord(14, 999, 5), // lb-not-kg typo
      mkRecord(21, 104, 5),
      mkRecord(28, 106, 5),
      mkRecord(35, 108, 5),
    ];
    expect(exerciseFinding(records).verdict).toBe("PROGRESSING");
  });

  it("groups multiple sets per session-day correctly (takes max e1rm)", () => {
    // Day 0: two sets — 100kg×5 and 110kg×5; day 0 top should be ~124.7
    const records: ExerciseRecord[] = [
      mkRecord(0, 100, 5),
      mkRecord(0, 110, 5), // top set
      mkRecord(7, 112, 5),
      mkRecord(14, 114, 5),
      mkRecord(21, 116, 5),
      mkRecord(28, 118, 5),
    ];
    const f = exerciseFinding(records);
    expect(f.n).toBe(5); // 5 unique session days
    expect(f.verdict).toBe("PROGRESSING");
  });
});

describe("detectOffDays", () => {
  it("flags sessions where all exercises dropped well below norm", () => {
    const map: Record<string, ExerciseRecord[]> = {
      "Bench Press": [0, 7, 14, 21, 28, 35].map((d, i) =>
        mkRecord(d, i < 5 ? 100 + i * 3 : 75, 5), // day 35 crashes
      ),
      "Squat": [0, 7, 14, 21, 28, 35].map((d, i) =>
        mkRecord(d, i < 5 ? 120 + i * 3 : 90, 5),
      ),
      "Row": [0, 7, 14, 21, 28, 35].map((d, i) =>
        mkRecord(d, i < 5 ? 90 + i * 3 : 65, 5),
      ),
    };
    const flags = detectOffDays(map);
    expect(flags.some((f) => f.sessionDay === 35)).toBe(true);
    const offDay = flags.find((f) => f.sessionDay === 35)!;
    expect(offDay.avgDevPct).toBeLessThan(-7);
    expect(offDay.exercisesChecked).toBeGreaterThanOrEqual(3);
  });

  it("does not flag a normal session", () => {
    const map: Record<string, ExerciseRecord[]> = {
      "Bench Press": [0, 7, 14, 21, 28, 35].map((d, i) => mkRecord(d, 100 + i * 2, 5)),
      "Squat": [0, 7, 14, 21, 28, 35].map((d, i) => mkRecord(d, 120 + i * 2, 5)),
      "Row": [0, 7, 14, 21, 28, 35].map((d, i) => mkRecord(d, 90 + i * 2, 5)),
    };
    expect(detectOffDays(map)).toHaveLength(0);
  });

  it("ignores session with fewer than minExercises covered", () => {
    // Only 1 exercise present — should not fire even if it dips
    const map: Record<string, ExerciseRecord[]> = {
      "Bench Press": [0, 7, 14, 21, 28, 35].map((d, i) =>
        mkRecord(d, i < 5 ? 100 : 50, 5),
      ),
    };
    expect(detectOffDays(map, -7, 3)).toHaveLength(0);
  });
});

describe("detectWeightOutliers", () => {
  it("flags an implausible weight entry (lb-not-kg typo style)", () => {
    const records: ExerciseRecord[] = [
      ...Array.from({ length: 10 }, (_, i) => mkRecord(i * 7, 100, 5)),
      mkRecord(77, 999, 5), // 999 kg is clearly wrong
    ];
    const flags = detectWeightOutliers({ "Bench Press": records });
    expect(flags.some((f) => f.weightKg === 999)).toBe(true);
    expect(flags[0].zScore).toBeGreaterThan(5);
  });

  it("does not flag normal progressive loading", () => {
    const records = Array.from({ length: 10 }, (_, i) => mkRecord(i * 7, 95 + i * 2, 5));
    expect(detectWeightOutliers({ "Bench Press": records })).toHaveLength(0);
  });

  it("requires >=8 sets per exercise before flagging", () => {
    // Only 3 records — should stay silent even on a clear outlier
    const records: ExerciseRecord[] = [
      mkRecord(0, 999, 1),
      mkRecord(7, 100, 5),
      mkRecord(14, 100, 5),
    ];
    expect(detectWeightOutliers({ "Curl": records })).toHaveLength(0);
  });
});

describe("detectSpikeReverts", () => {
  it("flags single-session e1rm spike that reverts", () => {
    const records: ExerciseRecord[] = [
      mkRecord(0, 100, 5),
      mkRecord(7, 102, 5),
      mkRecord(14, 450, 5), // spike — then reverts
      mkRecord(21, 104, 5),
      mkRecord(28, 106, 5),
    ];
    const flags = detectSpikeReverts({ "Bench Press": records });
    expect(flags).toHaveLength(1);
    expect(flags[0].sessionDay).toBe(14);
    expect(flags[0].spikeE1rm).toBeGreaterThan(flags[0].prevE1rm * 1.4);
    expect(flags[0].spikeE1rm).toBeGreaterThan(flags[0].nextE1rm * 1.4);
  });

  it("does not flag genuine steady progress", () => {
    const records = [0, 7, 14, 21, 28].map((d, i) => mkRecord(d, 100 + i * 3, 5));
    expect(detectSpikeReverts({ "Row": records })).toHaveLength(0);
  });

  it("does not flag a spike at the end (no following data to confirm revert)", () => {
    const records: ExerciseRecord[] = [
      mkRecord(0, 100, 5),
      mkRecord(7, 102, 5),
      mkRecord(14, 104, 5),
      mkRecord(21, 450, 5), // last session — no revert window
    ];
    expect(detectSpikeReverts({ "Squat": records })).toHaveLength(0);
  });
});

describe("holistic", () => {
  it("returns a combined report with all four sections", () => {
    const map: Record<string, ExerciseRecord[]> = {
      "Bench Press": [0, 7, 14, 21, 28, 35].map((d, i) => mkRecord(d, 100 + i * 3, 5)),
      "Squat": [0, 7, 14, 21, 28, 35].map((d, i) => mkRecord(d, 140 + i * 4, 5)),
    };
    const report = holistic(map);
    expect(report.findings["Bench Press"].verdict).toBe("PROGRESSING");
    expect(report.findings["Squat"].verdict).toBe("PROGRESSING");
    expect(Array.isArray(report.offDays)).toBe(true);
    expect(Array.isArray(report.weightOutliers)).toBe(true);
    expect(Array.isArray(report.spikeReverts)).toBe(true);
  });
});
