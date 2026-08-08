import { X } from "lucide-react";
import { useEffect, useReducer } from "react";
import { RestTimerIcon } from "@/components/session/rest-timer-icon";

export function mmss(totalSec: number): string {
  const s = Math.max(0, totalSec);
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, "0")}`;
}

/**
 * The rest stopwatch, anchored inline under the committed set it belongs to
 * (Option A · Anchor): one clock per rest period, rendered inside the block
 * right below the row that started it. Reads "Rest 2:14 · after set 2" with
 * one Stop. Presentational: the tick only drives the display, it never times
 * out — there's no target to count down to, just Stop. The old floating
 * RestDock and the header's rest badge are gone — this strip is the single
 * rest surface per block (a superset sibling's strip keeps running alongside
 * its own).
 */
export function RestStrip({
  since,
  setNumber,
  blockName,
  onStop,
  testId,
}: {
  since: number;
  /** The physical set (1-based) this rest period is anchored to. */
  setNumber: number;
  blockName: string;
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
      className="flex items-center gap-2 border-t border-border bg-surface-2 px-4 py-1.5"
      data-testid={testId}
    >
      <RestTimerIcon className="size-4 shrink-0 text-soft" />
      <span
        className="num shrink-0 text-sm font-medium tabular-nums text-ink"
        data-testid={testId ? `${testId}-value` : undefined}
      >
        {mmss(elapsed)}
      </span>
      <span className="truncate text-2xs text-faint">
        rest · after {blockName} set {setNumber}
      </span>
      <button
        type="button"
        onClick={onStop}
        title="Stop rest"
        className="ml-auto flex size-8 shrink-0 items-center justify-center border border-border bg-surface-2 text-faint transition-colors duration-100 hover:bg-surface-hover hover:text-ink"
        data-testid={testId ? `${testId}-stop` : undefined}
      >
        <X className="size-3.5" />
      </button>
    </div>
  );
}
