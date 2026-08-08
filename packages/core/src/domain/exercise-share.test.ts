import { describe, expect, it } from "vitest";
import { COMMUNITY_SHARING } from "../config";
import { resolveExerciseShare } from "./exercise-share";

// The one publish-vs-private rule (docs/DECISIONS.md 2026-08-08): the repo,
// the optimistic row and the create form must agree on what publishes, or a
// machine-linked / media-bearing create silently loses those fields.

describe("resolveExerciseShare", () => {
  it("publishes a plain create while COMMUNITY_SHARING is on", () => {
    expect(resolveExerciseShare(undefined)).toBe(COMMUNITY_SHARING);
    expect(resolveExerciseShare({})).toBe(COMMUNITY_SHARING);
  });

  it("stays private when share: false is passed (every fork path)", () => {
    expect(resolveExerciseShare({ share: false })).toBe(false);
    expect(resolveExerciseShare({ share: false, machineId: "m1" })).toBe(false);
  });

  it("forces a machine-linked create private — the RPC whitelist has no machine_id", () => {
    expect(resolveExerciseShare({ machineId: "m1" })).toBe(false);
    expect(resolveExerciseShare({ machineId: "m1", share: true })).toBe(false);
  });
});
