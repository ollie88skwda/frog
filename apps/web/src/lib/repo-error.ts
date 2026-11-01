// Turns an error thrown by the Repo into something a user can act on.
//
// A Convex call that never reached the server comes back from the transport
// (packages/core/src/repo/convex-http.ts) with its message prefixed by the
// rejected fetch's own error-constructor name — "TypeError: Failed to fetch"
// (Chromium), "TypeError: Load failed" (WebKit/iOS), "AbortError: …" on a
// cancelled request, "FetchError: …" when the rejection carried no name. A
// real server failure is a sentence (a function's thrown message, e.g. "Not
// signed in") and never carries that prefix, so the prefix alone identifies a
// transport failure. See docs/DECISIONS.md 2026-08-25 and 2026-11-01.
const TRANSPORT_PREFIX =
  /^(?:TypeError|FetchError|AbortError|TimeoutError|NetworkError):\s/;

/** Shown instead of a raw transport exception. */
export const OFFLINE_MESSAGE =
  "Can't reach the server — check your connection and try again.";

/**
 * User-facing text for an error thrown by a `Repo` call. A transport failure
 * becomes plain language; every other message (the server's own, which is
 * already a sentence) passes through unchanged.
 */
export function userFacingRepoError(e: unknown): string {
  const raw = e instanceof Error ? e.message : String(e);
  return TRANSPORT_PREFIX.test(raw) ? OFFLINE_MESSAGE : raw;
}
