import { type ComponentType, lazy } from "react";

// Once per tab: a stale-chunk reload already happened, so don't do it again.
const RELOAD_GUARD = "frog.stale-chunk-reloaded";

function claimReload(): boolean {
  try {
    if (sessionStorage.getItem(RELOAD_GUARD)) return false;
    sessionStorage.setItem(RELOAD_GUARD, "1");
    return true;
  } catch {
    // No sessionStorage (Safari private mode) means no guard, and an
    // unguarded reload can loop forever. Fail to the error card instead.
    return false;
  }
}

/**
 * `lazy()` for a route, hardened against a chunk that no longer exists.
 *
 * A hashed chunk from a superseded deploy is a real 404 — the host (`wrangler.jsonc` +
 * `worker/index.ts`) keeps `/assets/` out of the SPA fallback — so a tab or installed PWA left open
 * across a release fails every route import from then on, and React's answer
 * to that is to unmount the app. Retry once (clears a transient blip), then
 * reload the document exactly once per tab, which fetches the new index.html
 * and with it the live chunk names. When the guard is already spent the error
 * falls through to <AppErrorBoundary>, which offers the reload as a button
 * rather than a blank screen. docs/DECISIONS.md 2026-08-25.
 *
 * The two dev-only lazies further down stay on bare `lazy()`: they never ship,
 * and their dead-branch shape is what scripts/check-bundle.ts gates.
 */
export function lazyRoute<T extends ComponentType>(
  load: () => Promise<{ default: T }>,
) {
  return lazy(async () => {
    try {
      return await load();
    } catch {
      try {
        return await load();
      } catch (retryError) {
        if (!claimReload()) throw retryError;
        window.location.reload();
        // The document is being replaced — never resolve, so Suspense holds
        // its fallback instead of flashing the error card on the way out.
        return new Promise<{ default: T }>(() => {});
      }
    }
  });
}
