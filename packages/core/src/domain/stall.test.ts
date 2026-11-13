import { describe, expect, it } from "vitest";
import { e1rmSet } from "./e1rm";
import {
  type ComparableSession,
  comparableSessions,
  effortCheck,
  liftStatus,
  singleSessionDrop,
  stallStatus,
  windowAfterBreak,
} from "./stall";

const DAY = 86_400_000;
const T0 = Date.UTC(2026, 8, 7);
const mk = (vals: number[], gapDays = 3): ComparableSession[] =>
  vals.map((e1rm, i) => ({
    sessionId: `s${i}`,
    at: T0 + i * gapDays * DAY,
    e1rm,
  }));
const top = (kg: number, reps: number, rir = 2) =>
  e1rmSet(kg, reps, rir).value as number;

describe("stallStatus (C2c-stall)", () => {
  it("fewer than 7 -> not evaluated, needs the rest", () => {
    const r = stallStatus(mk([100, 100, 100, 100, 100, 100]));
    expect(r.status).toBe("not_evaluated");
    expect(r.sessionsNeeded).toBe(1);
  });
  it("Case 1: six flat sessions are not a stall", () => {
    const v = [
      top(100, 6),
      top(100, 5),
      top(102.5, 5),
      top(100, 6),
      top(100, 5),
      top(102.5, 5),
    ];
    expect(stallStatus(mk(v)).status).toBe("not_evaluated");
  });
  it("a seventh flat session is a stall (Case 1 continuation)", () => {
    const v = [
      top(100, 6),
      top(100, 5),
      top(102.5, 5),
      top(100, 6),
      top(100, 5),
      top(102.5, 5),
      top(100, 5),
    ];
    expect(stallStatus(mk(v)).status).toBe("stalled");
  });
  it("Case 7: steady small gains are progress", () => {
    const v = [100, 100, 102, 102, 104, 104, 106, 106].map((k) => top(k, 5));
    expect(stallStatus(mk(v)).status).toBe("progressing");
  });
  it("a tiny new best matched later counts (+0.1%)", () => {
    expect(
      stallStatus(mk([100, 100, 100, 100, 100.6, 100.6, 100.6])).status,
    ).toBe("progressing");
  });
  it("Case 8: an unmatched spike is a stall", () => {
    const v = [120, 120, 120, 120, top(100, 6), 120, 120, 120];
    expect(stallStatus(mk(v)).status).toBe("stalled");
  });
  it("a spike matched in a later session is progress", () => {
    expect(stallStatus(mk([100, 100, 100, 110, 100, 110, 100])).status).toBe(
      "progressing",
    );
  });
  it("a new best only in the latest session is pending", () => {
    expect(stallStatus(mk([100, 100, 100, 100, 100, 100, 105])).status).toBe(
      "pending",
    );
  });
  it("compares at 0.5 kg display precision", () => {
    expect(
      stallStatus(mk([100.2, 100, 100, 100, 100, 100.4, 100])).status,
    ).toBe("stalled");
  });
  it("Case 16: stall + 13% drop on the same session is a stall (no load-drop state)", () => {
    const v = [124.14, 124.14, 120, 120, 124.14, 124.14, 108];
    const s = liftStatus(mk(v, 3));
    expect(s.stall.status).toBe("stalled");
    expect(s.drop.kind).toBe("drop");
    expect(s.state).toBe("stalled");
    expect(s.drop.pctVsMedian as number).toBeCloseTo(-13.0, 0);
  });
});

describe("singleSessionDrop (C2c-drop / C2c-noise)", () => {
  it("Case 2: 5.6% below median is a bad day inside the noise band", () => {
    const r = singleSessionDrop(mk([120, 123, 124.14, top(100, 4)]));
    expect(r.kind).toBe("bad_day");
    expect(r.pctVsMedian as number).toBeCloseTo(-5.6, 1);
  });
  it("91 vs median 100 is a drop; 95 a bad day; exactly 90.0 a bad day (strict >10%)", () => {
    expect(
      singleSessionDrop(mk([100, 100, 100, 100, 100, 100, 100, 89])).kind,
    ).toBe("drop");
    expect(singleSessionDrop(mk([100, 100, 100, 95])).kind).toBe("bad_day");
    expect(singleSessionDrop(mk([100, 100, 100, 90])).kind).toBe("bad_day");
    expect(singleSessionDrop(mk([100, 100, 100, 89.9])).kind).toBe("drop");
  });
  it("fewer than 3 prior sessions -> not judged, reports needed", () => {
    const r = singleSessionDrop(mk([100, 100, 80]));
    expect(r.kind).toBe("none");
    expect(r.needed).toBe(1);
  });
  it("uses only the previous 6 for the median", () => {
    // older 50s must not drag the median down
    const r = singleSessionDrop(
      mk([50, 50, 50, 100, 100, 100, 100, 100, 100, 85]),
    );
    expect(r.baselineMedian).toBe(100);
    expect(r.kind).toBe("drop");
  });
});

describe("break and target-change reset (C2c-reset)", () => {
  it("a 15-day gap starts a new window; no stall can be called across it", () => {
    const a = mk([100, 100, 100], 3);
    const b = mk([100, 100, 100, 100], 3).map((s, i) => ({
      ...s,
      sessionId: `b${i}`,
      at: a[2].at + 15 * DAY + i * 3 * DAY,
    }));
    const { window, reset } = windowAfterBreak([...a, ...b]);
    expect(reset).toBe("break");
    expect(window).toHaveLength(4);
    expect(window[0].sessionId).toBe("b0");
    expect(liftStatus([...a, ...b]).stall.status).toBe("not_evaluated");
  });
  it("Case 10: 21-day gap resets, so no drop vs the old median", () => {
    const old = mk([120, 120, 120, 120, 120, 120], 3.5);
    const back = {
      sessionId: "back",
      at: old[5].at + 21 * DAY,
      e1rm: top(85, 6),
    };
    const s = liftStatus([...old, back]);
    expect(s.state).toBe("restart");
    expect(s.drop.kind).toBe("none");
  });
  it("a gap of exactly 14 days resets; 13 does not", () => {
    const base = mk([100, 100, 100, 100]);
    const last = base[3];
    expect(
      windowAfterBreak([
        ...base,
        { sessionId: "x", at: last.at + 14 * DAY, e1rm: 100 },
      ]).window,
    ).toHaveLength(1);
    expect(
      windowAfterBreak([
        ...base,
        { sessionId: "x", at: last.at + 13 * DAY, e1rm: 100 },
      ]).window,
    ).toHaveLength(5);
  });
  it("a rep-range or equipment change starts a new window", () => {
    const a = mk([100, 100, 100]).map((s) => ({ ...s, repRangeKey: "5-8" }));
    const b = mk([100, 100]).map((s, i) => ({
      ...s,
      sessionId: `n${i}`,
      at: a[2].at + (i + 1) * 3 * DAY,
      repRangeKey: "4-6",
    }));
    const r = windowAfterBreak([...a, ...b]);
    expect(r.reset).toBe("target_change");
    expect(r.window).toHaveLength(2);
  });
  it("sessions failing the effort check are skipped and the window extends back", () => {
    const s = mk([100, 100, 100, 100, 100, 100, 100, 100]);
    s[3].effortOk = false;
    expect(comparableSessions(s)).toHaveLength(7);
    expect(liftStatus(s).stall.status).toBe("stalled");
  });
});

describe("effortCheck", () => {
  it("within 1 of either end of a range passes (0-2 passes a 0-1 plan)", () => {
    expect(effortCheck([{ rirMid: 2 }], { rirMin: 0, rirMax: 1 })).toBe(true);
    expect(effortCheck([{ rirMid: 3 }], { rirMin: 0, rirMax: 1 })).toBe(false);
    expect(
      effortCheck([{ rirMid: 2 }, { rirMid: 2 }], { rirMin: 2, rirMax: 2 }),
    ).toBe(true);
    expect(effortCheck([{ rirMid: 4 }], { rirMin: 2, rirMax: 2 })).toBe(false);
  });
  it("no plan or no logged RIR passes (degraded mode)", () => {
    expect(effortCheck([{ rirMid: 5 }], null)).toBe(true);
    expect(effortCheck([{ rirMid: null }], { rirMin: 2, rirMax: 2 })).toBe(
      true,
    );
  });
});

describe("liftStatus", () => {
  it("insufficient under 7", () => {
    expect(liftStatus(mk([100, 100, 100])).state).toBe("insufficient");
  });
  it("within-noise flag is neutral inside 10%", () => {
    const s = liftStatus(mk([100, 100, 100, 95]));
    expect(s.withinNoise).toBe(true);
    expect(s.beta).toBe(true);
  });
  it("dropped when a drop happens without a stall verdict", () => {
    expect(liftStatus(mk([100, 100, 100, 80])).state).toBe("dropped");
  });
});
