import { APP_NAME } from "@sbl/core";
import { Dumbbell, Home, Moon, Sun, User } from "lucide-react";
import { lazy, Suspense, useMemo } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router";
import frogMark from "@/assets/frog-mark.svg";
import { useHotkeys } from "@/lib/hotkeys";
import { useActiveSession } from "@/lib/queries";
import { useRepo } from "@/lib/repo";
import { useTheme } from "@/lib/theme";
import { cn } from "@/lib/utils";

// Lazy: cmdk + the palette stay out of the eager chunk (220 kB gz gate); the
// chunk loads in the background right after mount, so first ⌘K is instant.
const CommandPalette = lazy(() =>
  import("./command-palette").then((m) => ({ default: m.CommandPalette })),
);

const NAV = [
  { to: "/", label: "Home", icon: Home, end: true, key: null },
  { to: "/train", label: "Training", icon: Dumbbell, key: null },
  { to: "/profile", label: "Profile", icon: User, key: null },
];

/* One stroke weight across the shell — lucide's default 2 reads chunky at UI
 * sizes; 1.75 gives a lighter, more deliberate line. */
const STROKE = 1.75;

export function AppShell() {
  const { theme, toggle } = useTheme();
  const navigate = useNavigate();
  const repo = useRepo();
  const { data: active } = useActiveSession();
  const { pathname } = useLocation();

  // The Training tab jumps straight into the live session when one exists, so
  // you don't have to land on /train and click "Resume". It stays highlighted
  // for both the training landing and any open session.
  const nav = useMemo(
    () =>
      NAV.map((item) =>
        item.to === "/train"
          ? {
              ...item,
              to: active ? `/session/${active.id}` : "/train",
              active: pathname === "/train" || pathname.startsWith("/session/"),
            }
          : { ...item, active: undefined as boolean | undefined },
      ),
    [active, pathname],
  );

  useHotkeys(
    useMemo(
      () => ({
        s: () => {
          void repo
            .startSession()
            .then((session) => navigate(`/session/${session.id}`));
        },
        l: () => navigate("/library"),
        h: () => navigate("/history"),
        f: () => navigate("/findings"),
      }),
      [navigate, repo],
    ),
  );

  return (
    <div className="flex h-dvh">
      <aside className="flex w-56 shrink-0 flex-col border-r border-border bg-surface max-md:hidden">
        <div className="flex h-12 items-center justify-between px-3">
          <span className="flex min-w-0 items-center gap-2">
            {/* Brand mark — the frog character (docs/brand/assets/frog-logo-reference.jpg). */}
            <img
              src={frogMark}
              alt=""
              aria-hidden="true"
              className="h-5 w-auto shrink-0"
            />
            <span className="truncate text-sm font-medium">{APP_NAME}</span>
          </span>
          <button
            type="button"
            onClick={toggle}
            title="Toggle theme"
            className="rounded-md p-1 text-soft transition-colors duration-150 ease-(--ease-out-quad) hover:bg-surface-hover hover:text-ink"
          >
            {theme === "dark" ? (
              <Sun className="size-4" strokeWidth={STROKE} />
            ) : (
              <Moon className="size-4" strokeWidth={STROKE} />
            )}
          </button>
        </div>

        <p className="px-4 pt-2 pb-1 text-2xs font-medium tracking-widest text-faint uppercase">
          Workspace
        </p>
        <nav className="flex flex-col gap-0.5 px-2">
          {nav.map(
            ({ to, label, icon: Icon, end, key, active: forceActive }) => (
              <NavLink
                key={label}
                to={to}
                end={end}
                className={({ isActive }) =>
                  cn(
                    "flex h-8 items-center gap-2 rounded-md px-2 text-sm transition-colors duration-150 ease-(--ease-out-quad)",
                    (forceActive ?? isActive)
                      ? "bg-surface-active text-ink"
                      : "text-soft hover:bg-surface-hover hover:text-ink",
                  )
                }
              >
                <Icon className="size-4 shrink-0" strokeWidth={STROKE} />
                <span className="min-w-0 flex-1 truncate">{label}</span>
                {key && <kbd className="keycap">{key}</kbd>}
              </NavLink>
            ),
          )}
        </nav>

        <div className="mt-auto flex items-center gap-2 px-4 py-3 text-2xs text-faint">
          <kbd className="keycap">⌘K</kbd>
          <span>for commands</span>
        </div>
      </aside>

      <main className="min-w-0 flex-1 overflow-y-auto max-md:pb-[calc(5rem+env(safe-area-inset-bottom))]">
        <Outlet />
      </main>

      {/* Floating island tab bar on small screens (mobile-first logging).
          Centered, content-width — it doesn't span the viewport. Sits clear of
          the iOS home indicator via safe-area margin. Active tab expands to
          reveal its label (the "island" effect); square corners hold the
          0px-radius design language. */}
      <nav className="floating float-in fixed inset-x-0 bottom-0 z-40 mx-auto mb-[calc(0.75rem+env(safe-area-inset-bottom))] flex w-fit items-center gap-0.5 p-1.5 md:hidden">
        {nav.map(({ to, label, icon: Icon, end, active: forceActive }) => (
          <NavLink
            key={label}
            to={to}
            end={end}
            title={label}
            className={({ isActive }) =>
              cn(
                "flex h-11 items-center justify-center gap-1.5 px-3 text-2xs font-medium transition-colors duration-150 ease-(--ease-out-quad)",
                (forceActive ?? isActive)
                  ? "bg-accent-soft text-accent"
                  : "text-soft active:text-ink",
              )
            }
          >
            {({ isActive }) => (
              <>
                <Icon className="size-[22px] shrink-0" strokeWidth={STROKE} />
                <span
                  className={cn(
                    "overflow-hidden leading-none whitespace-nowrap transition-all duration-150 ease-(--ease-out-quad)",
                    (forceActive ?? isActive)
                      ? "max-w-24 opacity-100"
                      : "max-w-0 opacity-0",
                  )}
                >
                  {label}
                </span>
              </>
            )}
          </NavLink>
        ))}
      </nav>

      <Suspense fallback={null}>
        <CommandPalette />
      </Suspense>
    </div>
  );
}
