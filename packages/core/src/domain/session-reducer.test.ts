import { describe, expect, it } from "vitest";
import { type DraftState, ghostFor, reducer } from "./session-reducer";

describe("session reducer", () => {
  it("adds and edits sets", () => {
    let s = reducer({ sets: [] }, { type: "addSet" });
    s = reducer(s, {
      type: "editSet",
      index: 0,
      patch: { weightKg: 100, reps: 8 },
    });
    expect(s.sets[0]).toEqual({ weightKg: 100, reps: 8 });
  });
  it("removes a set", () => {
    let s: DraftState = {
      sets: [
        { weightKg: 100, reps: 8 },
        { weightKg: 100, reps: 7 },
      ],
    };
    s = reducer(s, { type: "removeSet", index: 0 });
    expect(s.sets).toEqual([{ weightKg: 100, reps: 7 }]);
  });
  it("ghostFor returns the prior session's value at that index", () => {
    const prev = [
      { weightKg: 85, reps: 9 },
      { weightKg: 85, reps: 8 },
    ];
    expect(ghostFor(prev, 1)).toEqual({ weightKg: 85, reps: 8 });
    expect(ghostFor(prev, 5)).toEqual({ weightKg: 85, reps: 8 }); // clamps to last
    expect(ghostFor([], 0)).toEqual({ weightKg: null, reps: null });
  });
});
