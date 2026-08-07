import {
  SET_TYPE_LABELS,
  SET_TYPE_MARKERS,
  SET_TYPES,
  type SetType,
} from "@frog/core";
import { Check } from "lucide-react";
import { useState } from "react";
import { StatusRing } from "@/components/ui/status-ring";
import { cn } from "@/lib/utils";

// Marker letter color for a set type (drop = accent per spec; warm-up/failure
// keep quiet semantic tints; normal is just the faint set number).
export function markerColorClass(setType: SetType): string {
  switch (setType) {
    case "warmup":
      return "text-warn";
    case "failure":
      return "text-neg";
    case "drop":
      return "text-accent";
    default:
      return "text-faint";
  }
}

// The set-number cell: shows the number, or a W/F/D marker once a type is
// assigned, and opens a small menu to set the type. Boxless (text marker +
// StatusRing, no border/fill) so a set row reads as a row, not a grid of
// boxes. Shared by the session screen's committed/draft rows and the routine
// editor's set rows — `ringState` is omitted where there's no completion
// state to show (e.g. a planned routine set).
export function SetTypeCell({
  index,
  setType,
  ringState,
  onChange,
  testId,
  sideLabel,
}: {
  index: number;
  setType: SetType;
  ringState?: "done" | "empty";
  onChange: (t: SetType) => void;
  testId?: string;
  /** "L" on a unilateral pair's top line — appends ᴸ to the number or type marker. */
  sideLabel?: "L";
}) {
  const [open, setOpen] = useState(false);
  const marker = SET_TYPE_MARKERS[setType];
  return (
    <span className="relative flex items-center gap-2">
      {ringState && <StatusRing state={ringState} />}
      <button
        type="button"
        // Keep the row's input focused so tapping doesn't blur it (avoids
        // closing the mobile keyboard).
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => setOpen((o) => !o)}
        title="Set type"
        className={cn(
          "num min-w-3 text-left text-2xs tabular-nums",
          markerColorClass(setType),
          setType !== "normal" && "font-semibold",
        )}
        data-testid={testId}
      >
        {sideLabel ? `${marker || index + 1}ᴸ` : marker || index + 1}
      </button>
      {open && (
        <>
          <button
            type="button"
            aria-label="Close menu"
            tabIndex={-1}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-10 cursor-default"
          />
          <div className="floating absolute top-full left-0 z-20 mt-1 min-w-32 py-1">
            {SET_TYPES.map((t) => (
              <button
                key={t}
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  onChange(t);
                  setOpen(false);
                }}
                data-testid={testId ? `${testId}-${t}` : undefined}
                className="flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-xs text-soft transition-colors duration-150 hover:bg-surface-hover hover:text-ink"
              >
                <span className="flex items-center gap-2">
                  <span
                    className={cn(
                      "num w-3 text-center text-2xs font-semibold",
                      markerColorClass(t),
                    )}
                  >
                    {SET_TYPE_MARKERS[t] || "·"}
                  </span>
                  {SET_TYPE_LABELS[t]}
                </span>
                {t === setType && <Check className="size-3.5 text-accent" />}
              </button>
            ))}
          </div>
        </>
      )}
    </span>
  );
}
