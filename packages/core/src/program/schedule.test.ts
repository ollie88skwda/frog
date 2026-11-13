import { describe, expect, it } from "vitest";
import { applyDeload, deloadSetCount, deloadTriggered } from "./deload";
import {
  blockStateAt,
  blockStateForWeek,
  blockWeek,
  needsRestart,
  restartLoadKg,
  sessionsPerWeek,
} from "./schedule";
import { FROG_DEFAULT } from "./templates/frog-default";
import { RESEARCH_C } from "./templates/research-c";
import type { ProgramSchedule } from "./types";

const DAY = 86_400_000;
// Sun 2026-01-04, local noon. FIRST_WEEKDAY is Sunday.
const SUN = new Date(2026, 0, 4, 12).getTime();

describe("block week (F11): derived, interval and weekday schedules", () => {
  it("interval schedules count elapsed 7-day periods from the start", () => {
    const s: ProgramSchedule = { kind: "interval", everyDays: 2 };
    const start = SUN + 2 * DAY; // a Tuesday
    expect(blockWeek(s, start, start)).toBe(1);
    expect(blockWeek(s, start, start + 6 * DAY)).toBe(1);
    expect(blockWeek(s, start, start + 7 * DAY)).toBe(2);
    expect(blockWeek(s, start, start + 15 * DAY)).toBe(3);
  });
  it("weekday schedules count app weeks (Sunday start)", () => {
    const s: ProgramSchedule = { kind: "weekdays", days: [1, 3, 5] };
    const start = SUN + 5 * DAY; // Friday of week 1
    expect(blockWeek(s, start, start)).toBe(1);
    expect(blockWeek(s, start, SUN + 6 * DAY)).toBe(1); // Saturday, same week
    expect(blockWeek(s, start, SUN + 7 * DAY)).toBe(2); // next Sunday
    expect(blockWeek(s, start, SUN + 28 * DAY)).toBe(5);
  });
  it("a clock before the start clamps to week 1", () => {
    expect(blockWeek({ kind: "interval", everyDays: 2 }, SUN, SUN - DAY)).toBe(
      1,
    );
  });
  it("sessionsPerWeek: EOD is 3.5", () => {
    expect(sessionsPerWeek({ kind: "interval", everyDays: 2 })).toBe(3.5);
    expect(sessionsPerWeek({ kind: "weekdays", days: [1, 3, 5] })).toBe(3);
  });
});

describe("block state", () => {
  it("continuous: deload every 6th week, countdown before it", () => {
    const b = FROG_DEFAULT.block;
    expect(blockStateForWeek(b, 1).weeksUntilDeload).toBe(5);
    expect(blockStateForWeek(b, 5).weeksUntilDeload).toBe(1);
    const six = blockStateForWeek(b, 6);
    expect(six.isDeload).toBe(true);
    expect(six.rir).toEqual([3, 4]);
    expect(blockStateForWeek(b, 7).isDeload).toBe(false);
    expect(blockStateForWeek(b, 12).isDeload).toBe(true);
  });
  it("Program C: wk1 2-3 RIR, wk5 holds load at 1-2, wk6 deload, wk7 retest, then complete", () => {
    const b = RESEARCH_C.block;
    expect(blockStateForWeek(b, 1).rir).toEqual([2, 3]);
    expect(blockStateForWeek(b, 3).rir).toBeNull();
    const w5 = blockStateForWeek(b, 5);
    expect(w5.rir).toEqual([1, 2]);
    expect(w5.holdLoad).toBe(true);
    expect(blockStateForWeek(b, 6).phase).toBe("deload");
    expect(blockStateForWeek(b, 7).phase).toBe("retest");
    expect(blockStateForWeek(b, 8).phase).toBe("complete");
    expect(blockStateForWeek(b, 1).totalWeeks).toBe(7);
  });
  it("not started yet: no week", () => {
    const st = blockStateAt(
      FROG_DEFAULT.block,
      FROG_DEFAULT.schedule,
      null,
      SUN,
    );
    expect(st.week).toBeNull();
    expect(st.isDeload).toBe(false);
  });
});

describe("deload overlay (R17, C14)", () => {
  it("half rounded down, min 1", () => {
    expect([1, 2, 3, 4, 5].map((n) => deloadSetCount(n))).toEqual([
      1, 1, 1, 2, 2,
    ]);
  });
  it("keeps warm-ups, renumbers, does not mutate", () => {
    const input = [
      {
        exerciseId: "x",
        orderIndex: 0,
        sets: [
          { setNo: 0, setType: "warmup" },
          { setNo: 1, setType: "normal", targetWeightKg: 80 },
          { setNo: 2, setType: "normal", targetWeightKg: 80 },
          { setNo: 3, setType: "normal", targetWeightKg: 80 },
          { setNo: 4, setType: "normal", targetWeightKg: 80 },
        ],
      },
    ];
    const snapshot = JSON.stringify(input);
    const out = applyDeload(input);
    expect(JSON.stringify(input)).toBe(snapshot);
    expect(out[0].sets.map((s) => s.setType)).toEqual([
      "warmup",
      "normal",
      "normal",
    ]);
    expect(out[0].sets.map((s) => s.setNo)).toEqual([0, 1, 2]);
  });
  it("R25 trigger: more than 2.5% down in each of two consecutive weeks", () => {
    expect(deloadTriggered([100, 97, 94])).toBe(true);
    expect(deloadTriggered([100, 97, 96])).toBe(false); // second step is 1.0%
    expect(deloadTriggered([100, 97.5, 95])).toBe(false); // exactly 2.5% is not "more than"
    expect(deloadTriggered([100, 90])).toBe(false); // needs two steps
    expect(deloadTriggered([100, 97, 100, 97])).toBe(false);
  });
});

describe("restart after time off (C15)", () => {
  it("14+ days triggers", () => {
    expect(needsRestart(13)).toBe(false);
    expect(needsRestart(14)).toBe(true);
  });
  it("default prefill is 85% rounded to the equipment step", () => {
    expect(restartLoadKg(100, 2.5)).toBe(85);
    expect(restartLoadKg(102.5, 2.5)).toBe(87.5); // 87.125 → 87.5
    expect(restartLoadKg(60, 2)).toBe(52); // 51 → 52 (nearest step)
    expect(restartLoadKg(0, 2.5)).toBe(0);
  });
});
