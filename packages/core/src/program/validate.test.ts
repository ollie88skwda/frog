import { describe, expect, it } from "vitest";
import { FROG_DEFAULT } from "./templates/frog-default";
import { RESEARCH_B } from "./templates/research-b";
import type { ProgramView, ViewSlot } from "./types";
import { fitToMinutes, validateProgram } from "./validate";
import { viewOf } from "./view";
import { weeklySets } from "./volume";

const slot = (over: Partial<ViewSlot> & { slot: string }): ViewSlot => ({
  role: "isolation",
  credits: { direct: ["quads"], indirect: [] },
  rx: {
    sets: 3,
    reps: [10, 15],
    rir: [1, 3],
    restSec: [60, 90],
    warmup: "none",
  },
  ...over,
});

const one = (
  slots: ViewSlot[],
  extra: Partial<ProgramView> = {},
): ProgramView => ({
  schedule: { kind: "interval", everyDays: 2 },
  rotation: "same",
  sessions: [{ id: "s", name: "S", slots }],
  block: null,
  goal: "muscle",
  ...extra,
});

const codes = (v: ProgramView) =>
  validateProgram(v).findings.map((f) => f.code);

describe("validateProgram never blocks and cites rules", () => {
  it("every finding is info or heads-up with a rule and tier", () => {
    const r = validateProgram(
      one([slot({ slot: "a", rx: { ...slot({ slot: "x" }).rx, sets: 8 } })]),
    );
    expect(r.findings.length).toBeGreaterThan(0);
    for (const f of r.findings) {
      expect(["info", "heads-up"]).toContain(f.severity);
      expect(f.rule).toMatch(/^[RC]\d+/);
      expect(f.tier).toMatch(/^T[1-5]$/);
      expect(f.message.length).toBeGreaterThan(10);
    }
  });

  it("SESSION_CAP appears at 6 direct sets, not at 5 (F8 acceptance)", () => {
    const at = (n: number) =>
      one([slot({ slot: "a", rx: { ...slot({ slot: "x" }).rx, sets: n } })]);
    expect(codes(at(5))).not.toContain("SESSION_CAP");
    const six = validateProgram(at(6)).findings.find(
      (f) => f.code === "SESSION_CAP",
    )!;
    expect(six.rule).toBe("R7b");
    expect(six.message).toContain("no study sets a cap");
  });

  it("indirect sets never trigger the cap", () => {
    const v = one([
      slot({
        slot: "a",
        credits: { direct: ["lats"], indirect: ["biceps"] },
        rx: { ...slot({ slot: "x" }).rx, sets: 9 },
      }),
    ]);
    expect(
      validateProgram(v).findings.filter(
        (f) => f.code === "SESSION_CAP" && f.target.muscle === "biceps",
      ),
    ).toEqual([]);
  });

  it("WEEKLY_LOW offers a one-tap add-set fix; WEEKLY_HIGH is info only", () => {
    const low = validateProgram(
      one([slot({ slot: "a", rx: { ...slot({ slot: "x" }).rx, sets: 2 } })]),
    ).findings.find((f) => f.code === "WEEKLY_LOW")!;
    expect(low.fix?.patch[0]).toMatchObject({ slot: "a", sets: 3 });
    const many = one([
      slot({ slot: "a", rx: { ...slot({ slot: "x" }).rx, sets: 5 } }),
      slot({ slot: "b", rx: { ...slot({ slot: "x" }).rx, sets: 5 } }),
    ]);
    const high = validateProgram(many).findings.find(
      (f) => f.code === "WEEKLY_HIGH",
    )!;
    expect(high.severity).toBe("info");
    expect(high.rule).toBe("C12");
  });

  it("FREQ_LOW when a muscle sits in one session a week", () => {
    const v = one([slot({ slot: "a" })], {
      schedule: { kind: "weekdays", days: [1] },
    });
    expect(codes(v)).toContain("FREQ_LOW");
  });

  it("REPS_RANGE: 4-8 isolation is fine (R8), 1-3 compound is flagged", () => {
    const iso = one([
      slot({ slot: "a", rx: { ...slot({ slot: "x" }).rx, reps: [4, 8] } }),
    ]);
    expect(codes(iso)).not.toContain("REPS_RANGE");
    const heavy = one([
      slot({
        slot: "a",
        role: "compound",
        rx: { ...slot({ slot: "x" }).rx, reps: [1, 3] },
      }),
    ]);
    expect(codes(heavy)).toContain("REPS_RANGE");
  });

  it("RIR_RANGE: compound at 0 RIR is flagged, isolation is not", () => {
    const mk = (role: ViewSlot["role"]) =>
      one([
        slot({
          slot: "a",
          role,
          rx: { ...slot({ slot: "x" }).rx, rir: [0, 1] },
        }),
      ]);
    expect(codes(mk("compound"))).toContain("RIR_RANGE");
    expect(codes(mk("isolation"))).not.toContain("RIR_RANGE");
  });

  it("TIME_OVER fires with a trim patch that actually fits", () => {
    const v = { ...viewOf(FROG_DEFAULT), maxMinutes: 56 };
    const f = validateProgram(v).findings.find((x) => x.code === "TIME_OVER")!;
    expect(f).toBeDefined();
    expect(f.fix?.patch.length).toBeGreaterThan(0);
    // Applying the patch must bring the longest session under budget.
    const fitted = viewOf(FROG_DEFAULT, { overrides: f.fix!.patch });
    const r = validateProgram(fitted);
    expect(Math.max(...r.minutes.map((m) => m.max))).toBeLessThanOrEqual(56);
    // ...without dropping any muscle below the weekly floor it started above.
    const before = weeklySets(v);
    const after = weeklySets(fitted);
    for (const [m, w] of Object.entries(before))
      if (w.total >= 10) expect(after[m].total).toBeGreaterThanOrEqual(10);
  });

  it("fitToMinutes returns an empty patch when nothing needs trimming", () => {
    expect(fitToMinutes(viewOf(FROG_DEFAULT), 120)).toEqual([]);
  });

  it("fitToMinutes never pushes a muscle below the weekly floor to save time", () => {
    const v = viewOf(FROG_DEFAULT);
    const patch = fitToMinutes(v, 30);
    const after = weeklySets(viewOf(FROG_DEFAULT, { overrides: patch }));
    const before = weeklySets(v);
    for (const [m, w] of Object.entries(before))
      if (w.total >= 10) expect(after[m].total).toBeGreaterThanOrEqual(10);
  });

  it("DELOAD_MISSING when the block has no deload", () => {
    expect(codes(one([slot({ slot: "a" })]))).toContain("DELOAD_MISSING");
    expect(
      codes(
        viewOf({
          ...RESEARCH_B,
          block: { kind: "continuous", deload: RESEARCH_B.block.deload },
        }),
      ),
    ).not.toContain("DELOAD_MISSING");
  });

  it("goal maintain scales sets to about a third, min 1 (R18b)", () => {
    const v = viewOf(FROG_DEFAULT, {
      answers: { goal: "maintain", minutes: 60 },
    });
    expect(v.sessions[0].slots.map((s) => s.rx.sets)).toEqual([
      1, 1, 1, 1, 1, 1, 1, 1, 1,
    ]);
  });
});
