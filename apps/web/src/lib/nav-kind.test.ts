import { describe, expect, it } from "vitest";
import { navKind } from "./nav-kind";

describe("navKind", () => {
  it.each([
    ["/", "/plan", "PUSH", 1, "tab"],
    ["/plan", "/exercises/a", "PUSH", 1, "push"],
    ["/", "/session/x", "PUSH", 1, "push"],
    ["/history/a", "/history", "PUSH", 1, "back"],
    ["/routines/a/edit", "/routines", "PUSH", 1, "back"],
    ["/history", "/import", "PUSH", 1, "tab"],
    ["/exercises/a", "/exercises/b", "PUSH", 1, "push"],
    ["/exercises/a", "/plan", "POP", -1, "back"],
    ["/plan", "/exercises/a", "POP", 1, "push"],
    ["/plan", "/you", "POP", null, "tab"],
    ["/routines", "/plan", "REPLACE", 0, null],
    ["/plan", "/plan", "PUSH", 1, null],
  ] as const)("%s -> %s (%s) is %s", (from, to, action, delta, kind) => {
    expect(navKind(from, to, action, delta)).toBe(kind);
  });
});
