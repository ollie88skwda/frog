const dateFmt = new Intl.DateTimeFormat(undefined, {
  weekday: "short",
  month: "short",
  day: "numeric",
});
const timeFmt = new Intl.DateTimeFormat(undefined, {
  hour: "numeric",
  minute: "2-digit",
});
const fullFmt = new Intl.DateTimeFormat(undefined, {
  weekday: "short",
  year: "numeric",
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

export const formatDate = (ms: number) => dateFmt.format(ms);
export const formatTime = (ms: number) => timeFmt.format(ms);
export const formatDateTime = (ms: number) => fullFmt.format(ms);

export function formatDuration(ms: number): string {
  const m = Math.max(0, Math.floor(ms / 60_000));
  const h = Math.floor(m / 60);
  return h > 0 ? `${h}h ${m % 60}m` : `${m}m`;
}

/** Like formatDuration but always includes seconds (e.g. `1h 23m 45s`). */
export function formatDurationSeconds(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

/** Whole seconds → `m:ss` for duration-type set logging (e.g. 90 → `1:30`). */
export function formatMMSS(totalSec: number): string {
  const s = Math.max(0, Math.round(totalSec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/**
 * Parses a duration entry into whole seconds. Accepts `m:ss` / `mm:ss` or a
 * plain seconds count (`90`). Returns null for empty / unparseable input.
 */
export function parseDuration(raw: string): number | null {
  const t = raw.trim();
  if (t === "") return null;
  if (t.includes(":")) {
    const [m, s] = t.split(":");
    const mm = Number.parseInt(m, 10);
    const ss = Number.parseInt(s, 10);
    if (Number.isNaN(mm) || Number.isNaN(ss)) return null;
    return mm * 60 + ss;
  }
  const n = Number.parseFloat(t);
  return Number.isNaN(n) ? null : Math.round(n);
}
