import { describe, expect, it } from "vitest";
import { afterLog, hasOpenSet, offeredSets, plannedSetCount } from "./log-nav";

describe("afterLog", () => {
  it("stays on the exercise while planned sets remain", () => {
    expect(
      afterLog({
        committedAfter: 1,
        planned: 3,
        added: 0,
        hasNextExercise: true,
      }),
    ).toBe("next-set");
    expect(
      afterLog({
        committedAfter: 2,
        planned: 3,
        added: 0,
        hasNextExercise: true,
      }),
    ).toBe("next-set");
  });

  it("moves to the next exercise after the last planned set", () => {
    expect(
      afterLog({
        committedAfter: 3,
        planned: 3,
        added: 0,
        hasNextExercise: true,
      }),
    ).toBe("next-exercise");
  });

  it("stays on the last exercise when nothing follows", () => {
    expect(
      afterLog({
        committedAfter: 3,
        planned: 3,
        added: 0,
        hasNextExercise: false,
      }),
    ).toBe("stay");
  });

  it("counts a set added with Add a set as planned", () => {
    expect(
      afterLog({
        committedAfter: 3,
        planned: 3,
        added: 1,
        hasNextExercise: true,
      }),
    ).toBe("next-set");
    expect(
      afterLog({
        committedAfter: 4,
        planned: 3,
        added: 1,
        hasNextExercise: true,
      }),
    ).toBe("next-exercise");
  });

  it("an unplanned exercise offers exactly one set", () => {
    expect(plannedSetCount(0)).toBe(1);
    expect(plannedSetCount(4)).toBe(4);
    expect(
      afterLog({
        committedAfter: 1,
        planned: plannedSetCount(0),
        added: 0,
        hasNextExercise: true,
      }),
    ).toBe("next-exercise");
  });
});

describe("no auto-created set", () => {
  it("has no open set once every offered set is logged", () => {
    expect(hasOpenSet({ planned: 2, added: 0, committed: 2 })).toBe(false);
    expect(hasOpenSet({ planned: 2, added: 0, committed: 1 })).toBe(true);
  });

  it("only Add a set opens another", () => {
    expect(hasOpenSet({ planned: 2, added: 1, committed: 2 })).toBe(true);
    expect(hasOpenSet({ planned: 2, added: 1, committed: 3 })).toBe(false);
  });

  it("never offers fewer sets than are already logged", () => {
    expect(offeredSets({ planned: 2, added: 0, committed: 5 })).toBe(5);
    expect(offeredSets({ planned: 2, added: 1, committed: 1 })).toBe(3);
  });
});
