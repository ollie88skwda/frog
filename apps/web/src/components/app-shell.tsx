import { APP_NAME } from "@frog/core";
import {
  Barbell,
  ChartLineUp,
  ClipboardText,
  Moon,
  Play,
  Sun,
  User,
} from "@phosphor-icons/react";
import {
  lazy,
  type RefObject,
  Suspense,
  useLayoutEffect,
  useMemo,
  useRef,
} from "react";
import { NavLink, Outlet, useLocation, useNavigationType } from "react-router";
import { FrogMark } from "@/components/frog-mark";
import { IconButton } from "@/components/ui/icon-button";
import { useChangelogHasUnseen } from "@/lib/changelog-prefs";
import { m, SLIDE, useReducedMotion, useRouteFade } from "@/lib/motion";
import { useActiveSession } from "@/lib/queries";
import { useTheme } from "@/lib/theme";
import { cn } from "@/lib/utils";

// Lazy: cmdk + the palette stay out of the eager chunk (220 kB gz gate); the
// chunk loads in the background right after mount, so first ⌘K is instant.
const CommandPalette = lazy(() =>
  import("./command-palette").then((m) => ({ default: m.CommandPalette })),
);

// Four tabs (redesign §7). Labels are always visible; the workout is a
// full-screen takeover with the tab bar hidden.
const NAV = [
  { to: "/", label: "Today", icon: Barbell, end: true, key: null },
  { to: "/plan", label: "Plan", icon: ClipboardText, key: null },
  { to: "/progress", label: "Progress", icon: ChartLineUp, key: null },
  { to: "/you", label: "You", icon: User, key: null },
];

export function AppShell() {
  const { theme, toggle } = useTheme();
  const { data: active } = useActiveSession();
  const { pathname, key } = useLocation();
  const navType = useNavigationType();
  const mainRef = useRef<HTMLElement>(null);
  useRouteFade(mainRef, pathname);
  usePageScroll(mainRef, pathname, key, navType);
  // Changelog lives inside Profile → Settings, so its unseen-entry dot
  // surfaces on the Profile nav item instead.
  const hasUnseenChangelog = useChangelogHasUnseen();

  const inSession = pathname.startsWith("/session/");
  // Resume pill: "jump into the live session" lives above the tab bar now.
  // Today already carries a Resume button in its hero, so the pill skips it.
  const showResume = active != null && !inSession && pathname !== "/";
  const nav = useMemo(
    () =>
      NAV.map((item) => ({
        ...item,
        // Changelog lives under You, so its unseen dot surfaces there.
        badge: item.to === "/you" && hasUnseenChangelog,
        // A live session keeps Today lit (it is Today's takeover).
        active: item.to === "/" && inSession ? true : undefined,
      })),
    [inSession, hasUnseenChangelog],
  );

  return (
    <div className="flex h-dvh">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-sm focus:bg-action focus:px-3 focus:py-2 focus:text-sm focus:font-semibold focus:text-on-action"
      >
        Skip to content
      </a>
      <aside className="flex w-56 shrink-0 flex-col bg-sidebar max-md:hidden">
        <div className="flex h-12 items-center justify-between px-3">
          <span className="flex min-w-0 items-center gap-2">
            {/* Frog mark — quiet chrome, never the expressive mascot. */}
            <FrogMark className="size-5" />
            <span className="truncate text-sm font-medium">{APP_NAME}</span>
          </span>
          <IconButton
            onClick={toggle}
            title="Toggle theme"
            aria-label="Toggle theme"
          >
            {theme === "night" ? (
              <Sun className="size-4" />
            ) : (
              <Moon className="size-4" />
            )}
          </IconButton>
        </div>

        <p className="px-4 pt-2 pb-1 text-2xs font-medium tracking-widest text-faint uppercase">
          Workspace
        </p>
        <nav className="flex flex-col gap-1 px-2">
          {nav.map(
            ({
              to,
              label,
              icon: Icon,
              end,
              key,
              active: forceActive,
              badge,
            }) => (
              <NavLink
                key={label}
                to={to}
                end={end}
                className={({ isActive }) =>
                  cn(
                    "relative flex h-8 items-center gap-2 rounded-sm px-2 text-sm transition-colors duration-150 ease-(--ease-out-quad)",
                    (forceActive ?? isActive)
                      ? "text-ink"
                      : "text-soft hover:bg-surface-hover hover:text-ink",
                  )
                }
              >
                {({ isActive }) => (
                  <>
                    {(forceActive ?? isActive) && (
                      <NavPill
                        id="side-pill"
                        className="rounded-sm bg-surface-active"
                      />
                    )}
                    <span className="relative z-[1] shrink-0">
                      <Icon className="size-4" />
                      {badge && (
                        <span className="absolute top-0 right-0 size-1.5 bg-accent" />
                      )}
                    </span>
                    <span className="relative z-[1] min-w-0 flex-1 truncate">
                      {label}
                    </span>
                    {key && <kbd className="relative z-[1] keycap">{key}</kbd>}
                  </>
                )}
              </NavLink>
            ),
          )}
        </nav>

        <div className="mt-auto flex items-center gap-2 px-4 py-3 text-2xs text-faint">
          <kbd className="keycap">⌘K</kbd>
          <span>for commands</span>
        </div>
      </aside>

      <main
        ref={mainRef}
        id="main"
        tabIndex={-1}
        className={cn(
          // Opaque, so a route transition's page snapshot is never see-through
          // (styles/page-transitions.css names it only while one runs).
          "min-w-0 flex-1 bg-bg outline-none",
          inSession ? "overflow-hidden" : "overflow-y-auto",
          // Clearance for the floating tab bar; the workout hides the bar, so
          // its entry panel sits flush with the bottom edge instead.
          // Clears the tab bar footprint exactly (12px margin + 60px bar); each page's
          // own pb-6 then leaves the standard 24px above it. With the resume pill
          // (44px + 8px above the bar) the clearance grows by 52px.
          !inSession &&
            (showResume
              ? "max-md:pb-[calc(7.75rem+env(safe-area-inset-bottom))]"
              : "max-md:pb-[calc(4.5rem+env(safe-area-inset-bottom))]"),
        )}
      >
        <Outlet />
      </main>

      {/* Floating island tab bar on small screens (mobile-first logging).
          Centered, content-width — it doesn't span the viewport. Sits clear of
          the iOS home indicator via safe-area margin. Every tab shows its
          label; square corners hold the 0px-radius design language. */}
      {showResume && (
        <NavLink
          to={`/session/${active?.id}`}
          data-testid="resume-pill"
          data-vt="resume-pill"
          className="floating fixed inset-x-0 bottom-[calc(5rem+env(safe-area-inset-bottom))] z-40 mx-auto flex h-11 w-fit items-center gap-2 bg-accent px-4 text-sm font-semibold text-on-accent md:hidden"
        >
          <Play className="size-4" weight="fill" /> Resume workout
        </NavLink>
      )}
      <nav
        data-vt="tab-bar"
        className={cn(
          "floating float-in fixed inset-x-0 bottom-0 z-40 mx-auto mb-[calc(0.75rem+env(safe-area-inset-bottom))] flex w-fit items-center gap-2 p-2 md:hidden",
          inSession && "hidden",
        )}
      >
        {nav.map(
          ({ to, label, icon: Icon, end, active: forceActive, badge }) => (
            <NavLink
              key={label}
              to={to}
              end={end}
              title={label}
              className={({ isActive }) =>
                cn(
                  "relative flex h-11 min-w-[4.25rem] flex-col items-center justify-center gap-1 px-2 text-2xs font-medium press duration-150",
                  (forceActive ?? isActive)
                    ? "text-accent-ink"
                    : "text-soft active:text-ink",
                )
              }
            >
              {({ isActive }) => (
                <>
                  {(forceActive ?? isActive) && (
                    <NavPill id="tab-pill" className="bg-accent-soft" />
                  )}
                  <span className="relative z-[1] shrink-0">
                    <Icon className="size-5" />
                    {badge && (
                      <span className="absolute top-0 right-0 size-1.5 bg-accent" />
                    )}
                  </span>
                  <span className="relative z-[1] leading-none whitespace-nowrap">
                    {label}
                  </span>
                </>
              )}
            </NavLink>
          ),
        )}
      </nav>

      <Suspense fallback={null}>
        <CommandPalette />
      </Suspense>
    </div>
  );
}

/**
 * One scroller (`<main>`) serves every page, so without this a new page opened
 * at the old page's scroll offset. A new page (push, tab) starts at the top; a
 * history back/forward returns to where that entry was left, like a native
 * stack. Runs in a layout effect, before the page transition captures the new
 * page, so the slide never jumps mid-flight. Query-only changes (?s=
 * segments) keep their offset.
 */
function usePageScroll(
  ref: RefObject<HTMLElement | null>,
  pathname: string,
  key: string,
  navType: string,
) {
  const saved = useRef(new Map<string, number>());
  const prevPath = useRef(pathname);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onScroll = () => saved.current.set(key, el.scrollTop);
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [ref, key]);
  useLayoutEffect(() => {
    if (prevPath.current === pathname) return;
    prevPath.current = pathname;
    const el = ref.current;
    if (!el) return;
    el.scrollTop = navType === "POP" ? (saved.current.get(key) ?? 0) : 0;
  }, [ref, pathname, key, navType]);
}

/**
 * The active-tab fill. One shared `layoutId` per nav, so switching tabs slides
 * the fill to the new tab instead of blinking it across. A layout move is not
 * covered by MotionConfig's reducedMotion, so reduced motion jumps it here.
 * The tab's icon and label sit at z-[1] so the travelling fill passes under
 * the neighbouring tabs instead of painting over them mid-slide.
 */
function NavPill({ id, className }: { id: string; className: string }) {
  const reduced = useReducedMotion();
  return (
    <m.span
      layoutId={id}
      aria-hidden
      className={cn("absolute inset-0", className)}
      transition={reduced ? { duration: 0 } : SLIDE}
    />
  );
}
