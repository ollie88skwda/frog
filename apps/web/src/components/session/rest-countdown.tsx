import { type RestTimerState, restRemainingSec } from "@frog/core";
import { Minus, Plus, X } from "lucide-react";
import { useEffect, useReducer, useState } from "react";
import { RestTimerIcon } from "@/components/session/rest-timer-icon";
import { cn } from "@/lib/utils";

export function mmss(totalSec: number): string {
  const s = Math.max(0, totalSec);
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, "0")}`;
}

export const REST_PRESETS: { label: string; sec: number | null }[] = [
  { label: "Off", sec: null },
  { label: "0:30", sec: 30 },
  { label: "1:00", sec: 60 },
  { label: "1:30", sec: 90 },
  { label: "2:00", sec: 120 },
  { label: "3:00", sec: 180 },
];

/**
 * The rest timer's control in the exercise block header — its own labelled
 * button, sitting to the left of the ⋯ overflow menu so the two read as two
 * deliberate controls instead of one clump. It owns the per-exercise target
 * (the presets used to be buried as a section inside ⋯) and shows that target
 * at rest, so an armed exercise is legible without opening anything. While a
 * countdown runs it goes accent, tying the block to the docked timer below.
 */
export function RestControl({
  blockName,
  restSec,
  running,
  onSetRest,
}: {
  blockName: string;
  restSec: number | null;
  running: boolean;
  onSetRest: (restSec: number | null) => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <span className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        title={
          restSec ? `Rest timer — ${mmss(restSec)}` : "Rest timer — not set"
        }
        className={cn(
          "num flex h-10 shrink-0 items-center gap-1.5 border px-2 text-2xs transition-colors duration-100 md:h-8",
          running
            ? "border-accent bg-accent-soft text-accent"
            : restSec
              ? "border-border bg-surface-2 text-soft hover:bg-surface-hover hover:text-ink"
              : "border-border bg-surface-2 text-faint hover:bg-surface-hover hover:text-ink",
        )}
        data-testid={`block-${blockName}-rest-timer`}
      >
        <RestTimerIcon className="size-4 shrink-0" />
        {/* The armed target — hidden while a countdown runs, so the only live
            time on screen is the docked one (two clocks read as a bug). */}
        {restSec != null && !running && <span>{mmss(restSec)}</span>}
      </button>
      {open && (
        <>
          <button
            type="button"
            aria-label="Close rest timer options"
            tabIndex={-1}
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-10 cursor-default"
          />
          <div className="floating absolute top-full right-0 z-20 mt-1 w-52 p-2">
            <p className="px-1 pb-1.5 text-2xs font-medium tracking-widest text-faint uppercase">
              Rest timer
            </p>
            <div className="grid grid-cols-3 gap-1">
              {REST_PRESETS.map((p) => (
                <button
                  key={p.label}
                  type="button"
                  onClick={() => {
                    onSetRest(p.sec);
                    setOpen(false);
                  }}
                  className={cn(
                    "num flex h-10 items-center justify-center border text-2xs transition-colors duration-100",
                    (p.sec ?? null) === (restSec ?? null)
                      ? "border-accent bg-accent-soft text-accent"
                      : "border-border bg-surface-2 text-soft hover:bg-surface-hover hover:text-ink",
                  )}
                  data-testid={`block-${blockName}-rest-${p.sec ?? "off"}`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </span>
  );
}

/**
 * The running rest countdown, docked as a floating bar above the mobile tab
 * island (bottom of the content column on desktop). One bar per session — it
 * shows the most recently started timer and names its exercise; the session
 * screen owns the tick that fires the done alert for *every* running timer, so
 * a second countdown left running in a superset still alerts while it is off
 * screen. Presentational: ticking here only drives the display.
 *
 * ±15s adjust and skip are 40px targets (logging path). A drain rail across the
 * top carries the progress — prominence without eating the screen.
 */
export function RestDock({
  state,
  exerciseName,
  onAdjust,
  onDismiss,
  testId,
}: {
  state: RestTimerState;
  exerciseName: string;
  onAdjust: (deltaSec: number) => void;
  onDismiss: () => void;
  testId?: string;
}) {
  const [, tick] = useReducer((n: number) => n + 1, 0);

  useEffect(() => {
    const t = setInterval(tick, 250);
    return () => clearInterval(t);
  }, []);

  const remaining = restRemainingSec(state, Date.now());
  const done = remaining <= 0;
  const total = Math.max(1, state.targetSec + state.adjustSec);
  const leftPct = Math.max(0, Math.min(100, (remaining / total) * 100));

  return (
    // Mobile: clears the floating tab island (56px tall + its 12px margin +
    // safe area). Desktop: `left-56` is the sidebar, so `mx-auto max-w-2xl px-4`
    // lands the dock exactly on the content column rather than on the viewport.
    <div className="pointer-events-none fixed inset-x-0 bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-30 md:bottom-4 md:left-56">
      <div className="mx-auto w-full max-w-2xl px-4">
        <div
          className={cn(
            "floating pointer-events-auto relative flex items-center gap-3 overflow-hidden px-3 py-2",
            done && "border-accent bg-accent-soft",
          )}
          data-testid={testId}
        >
          {/* Drain rail: the remaining fraction, stepped once per tick (no
            transition — nothing animates on the data path). */}
          <span className="absolute inset-x-0 top-0 h-[3px] bg-border">
            <span
              className="block h-full bg-accent"
              style={{ width: `${done ? 100 : leftPct}%` }}
            />
          </span>

          <RestTimerIcon
            className={cn(
              "size-5 shrink-0",
              done ? "text-accent" : "text-soft",
            )}
          />

          <span
            className={cn(
              "num shrink-0 text-[26px] leading-none font-medium tabular-nums",
              done ? "text-accent" : "text-ink",
            )}
            data-testid={testId ? `${testId}-value` : undefined}
          >
            {done ? "rest!" : mmss(remaining)}
          </span>

          <span className="flex min-w-0 flex-1 flex-col">
            <span className="text-2xs tracking-widest text-faint uppercase">
              Rest
            </span>
            <span className="truncate text-2xs text-soft">{exerciseName}</span>
          </span>

          <span className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              onClick={() => onAdjust(-15)}
              title="−15s"
              className="flex size-10 items-center justify-center border border-border bg-surface-2 text-soft transition-colors duration-100 hover:bg-surface-hover hover:text-ink"
              data-testid={testId ? `${testId}-minus` : undefined}
            >
              <Minus className="size-4" />
            </button>
            <button
              type="button"
              onClick={() => onAdjust(15)}
              title="+15s"
              className="flex size-10 items-center justify-center border border-border bg-surface-2 text-soft transition-colors duration-100 hover:bg-surface-hover hover:text-ink"
              data-testid={testId ? `${testId}-plus` : undefined}
            >
              <Plus className="size-4" />
            </button>
            <button
              type="button"
              onClick={onDismiss}
              title="Skip rest"
              className="flex size-10 items-center justify-center border border-border bg-surface-2 text-faint transition-colors duration-100 hover:bg-surface-hover hover:text-ink"
              data-testid={testId ? `${testId}-dismiss` : undefined}
            >
              <X className="size-4" />
            </button>
          </span>
        </div>
      </div>
    </div>
  );
}
