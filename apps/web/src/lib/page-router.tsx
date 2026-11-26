import {
  type ReactNode,
  startTransition,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { Router, UNSAFE_createBrowserHistory } from "react-router";
import { type NavKind, navKind } from "./nav-kind";

// Page-to-page transitions (docs/DECISIONS.md 2026-11-25, page transitions).
// BrowserRouter, plus every route change runs inside a View Transition: the
// browser snapshots the old page, React commits the new one, then CSS
// (styles/page-transitions.css) slides or cross-fades the two snapshots.
// Snapshots are images, so a heavy screen never renders twice and nothing
// unmounts late. Skipped (plain cut, the old behaviour) when:
//   - the browser has no View Transitions (useRouteFade's fade covers it),
//   - prefers-reduced-motion is set,
//   - the browser already animated the move itself (iOS edge-swipe back:
//     PopStateEvent.hasUAVisualTransition), so it never animates twice,
//   - the change is a replace or query-only (redirects, ?s= segments).

type BrowserHistory = ReturnType<typeof UNSAFE_createBrowserHistory>;
type Update = Parameters<Parameters<BrowserHistory["listen"]>[0]>[0];

/** How long a transition may wait on a route chunk before capturing anyway. */
const COMMIT_TIMEOUT_MS = 1000;

let uaAnimatedPop = false;
if (typeof window !== "undefined") {
  // Capture phase on window runs before history's own popstate listener.
  window.addEventListener(
    "popstate",
    (e) => {
      uaAnimatedPop = Boolean(
        (e as PopStateEvent & { hasUAVisualTransition?: boolean })
          .hasUAVisualTransition,
      );
    },
    { capture: true },
  );
}

const canTransition = () =>
  typeof document !== "undefined" &&
  typeof document.startViewTransition === "function" &&
  !window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

let token = 0;

export function PageRouter({ children }: { children: ReactNode }) {
  const historyRef = useRef<BrowserHistory>(null);
  historyRef.current ??= UNSAFE_createBrowserHistory({ v5Compat: true });
  const history = historyRef.current;
  const [state, setState] = useState<Update>({
    action: history.action,
    location: history.location,
    delta: null,
  });
  const commit = useRef<(() => void) | null>(null);
  const current = useRef(state.location.pathname);

  useLayoutEffect(
    () =>
      history.listen((update: Update) => {
        const kind: NavKind = navKind(
          current.current,
          update.location.pathname,
          update.action,
          update.delta,
        );
        current.current = update.location.pathname;
        const uaAnimated = update.action === "POP" && uaAnimatedPop;
        uaAnimatedPop = false;
        // No transition of its own, or a redirect while one is waiting to
        // capture: just render (a pending transition captures the result).
        if (!kind || uaAnimated || !canTransition() || commit.current) {
          startTransition(() => setState(update));
          return;
        }
        const mine = ++token;
        const root = document.documentElement;
        root.dataset.nav = kind;
        const vt = document.startViewTransition(
          () =>
            new Promise<void>((resolve) => {
              commit.current?.(); // a superseded navigation never hangs
              const timer = setTimeout(resolve, COMMIT_TIMEOUT_MS);
              commit.current = () => {
                clearTimeout(timer);
                commit.current = null;
                resolve();
              };
              // A transition keeps the old page up while a route chunk
              // loads, so the new snapshot is never the Suspense blank.
              startTransition(() => setState(update));
            }),
        );
        vt.ready.catch(() => {}); // skipped by a newer navigation: fine
        vt.finished.finally(() => {
          if (token === mine) delete root.dataset.nav;
        });
      }),
    [history],
  );

  // The new page has committed (children's layout effects, incl. the shell's
  // scroll reset, already ran): let the transition capture it, one task later
  // so a redirect route's <Navigate replace> (a passive effect) lands inside
  // the same transition instead of being captured as a blank page.
  // biome-ignore lint/correctness/useExhaustiveDependencies: fires per location
  useLayoutEffect(() => {
    if (!commit.current) return;
    const id = setTimeout(() => commit.current?.(), 0);
    return () => clearTimeout(id);
  }, [state.location]);

  return (
    <Router
      location={state.location}
      navigationType={state.action}
      navigator={history}
    >
      {children}
    </Router>
  );
}
