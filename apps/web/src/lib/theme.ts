import { useCallback, useSyncExternalStore } from "react";

// Frog ships the Because GREEN theme only. The user picks a mode:
// Device (follow the OS, default) | Day | Night. `data-theme="green"` and
// `data-mode="day|night"` live on <html>; index.html sets them pre-paint.
export type Mode = "device" | "day" | "night";
export type Resolved = "day" | "night";

const KEY = "mode";
const listeners = new Set<() => void>();

function stored(): Mode {
  const v = localStorage.getItem(KEY);
  return v === "day" || v === "night" ? v : "device";
}

function resolve(mode: Mode): Resolved {
  if (mode !== "device") return mode;
  return window.matchMedia("(prefers-color-scheme: light)").matches
    ? "day"
    : "night";
}

function apply(mode: Mode) {
  const root = document.documentElement;
  const resolved = resolve(mode);
  root.dataset.theme = "green";
  root.dataset.mode = resolved;
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute("content", resolved === "night" ? "#191513" : "#fcf9f4");
}

export function setMode(mode: Mode) {
  const root = document.documentElement;
  root.setAttribute("data-theme-switching", "");
  if (mode === "device") localStorage.removeItem(KEY);
  else localStorage.setItem(KEY, mode);
  apply(mode);
  for (const l of listeners) l();
  window.setTimeout(() => root.removeAttribute("data-theme-switching"), 250);
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  const mq = window.matchMedia("(prefers-color-scheme: light)");
  const onOs = () => {
    if (stored() === "device") {
      apply("device");
      cb();
    }
  };
  mq.addEventListener("change", onOs);
  return () => {
    listeners.delete(cb);
    mq.removeEventListener("change", onOs);
  };
}

function snapshot(): string {
  return `${stored()}|${document.documentElement.dataset.mode ?? "night"}`;
}

export function useTheme(): {
  mode: Mode;
  /** The mode actually on screen. */
  theme: Resolved;
  setMode: (m: Mode) => void;
  /** Flip between Day and Night (leaves Device). */
  toggle: () => void;
} {
  const snap = useSyncExternalStore(subscribe, snapshot);
  const [mode, theme] = snap.split("|") as [Mode, Resolved];
  const toggle = useCallback(
    () =>
      setMode(
        document.documentElement.dataset.mode === "night" ? "day" : "night",
      ),
    [],
  );
  return { mode, theme, setMode, toggle };
}
