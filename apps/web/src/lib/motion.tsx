import {
  AnimatePresence,
  LayoutGroup,
  LazyMotion,
  MotionConfig,
  m,
  type Transition,
  useReducedMotion,
} from "motion/react";
import {
  type ReactNode,
  type RefObject,
  useLayoutEffect,
  useRef,
  useSyncExternalStore,
} from "react";

// App-wide motion (docs/DECISIONS.md 2026-11-23, retuned 2026-11-25). One
// scale, mirrored in theme.css: FAST 150 ms (exits, small state changes) and
// BASE 200 ms (entrances, sheets, disclosures, pills), all on the one `--ease`
// curve. Tweens, not springs: a no-bounce spring's settle tail kept sheets and
// pills creeping for ~450 ms after they looked done. Nothing delays input. Components use the
// lightweight `m.*` elements; the animation engine (domMax) arrives in a lazy
// chunk. Until it has loaded, `useMotionReady()` is false and callers pass
// `initial={false}`, so everything renders in its final state: a failed or slow
// chunk can never leave a screen or a dialog stuck invisible.

export { AnimatePresence, LayoutGroup, m, useReducedMotion };

/** The Because `--ease` curve (theme.css): fast start, soft landing. */
export const EASE_OUT = [0.2, 0, 0, 1] as const;
/** Exits get out of the way a little faster than entrances arrive. */
export const EASE_IN = [0.4, 0, 1, 1] as const;

/**
 * The duration scale, in seconds (theme.css `--dur-fast` / `--dur-base`).
 * Page transitions (styles/page-transitions.css) use the same two: push/back
 * slides BASE, tab cross-fades FAST.
 */
export const DUR_FAST = 0.15;
export const DUR_BASE = 0.2;

/** Sheets, dialogs, disclosures and sliding pills: arrive and stop, no tail. */
export const SLIDE: Transition = { duration: DUR_BASE, ease: EASE_OUT };
export const FADE_IN: Transition = { duration: DUR_BASE, ease: EASE_OUT };
export const FADE_OUT: Transition = { duration: DUR_FAST, ease: EASE_IN };

/**
 * Content swaps (route sections, Plan/Progress segments) settle from half
 * opacity instead of from blank: a fade from 0 read as the screen flashing
 * white on every tab tap, even when the content was already cached.
 */
const SETTLE_FROM = 0.5;

/**
 * Height disclosure states. Overflow is clipped only while the height moves,
 * so a focus ring or a popover inside the open section is never cut off.
 */
export const COLLAPSED = { height: 0, opacity: 0, overflow: "hidden" } as const;
export const EXPANDED = {
  height: "auto",
  opacity: 1,
  overflow: "hidden",
  transition: SLIDE,
  transitionEnd: { overflow: "visible" },
} as const;

let ready = false;
const listeners = new Set<() => void>();

async function loadFeatures() {
  const load = () => import("./motion-features");
  // One retry, like lazyRoute: a transient blip shouldn't cost the session
  // its motion. A real failure leaves `ready` false and the app static.
  const mod = await load().catch(load);
  ready = true;
  for (const fn of listeners) fn();
  return mod.default;
}

function subscribe(fn: () => void) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

/** True once the animation engine has loaded; until then render final states. */
export function useMotionReady(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => ready,
    () => false,
  );
}

export function MotionProvider({ children }: { children: ReactNode }) {
  return (
    // strict: a full `motion.*` component would pull the whole engine into the
    // eager chunk; use `m.*` instead.
    <LazyMotion features={loadFeatures} strict>
      {/* "user": honour prefers-reduced-motion (transforms and layout moves
          are skipped, opacity fades stay). */}
      <MotionConfig reducedMotion="user" transition={FADE_IN}>
        {children}
      </MotionConfig>
    </LazyMotion>
  );
}

/**
 * Height + fade disclosure for an expanding card section ("See lifts", "More
 * templates"). Renders nothing when closed, exactly like `{open && ...}`.
 */
export function Collapse({
  open,
  children,
  className,
}: {
  open: boolean;
  children: ReactNode;
  className?: string;
}) {
  const motionReady = useMotionReady();
  return (
    <AnimatePresence initial={false}>
      {open && (
        <m.div
          key="collapse"
          className={className}
          initial={motionReady ? COLLAPSED : false}
          animate={EXPANDED}
          exit={{ ...COLLAPSED, transition: FADE_OUT }}
        >
          {children}
        </m.div>
      )}
    </AnimatePresence>
  );
}

/**
 * Segment swap (Plan / Progress `?s=`): the new segment's content settles in
 * from half opacity over 150 ms. Opacity only (a transform would re-anchor fixed children) and
 * no exit, so the old content leaves at once and input is never delayed.
 */
export function FadeSwap({
  swapKey,
  children,
}: {
  swapKey: string;
  children: ReactNode;
}) {
  const motionReady = useMotionReady();
  const first = useRef(swapKey);
  return (
    <m.div
      key={swapKey}
      initial={
        motionReady && swapKey !== first.current
          ? { opacity: SETTLE_FROM }
          : false
      }
      animate={{ opacity: 1 }}
      transition={{ duration: DUR_FAST, ease: EASE_OUT }}
    >
      {children}
    </m.div>
  );
}

const hasViewTransitions = () =>
  typeof document.startViewTransition === "function";

const reducedMotion = () =>
  window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;

/**
 * Route change: a 150 ms settle (half opacity to full) of the page container when the top-level
 * section changes (`/plan` -> `/progress`, `/` -> `/session/...`). Driven
 * imperatively rather than by keying the outlet, so a same-screen navigation
 * (`/routines/new` -> `/routines/:id/edit` after a save) never remounts the
 * screen or loses its state. Opacity only, never a transform: a transformed
 * ancestor would re-anchor every position:fixed child for the fade's length.
 *
 * Fallback only: where the browser has View Transitions, `PageRouter`
 * (lib/page-router.tsx) slides or cross-fades every route change instead, and
 * this fade would play over its live new-page image.
 */
export function useRouteFade(
  ref: RefObject<HTMLElement | null>,
  pathname: string,
) {
  const section = pathname.split("/")[1] ?? "";
  const prev = useRef(section);
  useLayoutEffect(() => {
    if (prev.current === section) return;
    prev.current = section;
    const el = ref.current;
    if (!el?.animate || reducedMotion() || hasViewTransitions()) return;
    el.animate([{ opacity: SETTLE_FROM }, { opacity: 1 }], {
      duration: DUR_FAST * 1000,
      easing: `cubic-bezier(${EASE_OUT.join(", ")})`,
    });
  }, [ref, section]);
}
