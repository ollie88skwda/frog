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
  it("calls PROGRESSING on a rising trend with medium confidence at 8 sessions", () => {
    const sessions = Array.from({ length: 8 }, (_, i) =>
      session(i, 100 + i * 5),
    );
    const { trends, countdowns } = progressionFindings(sessions);
    expect(countdowns).toEqual([]);
    expect(trends).toHaveLength(1);
    expect(trends[0].verdict).toBe("PROGRESSING");
    expect(trends[0].exerciseName).toBe("Squat");
    expect(trends[0].pctChange).toBeGreaterThan(5);
    expect(trends[0].confidence).toBe("medium");
  });

  it("a lone unconfirmed spike on the 7th session reads as a plateau, not progress (C2c)", () => {
    const sessions = [100, 95, 97, 99, 100, 99, 112].map((w, i) =>
      session(i, w),
    );
    const { trends } = progressionFindings(sessions);
    expect(trends[0].status.state).toBe("holding");
    expect(trends[0].verdict).toBe("PLATEAU");
    expect(trends[0].roughVerdict).toBe(false);
  });

  it("emits an honest countdown below the session minimum", () => {
    const sessions = Array.from({ length: 1 }, (_, i) => session(i, 100));
    const { trends, countdowns } = progressionFindings(sessions);
    expect(trends).toEqual([]);
    expect(countdowns).toEqual([
      {
        kind: "countdown",
        exerciseId: "ex1",
        exerciseName: "Squat",
        sessionsLogged: 1,
        sessionsNeeded: 1,
      },
    ]);
  });

  it("starts surfacing a trend at 2 sessions, labeled a rough estimate", () => {
    const sessions = Array.from({ length: 2 }, (_, i) =>
      session(i, 100 + i * 10),
    );
    const { trends, countdowns } = progressionFindings(sessions);
    expect(countdowns).toEqual([]);
    expect(trends).toHaveLength(1);
    expect(trends[0].verdict).toBe("PROGRESSING");
    expect(trends[0].n).toBe(2);
    expect(trends[0].confidence).toBe("low");
  });

  it("keeps 3-5 sessions as low-confidence rough estimates", () => {
    for (const count of [3, 4, 5]) {
      const sessions = Array.from({ length: count }, (_, i) =>
        session(i, 100 + i * 10),
      );
      const { trends } = progressionFindings(sessions);
      expect(trends).toHaveLength(1);
      expect(trends[0].n).toBe(count);
      expect(trends[0].confidence).toBe("low");
    }
  });

  it("calls PLATEAU on a flat trend", () => {
    const sessions = Array.from({ length: 8 }, (_, i) => session(i, 100));
    const { trends } = progressionFindings(sessions);
    expect(trends[0].verdict).toBe("PLATEAU");
  });
});

describe("conditionFindings", () => {
  // Brzycki e1RM at 5 reps (blank RIR = 0): 100 kg -> 112.5. Planted 15% gap.
  it("finds a planted sleep→performance correlation (working-set e1RM)", () => {
    const sessions = Array.from({ length: 20 }, (_, i) => {
      const wellSlept = i % 2 === 0;
      return session(i, wellSlept ? 110 : 95, {
        [SLEEP.id]: wellSlept ? 8 : 6,
      });
    });
    const findings = conditionFindings(sessions, [SLEEP]);
    const e1rm = findings.find((f) => f.outcome.type === "e1rm");
    expect(e1rm).toBeDefined();
    expect(e1rm?.pctDiff).toBeGreaterThan(5);
    expect(e1rm?.confidence).toBe("medium");
    expect(e1rm?.n).toEqual({ high: 10, low: 10 });
    expect(Math.abs(e1rm?.effectSize ?? 0)).toBeGreaterThanOrEqual(0.8);
    expect(e1rm?.caveat).toBe("correlation_not_causation");
    expect(e1rm?.q).toBeLessThanOrEqual(0.1);
    // Tonnage is no longer an outcome.
    expect(findings.some((f) => (f.outcome.type as string) === "tonnage")).toBe(
      false,
    );
  });

  it("stays silent when the effect is below the 5% floor", () => {
    const sessions = Array.from({ length: 20 }, (_, i) => {
      const wellSlept = i % 2 === 0;
      return session(i, wellSlept ? 103 : 100, {
        [SLEEP.id]: wellSlept ? 8 : 6,
      });
    });
    expect(conditionFindings(sessions, [SLEEP])).toEqual([]);
  });

  it("stays silent below the per-bucket minimum n (6)", () => {
    const sessions = Array.from({ length: 10 }, (_, i) => {
      const wellSlept = i % 2 === 0;
      return session(i, wellSlept ? 120 : 90, {
        [SLEEP.id]: wellSlept ? 8 : 6,
      });
    });
    expect(conditionFindings(sessions, [SLEEP])).toEqual([]);
  });

  it("ignores sessions without a numeric value for the condition", () => {
    const sessions = Array.from({ length: 24 }, (_, i) => {
      const wellSlept = i % 2 === 0;
      return session(
        i,
        wellSlept ? 110 : 95,
        i < 4 ? null : { [SLEEP.id]: wellSlept ? 8 : 6 },
      );
    });
    const findings = conditionFindings(sessions, [SLEEP]);
    expect(findings[0]?.n).toEqual({ high: 10, low: 10 });
  });

  it("null-hypothesis guard: seeded 3% noise over many tests emits <= 1 finding", () => {
    let seed = 12345;
    const rand = () => {
      seed = (seed * 1664525 + 1013904223) % 4294967296;
      return seed / 4294967296;
    };
    const metrics = Array.from({ length: 4 }, (_, k) => ({
      id: `m${k}`,
      name: `M${k}`,
    }));
    const sessions: FindingsSessionInput[] = Array.from(
      { length: 30 },
      (_, i) => {
        const cv: Record<string, unknown> = {};
        for (const m of metrics) cv[m.id] = Math.round(rand() * 10);
        const sets: FindingsSessionInput["sets"] = [];
        for (let e = 0; e < 6; e++)
          sets.push({
            exerciseId: `ex${e}`,
            exerciseName: `Ex${e}`,
            weightKg: 100 * (1 + (rand() - 0.5) * 0.1),
            reps: 5,
          });
        return {
          sessionId: `s${i}`,
          startedAt: i * 3 * DAY_MS,
          conditionValues: cv,
          sets,
        };
      },
    );
    expect(conditionFindings(sessions, metrics).length).toBeLessThanOrEqual(1);
  });
});
