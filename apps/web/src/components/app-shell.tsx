import { APP_NAME } from "@sbl/core";
import { BookOpen, Command as CommandIcon, Dumbbell, FlaskConical, History, Moon, Settings, Sun } from "lucide-react";
import { NavLink, Outlet } from "react-router";
import { useTheme } from "@/lib/theme";
import { cn } from "@/lib/utils";
import { CommandPalette } from "./command-palette";

const NAV = [
  { to: "/", label: "Train", icon: Dumbbell, end: true },
  { to: "/library", label: "Library", icon: BookOpen },
  { to: "/history", label: "History", icon: History },
  { to: "/findings", label: "Findings", icon: FlaskConical },
  { to: "/settings", label: "Settings", icon: Settings },
];

export function AppShell() {
  const { theme, toggle } = useTheme();
  return (
    <div className="flex h-dvh">
      <aside className="flex w-52 shrink-0 flex-col border-r border-border bg-surface max-md:hidden">
        <div className="flex h-12 items-center justify-between px-4">
          <span className="text-sm font-semibold tracking-tight">{APP_NAME}</span>
          <button
            type="button"
            onClick={toggle}
            title="Toggle theme"
            className="rounded-md p-1 text-soft transition-colors duration-100 hover:bg-surface-hover hover:text-ink"
          >
            {theme === "dark" ? <Sun className="size-3.5" /> : <Moon className="size-3.5" />}
          </button>
        </div>
        <nav className="flex flex-col gap-0.5 px-2 py-1">
          {NAV.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                cn(
                  "flex h-8 items-center gap-2.5 rounded-md px-2.5 text-sm transition-colors duration-100",
                  isActive
                    ? "bg-accent-soft text-ink"
                    : "text-soft hover:bg-surface-hover hover:text-ink",
                )
              }
            >
              <Icon className="size-4" />
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="mt-auto px-4 py-3">
          <div className="flex items-center gap-1.5 text-2xs text-faint">
            <CommandIcon className="size-3" />
            <span>K for commands</span>
          </div>
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
                "flex min-h-11 flex-1 flex-col items-center justify-center gap-0.5 py-1.5 text-2xs",
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
