// Small self-contained formatters for the share module. Duration formatting
// intentionally does NOT import apps/web/src/lib/format.ts's `formatDuration`
// (packages/core stays framework-free and app-independent) — the share card's
// compact "H:MM" support-stat format is also a different shape than that
// function's "Xh Ym", so this isn't a stray duplicate, it's a distinct need.

/** ms → "H:MM" (e.g. 3852000 → "1:04"), for the compact duration support stat. */
export function formatHM(ms: number): string {
  const totalMin = Math.max(0, Math.round(ms / 60_000));
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return `${h}:${String(m).padStart(2, "0")}`;
}

/** Whole seconds → "m:ss" (e.g. 90 → "1:30"), for set-level durations. */
export function formatSetMMSS(totalSec: number): string {
  const s = Math.max(0, Math.round(totalSec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** "@Display Name" → "@displayname" (lowercase, spaces stripped). */
export function slugifyHandle(displayName: string): string {
  return displayName
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}
