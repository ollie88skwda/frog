import { type RestTimerState, restRemainingSec } from "@sbl/core";
import { Minus, Plus, Timer, X } from "lucide-react";
import { useEffect, useReducer, useRef } from "react";
import { cn } from "@/lib/utils";

function mmss(totalSec: number): string {
  const s = Math.max(0, totalSec);
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, "0")}`;
}

/**
 * Per-exercise rest countdown chip shown in the block header once a set is
 * completed. Ticks each second; ±15s adjust; dismissable. Fires onDone exactly
 * once when it reaches zero (the parent plays the alert + clears it). The
 * top-bar count-up rest stopwatch is unaffected — this sits alongside it.
 */
export function RestCountdown({
  state,
  onAdjust,
  onDismiss,
  onDone,
  testId,
}: {
  state: RestTimerState;
  onAdjust: (deltaSec: number) => void;
  onDismiss: () => void;
  onDone: () => void;
  testId?: string;
}) {
  const [, tick] = useReducer((n: number) => n + 1, 0);
  const firedFor = useRef<number | null>(null);

  useEffect(() => {
    const t = setInterval(tick, 250);
    return () => clearInterval(t);
  }, []);

  const remaining = restRemainingSec(state, Date.now());
  const done = remaining <= 0;

  // Fire the alert exactly once per timer instance (keyed by startedAt).
  useEffect(() => {
    if (done && firedFor.current !== state.startedAt) {
      firedFor.current = state.startedAt;
      onDone();
    }
  });

  return (
    <span
      className={cn(
        "num flex h-8 shrink-0 items-center gap-1 rounded-md border px-1.5 text-xs",
        done
          ? "border-accent bg-accent-soft text-accent"
          : "border-border bg-surface-2 text-soft",
      )}
      data-testid={testId}
    >
      <Timer className="size-3.5 shrink-0" />
      <span
        className="min-w-9 text-center tabular-nums"
        data-testid={testId ? `${testId}-value` : undefined}
      >
        {done ? "rest!" : mmss(remaining)}
      </span>
      <button
        type="button"
        onClick={() => onAdjust(-15)}
        title="−15s"
        className="flex size-6 items-center justify-center rounded-sm border border-border bg-surface transition-colors duration-100 hover:bg-surface-hover"
        data-testid={testId ? `${testId}-minus` : undefined}
      >
        <Minus className="size-3" />
      </button>
      <button
        type="button"
        onClick={() => onAdjust(15)}
        title="+15s"
        className="flex size-6 items-center justify-center rounded-sm border border-border bg-surface transition-colors duration-100 hover:bg-surface-hover"
        data-testid={testId ? `${testId}-plus` : undefined}
      >
        <Plus className="size-3" />
      </button>
      <button
        type="button"
        onClick={onDismiss}
        title="Dismiss rest timer"
        className="flex size-6 items-center justify-center rounded-sm border border-border bg-surface text-faint transition-colors duration-100 hover:bg-surface-hover hover:text-ink"
        data-testid={testId ? `${testId}-dismiss` : undefined}
      >
        <X className="size-3" />
      </button>
    </span>
  );
}
