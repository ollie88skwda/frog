import type { InputHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

// Routine-editor-scoped input language, mirroring the session Spotlight
// redesign's A1/A2 mockups (session-redesign-r3.html): an obviously-typeable
// boxed field, accent-underlined, big mono numerals, with adjust chips
// either side. Built here rather than shared with the session screen because
// session.tsx is mid-rewrite on another branch right now
// (fm/frog-session-spotlight) — see the PR body for a proposed later dedupe
// once both land.
export type AdjustFieldProps = {
  label: string;
  /** Small right-aligned note, e.g. "same as set 2" once a value round-trips
   *  from the pre-fill rule untouched. */
  hint?: string;
  unit?: string;
  value: string;
  onValueChange: (v: string) => void;
  /** Negative and positive deltas, in display order (e.g. -15,-10,-5,-1,1,5,10,15). */
  deltas: readonly number[];
  /** Reps round to whole numbers; weight allows up to 2 decimal places. */
  integer?: boolean;
  placeholder?: string;
  /** Smaller variant for the per-side ᴸ/ᴿ grid, where two fields share a row. */
  compact?: boolean;
  testId?: string;
  inputMode?: InputHTMLAttributes<HTMLInputElement>["inputMode"];
  className?: string;
};

function applyDelta(raw: string, delta: number, integer: boolean): string {
  const n = Number.parseFloat(raw);
  const base = Number.isFinite(n) ? n : 0;
  const next = Math.max(0, base + delta);
  return integer
    ? String(Math.round(next))
    : String(Math.round(next * 100) / 100);
}

export function AdjustField({
  label,
  hint,
  unit,
  value,
  onValueChange,
  deltas,
  integer = false,
  placeholder = "—",
  compact = false,
  testId,
  inputMode,
  className,
}: AdjustFieldProps) {
  return (
    <div
      className={cn(
        "rounded-md border border-border-strong bg-surface-2",
        compact ? "p-1.5" : "p-2",
        className,
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-2xs font-medium tracking-widest text-faint uppercase">
          {label}
        </span>
        {hint && (
          <span
            className="truncate text-2xs text-faint"
            data-testid={testId ? `${testId}-hint` : undefined}
          >
            {hint}
          </span>
        )}
      </div>
      <div
        className={cn(
          "mt-1 flex items-baseline gap-1 border-b-2 border-accent",
          compact ? "pb-0.5" : "pb-1",
        )}
      >
        <input
          inputMode={inputMode ?? (integer ? "numeric" : "decimal")}
          value={value}
          onChange={(e) => onValueChange(e.target.value)}
          placeholder={placeholder}
          className={cn(
            "num min-w-0 flex-1 bg-transparent font-semibold text-ink focus:text-accent focus:outline-none",
            compact ? "text-lg" : "text-2xl",
          )}
          data-testid={testId}
        />
        {unit && (
          <span className="shrink-0 pb-0.5 text-xs font-medium text-faint">
            {unit}
          </span>
        )}
      </div>
      <div className={cn("flex flex-wrap gap-1", compact ? "mt-1" : "mt-1.5")}>
        {deltas.map((d) => (
          <button
            key={d}
            type="button"
            onClick={() => onValueChange(applyDelta(value, d, integer))}
            className={cn(
              "num rounded-md px-1.5 text-2xs font-medium transition-colors duration-150",
              compact ? "py-0.5" : "py-1",
              d > 0
                ? "bg-accent-soft text-accent hover:bg-accent-soft/70"
                : "bg-surface-3 text-soft hover:bg-surface-hover",
            )}
            data-testid={testId ? `${testId}-delta-${d}` : undefined}
          >
            {d > 0 ? `+${d}` : d}
          </button>
        ))}
      </div>
    </div>
  );
}

// Weight ±1/5/10/15, reps ±1/2 — the deltas locked in session-redesign-r3.html
// (mockups A1/A2). The per-side ᴸ/ᴿ grid gets a compact ±1-only set (A3):
// sides differ by a rep, not by fifteen.
export const WEIGHT_DELTAS = [-15, -10, -5, -1, 1, 5, 10, 15] as const;
export const REPS_DELTAS = [-2, -1, 1, 2] as const;
export const REPS_DELTAS_COMPACT = [-1, 1] as const;
