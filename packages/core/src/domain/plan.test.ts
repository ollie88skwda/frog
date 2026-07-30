import { describe, expect, it } from "vitest";
import {
  lastPerformedByRoutine,
  type PlanRoutine,
  suggestRoutineId,
} from "./plan";

const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date(2026, 6, 30, 9, 0, 0).getTime();

const FOLDER = "folder-ppl";
const PROGRAM: PlanRoutine[] = [
  { id: "push", folderId: FOLDER },
  { id: "pull", folderId: FOLDER },
  { id: "legs", folderId: FOLDER },
];
const LOOSE: PlanRoutine[] = [
  { id: "a", folderId: null },
  { id: "b", folderId: null },
  { id: "c", folderId: null },
];

describe("lastPerformedByRoutine", () => {
  it("keeps the newest completion per routine", () => {
    const map = lastPerformedByRoutine([
      { routineId: "push", endedAt: NOW - 5 * DAY },
      { routineId: "push", endedAt: NOW - DAY },
      { routineId: "pull", endedAt: NOW - 3 * DAY },
    ]);
    expect(map.get("push")).toBe(NOW - DAY);
    expect(map.get("pull")).toBe(NOW - 3 * DAY);
    expect(map.size).toBe(2);
  });

  it("ignores empty workouts and unfinished sessions", () => {
    // An abandoned session must not mark a routine done — that would skip it.
    const map = lastPerformedByRoutine([
      { routineId: null, endedAt: NOW },
      { routineId: "push", endedAt: null },
    ]);
    expect(map.size).toBe(0);
  });
});

describe("suggestRoutineId — active program", () => {
  it("never started → day one, in the author's order", () => {
    expect(suggestRoutineId(PROGRAM, new Map(), FOLDER)).toBe("push");
  });

  it("walks the split as each day is completed", () => {
    const last = new Map([["push", NOW - DAY]]);
    expect(suggestRoutineId(PROGRAM, last, FOLDER)).toBe("pull");
    last.set("pull", NOW);
    expect(suggestRoutineId(PROGRAM, last, FOLDER)).toBe("legs");
  });

  it("comes round again after a full cycle", () => {
    const last = new Map([
      ["push", NOW - 3 * DAY],
      ["pull", NOW - 2 * DAY],
      ["legs", NOW - DAY],
    ]);
    expect(suggestRoutineId(PROGRAM, last, FOLDER)).toBe("push");
  });

  it("catches up a skipped day rather than burying it", () => {
    const last = new Map([
      ["legs", NOW - 20 * DAY],
      ["pull", NOW - 4 * DAY],
      ["push", NOW - DAY],
    ]);
    expect(suggestRoutineId(PROGRAM, last, FOLDER)).toBe("legs");
  });

  it("ignores routines outside the program's folder", () => {
    const routines = [...PROGRAM, { id: "extra", folderId: null }];
    const last = new Map([
      ["push", NOW - 3 * DAY],
      ["pull", NOW - 2 * DAY],
      ["legs", NOW - DAY],
      ["extra", NOW - 900 * DAY],
    ]);
    expect(suggestRoutineId(routines, last, FOLDER)).toBe("push");
  });

  it("falls back to the whole shelf when the program folder is empty", () => {
    // A program whose routines were all deleted must not suggest nothing.
    const last = new Map([["a", NOW - DAY]]);
    expect(suggestRoutineId(LOOSE, last, "some-empty-folder")).toBe("b");
  });
});

describe("suggestRoutineId — loose routines", () => {
  it("prefers one that has never been run", () => {
    const last = new Map([
      ["a", NOW - DAY],
      ["c", NOW - 30 * DAY],
    ]);
    expect(suggestRoutineId(LOOSE, last, null)).toBe("b");
  });

  it("otherwise picks the longest-neglected", () => {
    const last = new Map([
      ["a", NOW - DAY],
      ["b", NOW - 2 * DAY],
      ["c", NOW - 11 * DAY],
    ]);
    expect(suggestRoutineId(LOOSE, last, null)).toBe("c");
  });

  it("breaks ties on display order", () => {
    const last = new Map([
      ["a", NOW - 5 * DAY],
      ["b", NOW - 5 * DAY],
      ["c", NOW - 5 * DAY],
    ]);
    expect(suggestRoutineId(LOOSE, last, null)).toBe("a");
  });

  it("nothing pre-saved → null", () => {
    expect(suggestRoutineId([], new Map(), null)).toBe(null);
    expect(suggestRoutineId([], new Map(), FOLDER)).toBe(null);
  });
});
