import { describe, expect, it } from "vitest";
import { OFFLINE_MESSAGE, userFacingRepoError } from "./repo-error";

describe("userFacingRepoError", () => {
  // The exact strings each engine produces for a rejected fetch, as
  // postgrest-js re-emits them ("<constructor name>: <message>").
  it.each([
    "TypeError: Failed to fetch", // Chromium
    "TypeError: Load failed", // WebKit / iOS Safari
    "TypeError: NetworkError when attempting to fetch resource.", // Firefox
    "FetchError: request failed",
    "AbortError: The operation was aborted.",
  ])("replaces the transport failure %j", (raw) => {
    expect(userFacingRepoError(new Error(raw))).toBe(OFFLINE_MESSAGE);
  });

  it("never shows the words TypeError to the user", () => {
    expect(
      userFacingRepoError(new Error("TypeError: Load failed")),
    ).not.toMatch(/TypeError/);
  });

  it.each([
    "permission denied for table sessions",
    'new row violates row-level security policy for table "sessions"',
    "JSON object requested, multiple (or no) rows returned",
  ])("passes a real PostgREST message through: %j", (raw) => {
    expect(userFacingRepoError(new Error(raw))).toBe(raw);
  });

  it("stringifies a non-Error throw", () => {
    expect(userFacingRepoError("boom")).toBe("boom");
  });
});
