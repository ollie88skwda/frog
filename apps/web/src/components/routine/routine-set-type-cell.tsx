import { SET_TYPE_LABELS, SET_TYPE_MARKERS, type SetType } from "@frog/core";
import { Check } from "lucide-react";
import { useState } from "react";
import { markerColorClass } from "@/components/ui/set-type-cell";
import { cn } from "@/lib/utils";

// Routine-editor-scoped copy of the session's set-type marker+menu (see
// AdjustField's note on the file above — session.tsx is mid-rewrite on
// another branch, so this isn't refactored into the shared
// `components/ui/set-type-cell.tsx`; imports its color helper read-only).
//
// Selectable types are capped to normal/warmup: supersets and drop sets are
// being removed from the product (session-redesign-r3 decisions.md #8 — "not
// super science-based") and a routine can't prescribe "failure" ahead of
// time anyway. A set that already carries a removed type (legacy failure/drop
// data from before this change) keeps rendering its own marker and color —
// never silently relabeled — it's just not offered going forward.
const SELECTABLE_TYPES: readonly SetType[] = ["normal", "warmup"];

export function RoutineSetTypeCell({
  index,
  setType,
  onChange,
  testId,
}: {
  index: number;
  setType: SetType;
  onChange: (t: SetType) => void;
  testId?: string;
}) {
  const [open, setOpen] = useState(false);
  const marker = SET_TYPE_MARKERS[setType];
  return (
    <span className="relative flex items-center gap-2">
      <button
        type="button"
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
        {marker || index + 1}
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
            {SELECTABLE_TYPES.map((t) => (
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
