import { describe, it, expect } from "vitest";
import { summarizeReport, sessionsUntilFirstFinding } from "./progressionSummary";
import type { HolisticReport, ExerciseFinding } from "./findings";

function makeReport(overrides: Partial<HolisticReport> = {}): HolisticReport {
  return { findings: {}, offDays: [], weightOutliers: [], spikeReverts: [], ...overrides };
}

function finding(verdict: ExerciseFinding["verdict"], pctChange = 0): ExerciseFinding {
  return { n: 6, verdict, pctChange, perMonth: 0, r2: 0.8 };
}

describe("summarizeReport", () => {
  it("returns not-enough-data when findings is empty", () => {
    const s = summarizeReport(makeReport());
    expect(s.headline).toContain("Not enough data");
    expect(s.lines).toHaveLength(1);
    expect(s.lines[0].type).toBe("insufficient");
  });

  it("positive headline when progressing, none regressing", () => {
    const s = summarizeReport(makeReport({
      findings: {
        "Bench Press": finding("PROGRESSING", 8),
        "Squat": finding("PROGRESSING", 10),
      },
    }));
    expect(s.headline).toContain("2 of 2");
    expect(s.headline).toContain("progressing");
    expect(s.lines.find((l) => l.type === "progress")).toBeTruthy();
  });

  it("regression headline when any lift regresses and none progress", () => {
    const s = summarizeReport(makeReport({
      findings: { "Bench Press": finding("REGRESSING", -8) },
    }));
    expect(s.headline).toContain("regressing");
    expect(s.lines.find((l) => l.type === "regressing")).toBeTruthy();
  });

  it("mixed headline when both progressing and regressing", () => {
    const s = summarizeReport(makeReport({
      findings: {
        "Bench Press": finding("PROGRESSING", 8),
        "Squat": finding("REGRESSING", -6),
      },
    }));
    expect(s.headline).toContain("Mixed");
    expect(s.lines.find((l) => l.type === "progress")).toBeTruthy();
    expect(s.lines.find((l) => l.type === "regressing")).toBeTruthy();
  });

  it("plateau headline when all lifts plateau", () => {
    const s = summarizeReport(makeReport({
      findings: {
        "Bench Press": finding("PLATEAU", 1),
        "Squat": finding("PLATEAU", 2),
      },
    }));
    expect(s.headline).toContain("plateau");
  });

  it("includes off-day line when offDays are present", () => {
    const s = summarizeReport(makeReport({
      findings: { "Bench Press": finding("PLATEAU") },
      offDays: [{ sessionDay: 100, avgDevPct: -10, exercisesChecked: 3 }],
    }));
    const offLine = s.lines.find((l) => l.type === "offdays");
    expect(offLine).toBeTruthy();
    expect(offLine!.text).toContain("1 session");
  });

  it("includes data-issues line for weight outliers and spike reverts", () => {
    const s = summarizeReport(makeReport({
      findings: { "Bench Press": finding("PLATEAU") },
      weightOutliers: [{ exercise: "Bench Press", sessionDay: 50, weightKg: 450, medianKg: 100, zScore: 7 }],
      spikeReverts: [{ exercise: "Bench Press", sessionDay: 60, prevE1rm: 110, spikeE1rm: 450, nextE1rm: 112 }],
    }));
    const dataLine = s.lines.find((l) => l.type === "dataissues");
    expect(dataLine).toBeTruthy();
    expect(dataLine!.text).toContain("2 potential");
  });

  it("includes insufficient line and omits progress line when insufficient", () => {
    const s = summarizeReport(makeReport({
      findings: { "New Lift": { n: 2, verdict: "INSUFFICIENT", pctChange: 0, perMonth: 0, r2: 0 } },
    }));
    expect(s.lines.find((l) => l.type === "insufficient")).toBeTruthy();
    expect(s.lines.find((l) => l.type === "progress")).toBeFalsy();
  });
});

describe("sessionsUntilFirstFinding", () => {
  it("returns 0 when all findings have a real verdict", () => {
    expect(sessionsUntilFirstFinding({
      "Bench": finding("PROGRESSING"),
      "Squat": finding("PLATEAU"),
    })).toBe(0);
  });

  it("counts remaining sessions needed for the least-progressed lift", () => {
    expect(sessionsUntilFirstFinding({
      "Bench": { n: 2, verdict: "INSUFFICIENT", pctChange: 0, perMonth: 0, r2: 0 },
      "Squat": { n: 4, verdict: "INSUFFICIENT", pctChange: 0, perMonth: 0, r2: 0 },
    })).toBe(3); // 5 - 2 = 3 (worst case)
  });

  it("returns 0 for empty findings", () => {
    expect(sessionsUntilFirstFinding({})).toBe(0);
  });

  it("returns 1 when one lift needs one more session", () => {
    expect(sessionsUntilFirstFinding({
      "Bench": { n: 4, verdict: "INSUFFICIENT", pctChange: 0, perMonth: 0, r2: 0 },
    })).toBe(1);
  });
});
