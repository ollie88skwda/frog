import { describe, expect, it } from "vitest";
import {
  applySetupSetting,
  fieldStep,
  isMajorTick,
  logLabel,
  resumeBlockIndex,
  scrubSteps,
  snapToStep,
  stepValue,
} from "./entry";

describe("entry logic", () => {
  // Step sizes come from the set-entry spec: 2.5 kg / 5 lb plates, 1 rep,
  // 0.1 km/mi distance.
  it("steps each field by its spec increment", () => {
    expect(fieldStep("weight", "kg")).toBe(2.5);
    expect(fieldStep("weight", "lb")).toBe(5);
    expect(fieldStep("reps", "kg")).toBe(1);
    expect(fieldStep("distance", "lb")).toBe(0.1);
  });
  it("steps values, clamped at 0", () => {
    expect(stepValue("80", 2.5)).toBe("82.5");
    expect(stepValue("", 1)).toBe("1");
    expect(stepValue("1", -2)).toBe("0");
    expect(stepValue("0.1", 0.2)).toBe("0.3");
  });
  it("repeated steps compose from the previous value", () => {
    let v = "80";
    for (let i = 0; i < 3; i++) v = stepValue(v, 5);
    expect(v).toBe("95");
    let d = "5";
    for (let i = 0; i < 3; i++) d = stepValue(d, 0.1);
    expect(d).toBe("5.3");
  });
  it("scrub truncates toward zero", () => {
    expect(scrubSteps(17)).toBe(0);
    expect(scrubSteps(37)).toBe(2);
    expect(scrubSteps(-37)).toBe(-2);
  });
  it("labels the log button", () => {
    const base = { weightUnit: "kg", setNo: 3, unilateral: false };
    expect(logLabel({ ...base, weight: "80", reps: "8" })).toBe(
      "Log 80 kg × 8",
    );
    expect(logLabel({ ...base, weight: "", reps: "" })).toBe("Log set 3");
    expect(
      logLabel({ ...base, weightUnit: null, weight: "", reps: "12" }),
    ).toBe("Log 12");
  });
  it("labels unilateral sets with both sides only when they differ", () => {
    const base = { weightUnit: "kg", setNo: 1, unilateral: true };
    expect(logLabel({ ...base, weight: "40", reps: "8" })).toBe(
      "Log 40 kg × 8 · L + R",
    );
    expect(logLabel({ ...base, weight: "40", reps: "8", rightReps: "8" })).toBe(
      "Log 40 kg × 8 · L + R",
    );
    expect(logLabel({ ...base, weight: "40", reps: "8", rightReps: "6" })).toBe(
      "Log 40 kg × 8/6 · L + R",
    );
    expect(
      logLabel({
        ...base,
        weight: "40",
        reps: "8",
        rightWeight: "35",
        rightReps: "6",
      }),
    ).toBe("Log 40/35 kg × 8/6 · L + R");
  });
  it("snaps to the nearest step and clamps to the range", () => {
    expect(snapToStep(81.3, 2.5, 0, 500)).toBe(82.5);
    expect(snapToStep(81.2, 2.5, 0, 500)).toBe(80);
    expect(snapToStep(-4, 2.5, 0, 500)).toBe(0);
    expect(snapToStep(900, 5, 0, 500)).toBe(500);
    expect(snapToStep(7.4, 1, 0, 100)).toBe(7);
  });
  it("marks every nth tick as major", () => {
    expect(isMajorTick(0, 8)).toBe(true);
    expect(isMajorTick(8, 8)).toBe(true);
    expect(isMajorTick(7, 8)).toBe(false);
  });
});

describe("applySetupSetting", () => {
  it("adds a setting to an empty note", () => {
    expect(applySetupSetting("", "Seat", "4")).toBe("Seat 4");
  });
  it("appends after existing text", () => {
    expect(applySetupSetting("grip wide", "Pad", "3")).toBe("grip wide, Pad 3");
  });
  it("replaces that setting's existing number", () => {
    expect(applySetupSetting("Seat 3, grip wide", "Seat", "5")).toBe(
      "Seat 5, grip wide",
    );
    expect(applySetupSetting("seat 3.5", "Seat", "6")).toBe("Seat 6");
  });
});

describe("resumeBlockIndex", () => {
  const b = (seId: string, committed: number, planned = 3) => ({
    seId,
    committed,
    planned,
  });
  it("prefers the saved exercise when it still exists", () => {
    expect(resumeBlockIndex([b("a", 3), b("b", 1)], "a")).toBe(0);
  });
  it("lands on the exercise with unfinished sets, not exercise 1", () => {
    expect(resumeBlockIndex([b("a", 3), b("b", 1), b("c", 0)], null)).toBe(1);
    expect(resumeBlockIndex([b("a", 3), b("b", 1), b("c", 0)], "gone")).toBe(1);
  });
  it("moves past a finished exercise to the next one", () => {
    expect(resumeBlockIndex([b("a", 3), b("b", 3), b("c", 0)], null)).toBe(2);
    expect(resumeBlockIndex([b("a", 3), b("b", 3)], null)).toBe(1);
  });
  it("starts at the first exercise when nothing is logged", () => {
    expect(resumeBlockIndex([b("a", 0), b("b", 0)], null)).toBe(0);
    expect(resumeBlockIndex([], null)).toBe(-1);
  });
});
