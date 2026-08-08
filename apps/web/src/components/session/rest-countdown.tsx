import { X } from "lucide-react";
import { useEffect, useReducer } from "react";
import { RestTimerIcon } from "@/components/session/rest-timer-icon";

export function mmss(totalSec: number): string {
  const s = Math.max(0, totalSec);
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, "0")}`;
}

/**
 * The Protocol's rest pill: the per-exercise rest stopwatch anchored in the
 * SAME spot every set — directly above the block's log strip. One pill per
 * exercise block (a superset's siblings each carry their own), one clock per
 * rest period, tied to its set by name ("after set 3"). Presentational:
 * ticking here only drives the display, it never times out — there's no
 * target to count down to, just Stop. Typing into the block's strip stops it
 * (the screen wires that); Stop is the manual fallback.
 */
export function RestPill({
  since,
  exerciseName,
  afterSet,
  onStop,
  testId,
}: {
  since: number;
  exerciseName: string;
  afterSet: number;
  onStop: () => void;
  testId?: string;
}) {
  const [, tick] = useReducer((n: number) => n + 1, 0);

  useEffect(() => {
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, []);

  const elapsed = Math.floor((Date.now() - since) / 1000);

  return (
    <div
      className="flex items-center gap-3 border border-border bg-surface-2 px-3 py-1.5"
      data-testid={testId}
    >
      <RestTimerIcon className="size-5 shrink-0 text-soft" />

      <span
        className="num shrink-0 text-2xl leading-none font-medium tabular-nums text-ink"
        data-testid={testId ? `${testId}-value` : undefined}
      >
        {mmss(elapsed)}
      </span>

      <span className="flex min-w-0 flex-1 flex-col">
        <span className="text-2xs tracking-widest text-faint uppercase">
          Rest
        </span>
        <span
          className="truncate text-2xs text-soft"
          data-testid={testId ? `${testId}-after` : undefined}
        >
          after set {afterSet} · {exerciseName}
        </span>
      </span>

      <button
        type="button"
        onClick={onStop}
        title="Stop"
        className="flex size-10 shrink-0 items-center justify-center border border-border bg-surface text-faint transition-colors duration-100 hover:bg-surface-hover hover:text-ink"
        data-testid={testId ? `${testId}-stop` : undefined}
      >
        <X className="size-4" />
      </button>
    </div>
  );
}
