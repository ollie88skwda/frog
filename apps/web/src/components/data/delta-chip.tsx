import { ArrowDown, ArrowUp, Minus } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import { type DeltaState, deltaState } from "./logic";

const TONE: Record<DeltaState, string> = {
  noise: "bg-hover text-soft",
  none: "bg-hover text-soft",
  good: "bg-accent-soft text-accent-ink", // Fern, not teal (13: one "good" green)
  attn: "bg-attn-soft text-attn", // amber, never red
};

/**
 * Noise-aware delta (C2c). Inside the noise band it renders neutral with a
 * dash and "within normal swing" in the label; color appears only outside it.
 * `basis` is always in the aria-label ("vs last 12 wk").
 */
export function DeltaChip({
  delta,
  noise = 0,
  unit,
  goodDirection = "up",
  basis,
  format,
  className,
}: {
  delta: number;
  /** Same units as `delta`; |delta| below this is "within normal swing". */
  noise?: number;
  unit?: string;
  goodDirection?: "up" | "down" | "none";
  basis: string;
  format?: (abs: number) => string;
  className?: string;
}) {
  const state = deltaState(delta, noise, goodDirection);
  const Icon =
    state === "noise" || state === "none"
      ? Minus
      : delta > 0
        ? ArrowUp
        : ArrowDown;
  const abs = Math.abs(delta);
  const text = Number.isFinite(delta)
    ? (format?.(abs) ?? `${Math.round(abs * 10) / 10}`)
    : "–";
  const swing = state === "noise" ? ", within normal swing" : "";
  return (
    <span
      role="img"
      aria-label={`${delta > 0 ? "up" : delta < 0 ? "down" : "no change"} ${text}${unit ?? ""} ${basis}${swing}`}
      className={cn(
        "num inline-flex h-5 items-center gap-0.5 rounded-xs px-1 text-2xs font-semibold whitespace-nowrap",
        TONE[state],
        className,
      )}
    >
      <Icon aria-hidden="true" weight="bold" className="size-3" />
      {text}
      {unit}
    </span>
  );
}
