// Turns an error thrown by the Repo into something a user can act on.
//
// A PostgREST call that never reached the server comes back from postgrest-js
// with its message prefixed by the rejected fetch's own error-constructor
// name — "TypeError: Failed to fetch" (Chromium), "TypeError: Load failed"
// (WebKit/iOS), "AbortError: …" on a cancelled request, "FetchError: …" when
// the rejection carried no name. A real PostgREST failure is a sentence
// ("permission denied for table sessions") and never carries that prefix, so
// the prefix alone identifies a transport failure; nothing here depends on
// supabase-js internals. See docs/DECISIONS.md 2026-08-25.
const TRANSPORT_PREFIX =
  /^(?:TypeError|FetchError|AbortError|TimeoutError|NetworkError):\s/;

/** Shown instead of a raw transport exception. */
export const OFFLINE_MESSAGE =
  "Can't reach the server — check your connection and try again.";

/**
 * User-facing text for an error thrown by a `Repo` call. A transport failure
 * becomes plain language; every other message (PostgREST's own, which is
 * already a sentence) passes through unchanged.
 */
export function userFacingRepoError(e: unknown): string {
  const raw = e instanceof Error ? e.message : String(e);
  return TRANSPORT_PREFIX.test(raw) ? OFFLINE_MESSAGE : raw;
}
