// Precedence matrix, boundaries, guardrails and the dismissal contract (F4 acceptance).
import { describe, expect, it } from "vitest";
import { DORMANT_RULES } from "./dormant";
import { brzycki, declinedMoreThan } from "./e1rm";
import { evaluateCoach } from "./evaluate";
import { EX, find, input, P, S, set } from "./fixtures/build";
import { fixture as c4 } from "./fixtures/case-04";
import { fixture as c9 } from "./fixtures/case-09";
import { fixture as c10 } from "./fixtures/case-10";
import { fixture as c12 } from "./fixtures/case-12";
import { fixture as c13 } from "./fixtures/case-13";
import { fixture as c15 } from "./fixtures/case-15";
import { fixture as c16 } from "./fixtures/case-16";
import { fixture as c17 } from "./fixtures/case-17";
import { fixture as c19 } from "./fixtures/case-19";
import { selectInSetNudges } from "./nudges";
import { weekKey } from "./time";

const every = [c4, c9, c10, c12, c13, c15, c16, c17, c19];

describe("e1RM (C2c-e1rm, Brzycki on reps + RIR)", () => {
  it("100 kg × 8 @ 2 → 100×36/27 = 133.3 total", () => {
    // 8 reps + 2 RIR = 10 total
    expect(brzycki(100, 8, 2)?.value).toBeCloseTo(133.33, 2);
    expect(brzycki(100, 8, 2)?.flagged).toBe(false);
  });
  it("flags sets over 10 total reps", () => {
    expect(brzycki(80, 10, 2)?.flagged).toBe(true);
    expect(brzycki(100, 6, 2)?.flagged).toBe(false);
  });
});

describe("boundaries", () => {
  it("2.5% exactly does not fire (117 vs 120, case 17 float guard)", () => {
    expect(declinedMoreThan(120, 117, 0.025)).toBe(false);
    expect(declinedMoreThan(120, 116.9, 0.025)).toBe(true);
    expect(declinedMoreThan(124.14, 120, 0.025)).toBe(true);
  });
  it("weeks are Monday-Sunday: Sun and the next Mon fall in different weeks", () => {
    const sun = Date.parse("2026-11-08T12:00:00Z");
    const mon = Date.parse("2026-11-09T12:00:00Z");
    const tue = Date.parse("2026-11-10T12:00:00Z");
    expect(weekKey(mon, 0, 1)).toBe(weekKey(tue, 0, 1));
    expect(weekKey(mon, 0, 1) - weekKey(sun, 0, 1)).toBe(7);
  });
  it("a 14+ day gap resets the window: the old best does not make a drop", () => {
    // case 10: naive compare would show -12.1%
    const pt = c10.points[0];
    const r = evaluateCoach(pt.input);
    expect(r.perExercise.get("squat")?.dropPct).toBeNull();
  });
});

describe("precedence matrix", () => {
  it("deload > hold > stall/add (case 9, 17)", () => {
    const r = evaluateCoach(c9.points[0].input);
    expect(
      r.suggestions
        .filter((s) => s.action.kind !== "text_only")
        .map((s) => s.ruleId),
    ).toEqual(["C14"]);
  });
  it("C14 + C10 together become ONE deload citing both", () => {
    // case 17 shape with a steeper decline so C14 also fires
    const r = evaluateCoach(
      input([
        S("10-19", "18:00", ["100x6@2"]),
        S("10-22", "18:00", ["100x6@2"], { sleep: 5 }),
        S("10-26", "18:00", ["95x5@2"], { sleep: 5 }),
        S("10-29", "18:00", ["95x5@2"], { sleep: 5 }),
        S("11-02", "18:00", ["90x5@2"], { sleep: 5 }),
      ]),
    );
    const deloads = r.suggestions.filter((s) => s.action.kind === "deload");
    expect(deloads).toHaveLength(1);
    expect(deloads[0].ruleId).toBe("C14");
    expect(
      deloads[0].why.some(
        (w) =>
          w.cite === "C10" || /Short-sleep|sessions in 14 days/.test(w.text),
      ),
    ).toBe(true);
    expect(r.suppressed.some((s) => s.ruleId === "C10")).toBe(true);
  });
  it("hold beats add-load but keeps it pending (case 12)", () => {
    const r = evaluateCoach(c12.points[1].input);
    expect(find(r, "C2c-overshoot")).toBeUndefined();
    expect(r.perExercise.get("bench")?.pendingAddLoad).not.toBeNull();
  });
  it("restart (C15) blocks a stall response", () => {
    const r = evaluateCoach(c10.points[0].input);
    expect(
      r.suggestions
        .filter((s) => s.action.kind !== "text_only")
        .map((s) => s.ruleId),
    ).toEqual(["C15"]);
  });
  it("stall + drop → rep shift, not load drop (case 16)", () => {
    const r = evaluateCoach(c16.points[0].input);
    expect(r.suggestions.some((s) => s.action.kind === "set_load")).toBe(false);
  });
  it("C7 cut needs a drop beyond 10% with ≥3 prior; session-only", () => {
    const sess = [
      S("10-05", "18:00", ["100x6@2"]),
      S("10-08", "18:00", ["100x6@2"]),
      S("10-12", "18:00", ["100x6@2"]),
      S("10-15", "18:00", ["80x5@2"], { sleep: 5 }), // ~22% down
    ];
    const r = evaluateCoach(input(sess));
    const c7 = find(r, "C7", "squat");
    expect(c7?.action).toEqual({
      kind: "remove_set",
      exerciseId: "squat",
      count: 1,
    });
    expect(find(r, "C9d", "squat")).toBeDefined(); // hold covers load, C7 covers sets
  });
});

describe("guardrails", () => {
  const everything = [c4, c9, c12, c13, c15, c16, c17, c19].flatMap((f) =>
    f.points.map((p) => evaluateCoach(p.input)),
  );
  it("no suggestion renders without a tier and a Why", () => {
    for (const r of everything)
      for (const s of [...r.suggestions, ...r.suppressed]) {
        expect(["T1", "T2", "T3", "T4", "T5"]).toContain(s.evidenceTier);
        expect(s.tierNote.length).toBeGreaterThan(0);
        expect(s.why.length).toBeGreaterThan(0);
        expect(s.message.length).toBeGreaterThan(0);
      }
  });
  it("T5 copy is the fixed practical-default line", () => {
    const s = evaluateCoach(c16.points[0].input).suggestions.find(
      (x) => x.evidenceTier === "T5",
    );
    expect(s?.tierNote).toBe("A practical default, not trial-tested.");
  });
  it("copy never makes a banned claim (COPY anti-claims §12)", () => {
    const banned = [
      /muscle growth/i,
      /grow(s|th)? faster/i,
      /required/i,
      /optimal volume/i,
      /\bMEV\b|\bMRV\b/,
    ];
    for (const r of everything)
      for (const s of r.suggestions)
        for (const b of banned) expect(s.message).not.toMatch(b);
  });
  it("coach off returns nothing; per-rule off suppresses and records why", () => {
    const base = c16.points[0].input;
    const off = evaluateCoach({ ...base, prefs: { enabled: false } });
    expect(off.suggestions).toEqual([]);
    const ruleOff = evaluateCoach({
      ...base,
      prefs: { rulesOff: ["C2c-stall"] },
    });
    expect(find(ruleOff, "C2c-stall")).toBeUndefined();
    expect(
      ruleOff.suppressed.find((s) => s.ruleId === "C2c-stall")?.suppressedBy,
    ).toBe("rule_off");
  });
  it("low RIR coverage says log RIR instead of guessing", () => {
    const blank = (md: string) => {
      const s = S(md, "18:00", ["100x5"], {});
      return s;
    };
    const r = evaluateCoach(
      input(["10-05", "10-08", "10-12", "10-15"].map(blank)),
    );
    expect(r.suggestions).toEqual([]);
    expect(r.notEvaluated.some((n) => n.reason === "no_rir")).toBe(true);
    expect(r.perExercise.get("squat")?.rirCoverage).toBe(0);
  });
  it("counts skipped no-RIR sets without using them", () => {
    const s = S("10-05", "18:00", ["100x5@2", "110x5"]);
    const r = evaluateCoach(input([s]));
    expect(r.perExercise.get("squat")?.rirSkipCount).toBe(1);
    expect(r.perExercise.get("squat")?.sessionE1rms[0].e1rm).toBeCloseTo(
      120,
      2,
    );
  });
  it("warm-ups never count; a unilateral pair is one set", () => {
    const s = S("10-05", "18:00", ["100x5@2"]);
    s.exercises[0].sets.push({ ...set("40x6@4", 2), setType: "warmup" });
    const l = { ...set("90x8@2", 3), side: "left" as const };
    const rgt = { ...set("90x6@2", 3), side: "right" as const };
    s.exercises[0].sets.push(l, rgt);
    const r = evaluateCoach(input([s]));
    expect(r.perExercise.get("squat")?.sessionE1rms[0].e1rm).toBeCloseTo(
      120,
      2,
    );
  });
  it("dormant rules are listed as dormant, never silently passed", () => {
    const r = evaluateCoach(c16.points[0].input);
    for (const d of DORMANT_RULES)
      expect(
        r.notEvaluated.some(
          (n) => n.ruleId === d.ruleId && n.reason === "dormant",
        ),
      ).toBe(true);
    expect(
      r.suggestions.some((s) =>
        DORMANT_RULES.some((d) => (d.ruleId as string) === s.ruleId),
      ),
    ).toBe(false);
  });
  it("pure: no Date.now() use", () => {
    const orig = Date.now;
    Date.now = () => {
      throw new Error("Date.now called");
    };
    try {
      for (const f of every) for (const p of f.points) evaluateCoach(p.input);
    } finally {
      Date.now = orig;
    }
  });
});

describe("dismissals (F4)", () => {
  const base = c16.points[0].input;
  const id = find(evaluateCoach(base), "C2c-stall", "squat")?.id as string;
  it("once: that suggestion id stays hidden", () => {
    const r = evaluateCoach({
      ...base,
      prefs: {
        dismissed: [
          {
            suggestionId: id,
            ruleId: "C2c-stall",
            exerciseId: "squat",
            scope: "once",
            at: base.asOf,
          },
        ],
      },
    });
    expect(find(r, "C2c-stall")).toBeUndefined();
    expect(r.suppressed.find((s) => s.id === id)?.suppressedBy).toBe(
      "dismissed",
    );
  });
  it("exercise_4w: hidden for 4 weeks, back after", () => {
    const d = {
      ruleId: "C2c-stall" as const,
      exerciseId: "squat",
      scope: "exercise_4w" as const,
      at: base.asOf,
    };
    const within = evaluateCoach({
      ...base,
      asOf: base.asOf + 27 * 86_400_000,
      prefs: { dismissed: [d] },
    });
    expect(find(within, "C2c-stall")).toBeUndefined();
    const after = evaluateCoach({
      ...base,
      asOf: base.asOf + 29 * 86_400_000,
      prefs: { dismissed: [d] },
    });
    expect(find(after, "C2c-stall")).toBeDefined();
  });
  it("rule: never shown", () => {
    const r = evaluateCoach({
      ...base,
      prefs: {
        dismissed: [
          { ruleId: "C2c-stall", exerciseId: null, scope: "rule", at: 0 },
        ],
      },
    });
    expect(find(r, "C2c-stall")).toBeUndefined();
  });
  it("a dismissed plan-changing suggestion still computes (history stays consistent)", () => {
    const r = evaluateCoach({
      ...base,
      prefs: {
        dismissed: [
          { ruleId: "C2c-stall", exerciseId: null, scope: "rule", at: 0 },
        ],
      },
    });
    expect(r.perExercise.get("squat")?.stalled).toBe(true);
  });
  it("ids are deterministic across recomputes", () => {
    expect(find(evaluateCoach(base), "C2c-stall")?.id).toBe(id);
  });
});

describe("overrides are not re-nagged", () => {
  it("add-load card flips to 'ready whenever' after the lifter held the load on a normal night", () => {
    const sessions = [
      S("10-19", "18:00", ["100x10@2", "95x7@2"]),
      S("10-22", "18:00", ["100x6@2", "90x7@2"]),
    ];
    const r = evaluateCoach(input(sessions));
    const s = find(r, "C2c-overshoot", "squat");
    expect(s?.message).toContain("ready to go up");
    expect(s?.surfaces).toEqual(["prescription"]);
  });
});

describe("increments and the C6 clamp", () => {
  it("2.5% compound step on a 0.5 kg grid", () => {
    const r = evaluateCoach(c15.points[1].input);
    expect(r.perExercise.get("squat")?.prescription?.loadKg).toBe(102.5);
  });
  it("C5 never lowers a compound below 1 RIR (C6)", () => {
    const o = { planned: P(5, 8, 1, 1, 3), exerciseId: "bench" };
    const r = evaluateCoach(
      input(
        [
          S("11-07", "18:00", ["80x6@1", "80x6@4", "80x6@4"], o),
          S("11-09", "18:00", ["80x6@1", "80x6@4", "80x6@4"], o),
        ],
        { exercises: [EX.bench] },
      ),
    );
    expect(find(r, "C5")).toBeUndefined();
  });
  it("C4 raises target RIR by 1 for a week", () => {
    const o = { planned: P(5, 8, 2, 2, 3), exerciseId: "bench" };
    const sess = ["11-07", "11-09", "11-11"].map((d) =>
      S(d, "18:00", ["80x6@2", "80x6@0", "80x6@0"], o),
    );
    const r = evaluateCoach(input(sess, { exercises: [EX.bench] }));
    expect(find(r, "C4", "bench")?.action).toMatchObject({
      kind: "set_target_rir",
      rir: [3, 3],
      forDays: 7,
    });
  });
});

describe("snapshot absence", () => {
  it("sessions without a snapshot use the routine range and drop to low confidence", () => {
    const sess = ["10-05", "10-08", "10-12", "10-15"].map((d) =>
      S(d, "18:00", ["100x5@2"], { planned: null }),
    );
    const r = evaluateCoach(
      input(sess, { plan: [{ exerciseId: "squat", planned: P() }] }),
    );
    const st = r.perExercise.get("squat");
    expect(st?.comparableSessions).toBe(4);
  });
});

describe("in-set nudges", () => {
  const sugg = evaluateCoach(c12.points[0].input).suggestions;
  it("never on set 1, ≤1 per exercise", () => {
    expect(
      selectInSetNudges(sugg, { setsLogged: new Map([["bench", 0]]) }),
    ).toEqual([]);
    expect(
      selectInSetNudges(sugg, { setsLogged: new Map([["bench", 2]]) }).length,
    ).toBeLessThanOrEqual(1);
  });
  it("a dismissed rule is silent for the session", () => {
    expect(
      selectInSetNudges(sugg, {
        setsLogged: new Map([["bench", 2]]),
        dismissedRules: ["C2c-overshoot"],
      }),
    ).toEqual([]);
  });
});

describe("weekly volume (C11/C12)", () => {
  it("C12 trims 1 set at ≥20 weekly sets with a stalled lift, before any C2 add-set", () => {
    // 22 direct squat sets last week, then a flat 7-session stall
    const week = (md: string, n: number) =>
      S(
        md,
        "18:00",
        Array.from({ length: n }, () => "100x5@2"),
        { planned: P(5, 8, 2, 2, n) },
      );
    const sessions = [
      week("10-05", 2),
      week("10-08", 2),
      week("10-12", 2),
      week("10-15", 2),
      week("10-19", 2),
      week("10-22", 2),
      week("11-02", 11),
      week("11-04", 11),
    ];
    const r = evaluateCoach(
      input(sessions, {
        asOf: Date.parse("2026-11-09T12:00:00Z"),
        currentSessionId: undefined,
      }),
    );
    expect(r.suggestions.some((s) => s.ruleId === "C12")).toBe(true);
    expect(find(r, "C11")).toBeUndefined();
  });
});

describe("deloads and the comparable window", () => {
  const deload = (md: string, specs: string[], o = {}) =>
    S(md, "18:00", specs, {
      planned: P(5, 8, 3, 4, 1, { isDeload: true }),
      ...o,
    });
  const c9Sessions = c9.points[0].input.sessions;

  it("a deload session is skipped, not a window break (C2c-reset)", () => {
    const r = evaluateCoach(
      input([
        ...c9Sessions,
        deload("11-02", ["95x5@3"]),
        S("11-05", "18:00", ["95x5@2"]),
      ]),
    );
    expect(r.perExercise.get("squat")?.comparableSessions).toBe(8);
  });
  it("a deload as the latest session keeps the earlier window", () => {
    const r = evaluateCoach(
      input([...c9Sessions, deload("11-02", ["95x5@3"])]),
    );
    expect(r.perExercise.get("squat")?.comparableSessions).toBe(7);
  });
  it("C10 does not fire again during the deload week", () => {
    const r = evaluateCoach(
      input([
        S("10-19", "18:00", ["100x6@2"]),
        S("10-22", "18:00", ["100x6@2"], { sleep: 5 }),
        S("10-26", "18:00", ["95x5@2"], { sleep: 5 }),
        S("10-29", "18:00", ["95x5@2"], { sleep: 5 }),
        S("11-02", "18:00", ["90x5@2"], { sleep: 5 }),
        deload("11-04", ["90x5@3"], { sleep: 5 }),
      ]),
    );
    expect(r.suggestions.some((s) => s.action.kind === "deload")).toBe(false);
  });
  it("inside the deload week the plan stays the deload", () => {
    const r = evaluateCoach(
      input([...c9Sessions, deload("11-02", ["95x5@3"])], {
        asOf: Date.parse("2026-11-04T12:00:00Z"),
        currentSessionId: undefined,
      }),
    );
    expect(
      r.suggestions.filter(
        (s) => s.exerciseId === "squat" && s.action.kind !== "text_only",
      ),
    ).toEqual([]);
    expect(r.perExercise.get("squat")?.prescription).toMatchObject({
      rir: [3, 4],
      sets: 1,
    });
  });
  it("deload targets do not carry into the next normal prescription", () => {
    const r = evaluateCoach(
      input([
        ...c9Sessions,
        deload("11-02", ["95x5@3"]),
        S("11-09", "18:00", ["60x8@2"], { exerciseId: "bench" }),
      ]),
    );
    const p = r.perExercise.get("squat")?.prescription;
    expect(p?.rir).toEqual([2, 2]);
    expect(p?.delta).not.toBe("deload");
  });
});

describe("drift reaches the prescription", () => {
  it("a winning C4 sets the next-session target RIR", () => {
    const o = { planned: P(5, 8, 2, 2, 3), exerciseId: "bench" };
    const sess = ["11-07", "11-09", "11-11"].map((d) =>
      S(d, "18:00", ["80x6@2", "80x6@0", "80x6@0"], o),
    );
    const r = evaluateCoach(input(sess, { exercises: [EX.bench] }));
    expect(r.perExercise.get("bench")?.prescription).toMatchObject({
      rir: [3, 3],
      ruleId: "C4",
    });
  });
  it("the drift pool covers 7 days: a session 7 days back is out", () => {
    const o = { planned: P(5, 8, 2, 2, 3), exerciseId: "bench" };
    const sess = ["11-04", "11-07", "11-11"].map((d) =>
      S(d, "18:00", ["80x6@2", "80x6@0", "80x6@0"], o),
    );
    const r = evaluateCoach(input(sess, { exercises: [EX.bench] }));
    expect(find(r, "C4")).toBeUndefined();
  });
});

describe("dismissed suggestions never suppress others", () => {
  it("dismissing C14 for the exercise lets the stall response show", () => {
    const base = c9.points[0].input;
    const r = evaluateCoach({
      ...base,
      prefs: {
        dismissed: [
          {
            ruleId: "C14",
            exerciseId: "squat",
            scope: "exercise_4w",
            at: base.asOf,
          },
        ],
      },
    });
    expect(find(r, "C14")).toBeUndefined();
    expect(find(r, "C2c-stall", "squat")).toBeDefined();
    expect(r.suppressed.find((s) => s.ruleId === "C14")?.suppressedBy).toBe(
      "dismissed",
    );
    expect(r.perExercise.get("squat")?.prescription?.delta).not.toBe("deload");
  });
});

describe("weekly volume uses Monday-Sunday weeks", () => {
  it("a Sunday session counts toward last week's C12 total", () => {
    const week = (md: string, n: number) =>
      S(
        md,
        "18:00",
        Array.from({ length: n }, () => "100x5@2"),
        { planned: P(5, 8, 2, 2, n) },
      );
    const sessions = [
      week("10-05", 2),
      week("10-08", 2),
      week("10-12", 2),
      week("10-15", 2),
      week("10-19", 2),
      week("10-22", 2),
      week("11-04", 11),
      week("11-08", 11),
    ];
    const r = evaluateCoach(
      input(sessions, {
        asOf: Date.parse("2026-11-09T12:00:00Z"),
        currentSessionId: undefined,
      }),
    );
    expect(find(r, "C12")).toBeDefined();
  });
});
