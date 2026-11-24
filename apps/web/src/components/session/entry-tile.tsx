import { Minus, Plus } from "@phosphor-icons/react";
import { type ReactNode, useCallback, useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import { holdMultiplier, scrubSteps } from "./entry";

const REDUCED = () =>
  typeof window !== "undefined" &&
  window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

function tick() {
  if (REDUCED()) return;
  try {
    navigator.vibrate?.(8);
  } catch {
    /* haptics are an enhancement only */
  }
}

/** Round −/+ stepper: step on press, then repeat and accelerate while held. */
export function Stepper({
  dir,
  label,
  step,
  onStep,
  testId,
}: {
  dir: -1 | 1;
  label: string;
  step: number;
  onStep: (delta: number) => void;
  testId: string;
}) {
  const timers = useRef<{ t?: number; i?: number }>({});
  const stop = useCallback(() => {
    window.clearTimeout(timers.current.t);
    window.clearInterval(timers.current.i);
  }, []);
  useEffect(() => stop, [stop]);
  return (
    <button
      type="button"
      aria-label={label}
      data-testid={testId}
      onMouseDown={(e) => e.preventDefault()}
      onPointerDown={(e) => {
        if (e.pointerType === "mouse" && e.button !== 0) return;
        onStep(dir * step);
        tick();
        let n = 0;
        stop();
        timers.current.t = window.setTimeout(() => {
          timers.current.i = window.setInterval(() => {
            n += 1;
            onStep(dir * step * holdMultiplier(n));
            tick();
          }, 110);
        }, 420);
      }}
      onPointerUp={stop}
      onPointerLeave={stop}
      onPointerCancel={stop}
      onClick={(e) => {
        // Keyboard activation only (detail 0); pointer presses stepped above.
        if (e.detail === 0) onStep(dir * step);
      }}
      className={cn(
        "rounded-md flex size-14 shrink-0 touch-manipulation items-center justify-center transition-colors duration-100 select-none",
        dir === 1
          ? "bg-accent-soft text-accent-ink active:bg-accent-soft/70"
          : "bg-surface-2 text-soft active:bg-surface-hover",
      )}
    >
      {dir === 1 ? (
        <Plus className="size-6" weight="bold" />
      ) : (
        <Minus className="size-6" weight="bold" />
      )}
    </button>
  );
}

/** Wraps the number: drag horizontally to scrub (enhancement; tap still types). */
export function ScrubSurface({
  step,
  onStep,
  children,
}: {
  step: number;
  onStep: (delta: number) => void;
  children: ReactNode;
}) {
  const s = useRef({ x: 0, y: 0, applied: 0, active: false, down: false });
  return (
    <div
      className="flex min-w-0 flex-1 items-center justify-center gap-2"
      style={{ touchAction: "pan-y" }}
      // Its horizontal drag scrubs the value; never also an exercise swipe.
      data-no-swipe=""
      onPointerDown={(e) => {
        s.current = {
          x: e.clientX,
          y: e.clientY,
          applied: 0,
          active: false,
          down: true,
        };
      }}
      onPointerMove={(e) => {
        const st = s.current;
        if (!st.down) return;
        const dx = e.clientX - st.x;
        if (!st.active) {
          if (
            Math.abs(dx) < 10 ||
            Math.abs(dx) < Math.abs(e.clientY - st.y) * 1.5
          )
            return;
          st.active = true;
          (document.activeElement as HTMLElement | null)?.blur?.();
          e.currentTarget.setPointerCapture(e.pointerId);
        }
        const steps = scrubSteps(dx);
        if (steps !== st.applied) {
          onStep((steps - st.applied) * step);
          st.applied = steps;
          tick();
        }
      }}
      onPointerUp={() => {
        s.current.down = false;
      }}
      onPointerCancel={() => {
        s.current.down = false;
      }}
    >
      {children}
    </div>
  );
}
