import { useEffect, useReducer } from "react";
import { Button } from "@/components/ui/button";

// mm:ss for an elapsed second count. The one formatter the rest chip and its
// committed-row stamp share, so a running clock and the number it freezes
// into can never disagree.
export function mmss(totalSec: number): string {
  const s = Math.max(0, totalSec);
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, "0")}`;
}

/**
 * The rest stopwatch — the ONLY clock a rest period gets (session redesign
 * R2, option D). It counts UP from the moment its set was committed, mounts
 * directly under that set's committed row inside the station card, and names
 * the set it measures plus what will stop it. There is no target and no
 * countdown: rest is measured, not prescribed.
 *
 * Stopping (first keystroke of the next set, or this Stop button) stamps the
 * measured seconds onto the set it followed — see `stopRest` in the session
 * screen. Presentational: ticking here only drives the readout.
 */
export function RestStopwatch({
  startedAt,
  setNumber,
  onStop,
  testId,
}: {
  startedAt: number;
  /** 1-based number of the set this rest FOLLOWS. */
  setNumber: number;
  onStop: () => void;
  testId: string;
}) {
  const [, tick] = useReducer((n: number) => n + 1, 0);
  useEffect(() => {
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, []);

  const elapsed = Math.floor((Date.now() - startedAt) / 1000);

  return (
    <div
      role="status"
      className="flex items-center gap-2.5 border border-border bg-accent-soft px-2.5 py-2"
      data-testid={testId}
    >
      {/* Square, not a dot: circles are reserved for avatars and the frog
          mark. The pulse is the only motion here and it sits beside the
          numerals, never on them. */}
      <span
        aria-hidden="true"
        className="size-2 shrink-0 animate-pulse bg-accent"
      />
      <span className="flex min-w-0 flex-1 items-baseline gap-2">
        <span
          className="num shrink-0 text-xl leading-none font-medium tabular-nums text-ink"
          data-testid={`${testId}-value`}
        >
          {mmss(elapsed)}
        </span>
        <span className="min-w-0 text-2xs leading-tight text-soft">
          after set {setNumber} · stops when you start set {setNumber + 1}
        </span>
      </span>
      <Button
        variant="outline"
        size="sm"
        onClick={onStop}
        title="Stop the rest stopwatch"
        data-testid={`${testId}-stop`}
      >
        Stop
      </Button>
    </div>
  );
}
