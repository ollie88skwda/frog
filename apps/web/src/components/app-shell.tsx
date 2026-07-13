import { APP_NAME } from "@sbl/core";
import {
  BookOpen,
  Dumbbell,
  FlaskConical,
  History,
  Moon,
  Settings,
  Sun,
} from "lucide-react";
import { useMemo } from "react";
import { NavLink, Outlet, useNavigate } from "react-router";
import { useHotkeys } from "@/lib/hotkeys";
import { useRepo } from "@/lib/repo";
import { useTheme } from "@/lib/theme";
import { cn } from "@/lib/utils";
import { CommandPalette } from "./command-palette";

const NAV = [
  { to: "/", label: "Train", icon: Dumbbell, end: true, key: null },
  { to: "/library", label: "Library", icon: BookOpen, key: "L" },
  { to: "/history", label: "History", icon: History, key: "H" },
  { to: "/findings", label: "Findings", icon: FlaskConical, key: "F" },
  { to: "/settings", label: "Settings", icon: Settings, key: null },
];

export function AppShell() {
  const { theme, toggle } = useTheme();
  const navigate = useNavigate();
  const repo = useRepo();

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
            <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-brand text-xs font-semibold text-accent-fg">
              {APP_NAME[0]}
            </span>
            <span className="truncate text-sm font-medium">{APP_NAME}</span>
          </span>
          <button
            type="button"
            onClick={toggle}
            title="Toggle theme"
            className="rounded-md p-1 text-soft transition-colors duration-150 ease-(--ease-out-quad) hover:bg-surface-hover hover:text-ink"
          >
            {theme === "dark" ? (
              <Sun className="size-4" />
            ) : (
              <Moon className="size-4" />
            )}
          </button>
        </div>

        <p className="px-4 pt-2 pb-1 text-2xs font-medium tracking-widest text-faint uppercase">
          Workspace
        </p>
        <nav className="flex flex-col gap-0.5 px-2">
          {NAV.map(({ to, label, icon: Icon, end, key }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                cn(
                  "flex h-8 items-center gap-2 rounded-md px-2 text-sm transition-colors duration-150 ease-(--ease-out-quad)",
                  isActive
                    ? "bg-surface-active text-ink"
                    : "text-soft hover:bg-surface-hover hover:text-ink",
                )
              }
            >
              <Icon className="size-4 shrink-0" />
              <span className="min-w-0 flex-1 truncate">{label}</span>
              {key && <kbd className="keycap">{key}</kbd>}
            </NavLink>
          ))}
        </nav>

        <div className="mt-auto flex items-center gap-2 px-4 py-3 text-2xs text-faint">
          <kbd className="keycap">⌘K</kbd>
          <span>for commands</span>
        </div>
      </aside>

      <main className="min-w-0 flex-1 overflow-y-auto">
        <Outlet />
      </main>

      {/* Bottom tab bar on small screens (mobile-first logging). */}
      <nav className="fixed inset-x-0 bottom-0 z-40 flex border-t border-border bg-surface md:hidden">
        {NAV.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              cn(
                "flex min-h-11 flex-1 flex-col items-center justify-center gap-0.5 py-1 text-2xs",
                isActive ? "text-accent" : "text-soft",
              )
            }
          >
            <Icon className="size-4" />
            {label}
          </NavLink>
        ))}
      </nav>

      <CommandPalette />
    </div>
  );
}
