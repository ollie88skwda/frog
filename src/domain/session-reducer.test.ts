import { describe, it, expect } from "vitest";
import { reducer, ghostFor, type DraftState } from "./session-reducer";

describe("session reducer", () => {
  it("adds and edits sets", () => {
    let s = reducer({ sets: [] }, { type: "addSet" });
    s = reducer(s, { type: "editSet", index: 0, patch: { weightKg: 100, reps: 8 } });
    expect(s.sets[0]).toEqual({ weightKg: 100, reps: 8 });
  });
  it("removes a set", () => {
    let s: DraftState = { sets: [{ weightKg: 100, reps: 8 }, { weightKg: 100, reps: 7 }] };
    s = reducer(s, { type: "removeSet", index: 0 });
    expect(s.sets).toEqual([{ weightKg: 100, reps: 7 }]);
  });
  it("ghostFor returns the prior session's value at that index", () => {
    const prev = [{ weightKg: 85, reps: 9 }, { weightKg: 85, reps: 8 }];
    expect(ghostFor(prev, 1)).toEqual({ weightKg: 85, reps: 8 });
    expect(ghostFor(prev, 5)).toEqual({ weightKg: 85, reps: 8 }); // clamps to last
    expect(ghostFor([], 0)).toEqual({ weightKg: null, reps: null });
  });

  it("setMetricValue stores a metric value on the correct set", () => {
    let s = reducer({ sets: [] }, { type: "addSet" });
    s = reducer(s, { type: "addSet" });
    s = reducer(s, { type: "setMetricValue", index: 0, metricId: "m-rir", value: 2 });
    expect(s.sets[0].metricValues).toEqual({ "m-rir": 2 });
    expect(s.sets[1].metricValues).toBeUndefined();
  });

  it("setMetricValue merges multiple metrics on the same set", () => {
    let s = reducer({ sets: [{ weightKg: 100, reps: 8 }] }, { type: "setMetricValue", index: 0, metricId: "m-rir", value: 1 });
    s = reducer(s, { type: "setMetricValue", index: 0, metricId: "m-form", value: 8 });
    expect(s.sets[0].metricValues).toEqual({ "m-rir": 1, "m-form": 8 });
  });

  it("setMetricValue overwrites a previously set metric", () => {
    let s = reducer({ sets: [{ weightKg: 100, reps: 8, metricValues: { "m-rir": 2 } }] },
      { type: "setMetricValue", index: 0, metricId: "m-rir", value: 0 });
    expect(s.sets[0].metricValues!["m-rir"]).toBe(0);
  });

  it("setMetricValue does not mutate other sets", () => {
    const initial: DraftState = {
      sets: [{ weightKg: 80, reps: 10 }, { weightKg: 80, reps: 9 }],
    };
    const next = reducer(initial, { type: "setMetricValue", index: 0, metricId: "m-form", value: 7 });
    expect(next.sets[1].metricValues).toBeUndefined();
    expect(initial.sets[0].metricValues).toBeUndefined(); // original not mutated
  });
});
