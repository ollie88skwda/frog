// Which page transition a route change gets (lib/page-router.tsx).
//   push: deeper or forward (list -> detail, Today -> workout): new page slides in
//   back:  shallower or history back: current page slides out to the right
//   tab:   sideways between sections (tab bar, forward-less jumps): cross-fade
//   null:  no transition (same page, query-only change, redirect replace)

export type NavKind = "push" | "back" | "tab" | null;

/** The four tab roots (components/app-shell.tsx NAV). */
const TAB_ROOTS = new Set(["/", "/plan", "/progress", "/you"]);

function depth(pathname: string): number {
  const path = pathname.replace(/\/+$/, "") || "/";
  if (TAB_ROOTS.has(path)) return 0;
  return path.split("/").filter(Boolean).length;
}

const section = (pathname: string) => pathname.split("/")[1] ?? "";

export function navKind(
  from: string,
  to: string,
  /** react-router's NavigationType: "POP" | "PUSH" | "REPLACE". */
  action: string,
  delta: number | null,
): NavKind {
  if (from === to || action === "REPLACE") return null;
  if (action === "POP") {
    if (delta == null) return "tab";
    return delta < 0 ? "back" : "push";
  }
  const a = depth(from);
  const b = depth(to);
  if (b > a) return "push";
  if (b < a) return "back";
  if (a === 0 || section(from) !== section(to)) return "tab";
  return "push";
}
