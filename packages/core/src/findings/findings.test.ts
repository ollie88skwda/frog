import { describe, expect, it } from "vitest";
import { conditionFindings } from "./conditions";
import { progressionFindings } from "./teaser";
import type { FindingsSessionInput } from "./types";

const DAY_MS = 86_400_000;
const SLEEP = { id: "m-sleep", name: "Sleep" };

function session(
  i: number,
  weightKg: number,
  conditions: Record<string, unknown> | null = null,
): FindingsSessionInput {
  return {
    sessionId: `s${i}`,
    startedAt: i * 3 * DAY_MS, // one session every 3 days
    conditionValues: conditions,
    sets: [
      { exerciseId: "ex1", exerciseName: "Squat", weightKg, reps: 5 },
      {
        exerciseId: "ex1",
        exerciseName: "Squat",
        weightKg: weightKg - 10,
        reps: 8,
      },
    ],
  };
}

describe("progressionFindings", () => {
  it("calls PROGRESSING on a rising trend", () => {
    const sessions = Array.from({ length: 8 }, (_, i) =>
      session(i, 100 + i * 5),
    );
    const { trends, countdowns } = progressionFindings(sessions);
    expect(countdowns).toEqual([]);
    expect(trends).toHaveLength(1);
    expect(trends[0].verdict).toBe("PROGRESSING");
    expect(trends[0].exerciseName).toBe("Squat");
    expect(trends[0].pctChange).toBeGreaterThan(5);
  });

  it("emits an honest countdown below the session minimum", () => {
    const sessions = Array.from({ length: 3 }, (_, i) => session(i, 100));
    const { trends, countdowns } = progressionFindings(sessions);
    expect(trends).toEqual([]);
    expect(countdowns).toEqual([
      {
        kind: "countdown",
        exerciseId: "ex1",
        exerciseName: "Squat",
        sessionsLogged: 3,
        sessionsNeeded: 2,
      },
    ]);
  });

  it("calls PLATEAU on a flat trend", () => {
    const sessions = Array.from({ length: 8 }, (_, i) => session(i, 100));
    const { trends } = progressionFindings(sessions);
    expect(trends[0].verdict).toBe("PLATEAU");
  });
});

describe("conditionFindings", () => {
  it("finds a planted sleep→performance correlation with medium confidence", () => {
    // 20 sessions: 10 on 8h sleep lift heavier, 10 on 6h lift lighter.
    const sessions = Array.from({ length: 20 }, (_, i) => {
      const wellSlept = i % 2 === 0;
      return session(i, wellSlept ? 110 : 95, {
        [SLEEP.id]: wellSlept ? 8 : 6,
      });
    });
    const findings = conditionFindings(sessions, [SLEEP]);
    const tonnage = findings.find((f) => f.outcome.type === "tonnage");
    expect(tonnage).toBeDefined();
    expect(tonnage?.pctDiff).toBeGreaterThan(3);
    expect(tonnage?.confidence).toBe("medium");
    expect(tonnage?.n).toEqual({ high: 10, low: 10 });
    const e1rm = findings.find((f) => f.outcome.type === "e1rm");
    expect(e1rm).toBeDefined();
  });

  it("stays silent when the effect is below the 3% floor", () => {
    const sessions = Array.from({ length: 20 }, (_, i) => {
      const wellSlept = i % 2 === 0;
      return session(i, wellSlept ? 100.5 : 100, {
        [SLEEP.id]: wellSlept ? 8 : 6,
      });
    });
    expect(conditionFindings(sessions, [SLEEP])).toEqual([]);
  });

  it("stays silent below the per-bucket minimum n", () => {
    const sessions = Array.from({ length: 8 }, (_, i) => {
      const wellSlept = i % 2 === 0;
      return session(i, wellSlept ? 120 : 90, {
        [SLEEP.id]: wellSlept ? 8 : 6,
      });
    });
    expect(conditionFindings(sessions, [SLEEP])).toEqual([]);
  });

  it("ignores sessions without a numeric value for the condition", () => {
    const sessions = Array.from({ length: 20 }, (_, i) => {
      const wellSlept = i % 2 === 0;
      return session(
        i,
        wellSlept ? 110 : 95,
        i < 4 ? null : { [SLEEP.id]: wellSlept ? 8 : 6 },
      );
    });
    const findings = conditionFindings(sessions, [SLEEP]);
    const tonnage = findings.find((f) => f.outcome.type === "tonnage");
    expect(tonnage?.n).toEqual({ high: 8, low: 8 });
  });
});
