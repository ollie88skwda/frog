import { ArrowClockwise } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import type { SaveState } from "./logic";

const LABEL: Record<SaveState, string> = {
  queued: "Saving, will retry if offline",
  saved: "Saved",
  failed: "Not saved",
};

/**
 * F15 per-set save state. queued = hollow ring, saved = teal dot (teal is
 * system confirmation only), failed = danger dot + Retry control (40px target).
 * Derive state with `saveStateFrom(mutation)`.
 */
export function SaveDot({
  state,
  onRetry,
  className,
}: {
  state: SaveState;
  onRetry?: () => void;
  className?: string;
}) {
  if (state === "failed" && onRetry) {
    return (
      <button
        type="button"
        onClick={onRetry}
        aria-label="Set not saved. Retry"
        className={cn(
          "inline-flex size-10 items-center justify-center rounded-sm bg-danger-soft text-danger md:size-8",
          className,
        )}
      >
        <ArrowClockwise aria-hidden="true" weight="bold" className="size-4" />
      </button>
    );
  }
  return (
    <span
      role="img"
      aria-label={LABEL[state]}
      data-save-state={state}
      className={cn(
        "inline-block size-2 shrink-0 rounded-full",
        state === "queued" && "bg-transparent ring-1 ring-soft ring-inset",
        state === "saved" && "bg-pos",
        state === "failed" && "bg-danger",
        className,
      )}
    />
  );
}
