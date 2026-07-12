import { useCallback, useSyncExternalStore } from "react";

export type Theme = "dark" | "light";

const listeners = new Set<() => void>();

function current(): Theme {
  return document.documentElement.dataset.theme === "light" ? "light" : "dark";
}

function set(theme: Theme) {
  document.documentElement.dataset.theme = theme;
  localStorage.setItem("theme", theme);
  for (const l of listeners) l();
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function useTheme(): { theme: Theme; toggle: () => void } {
  const theme = useSyncExternalStore(subscribe, current);
  const toggle = useCallback(
    () => set(current() === "dark" ? "light" : "dark"),
    [],
  );
  return { theme, toggle };
}
