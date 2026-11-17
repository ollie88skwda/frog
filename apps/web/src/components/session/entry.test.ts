import { describe, expect, it } from "vitest";
import {
  holdMultiplier,
  logLabel,
  scrubSteps,
  stepValue,
  weightStep,
} from "./entry";

describe("entry logic", () => {
  it("steps by unit", () => {
    expect(weightStep("kg")).toBe(2.5);
    expect(weightStep("lb")).toBe(5);
  });
  it("steps values, clamped at 0", () => {
    expect(stepValue("80", 2.5)).toBe("82.5");
    expect(stepValue("", 1)).toBe("1");
    expect(stepValue("1", -2)).toBe("0");
    expect(stepValue("0.1", 0.2)).toBe("0.3");
  });
  it("scrub truncates toward zero", () => {
    expect(scrubSteps(17)).toBe(0);
    expect(scrubSteps(37)).toBe(2);
    expect(scrubSteps(-37)).toBe(-2);
  });
  it("accelerates on hold", () => {
    expect(holdMultiplier(0)).toBe(1);
    expect(holdMultiplier(8)).toBe(4);
    expect(holdMultiplier(25)).toBe(10);
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
    expect(
      logLabel({ ...base, weight: "40", reps: "8", unilateral: true }),
    ).toBe("Log 40 kg × 8 · ᴸ + ᴿ");
  });
});
