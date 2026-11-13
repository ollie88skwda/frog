import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";
import { TIER_WORD, type Tier } from "./logic";

// Monochrome by fill weight, never hue (13): T1 solid ink, T2 accent-soft,
// T3 subtle, T4 text only with a hollow dot, T5 hollow + italic.
const TIER: Record<Tier, string> = {
  1: "bg-action text-on-action",
  2: "bg-accent-soft text-accent-ink",
  3: "bg-hover text-ink-2",
  4: "bg-transparent text-soft",
  5: "bg-transparent text-soft italic",
};

/** Always the text "T3", always a button that opens the EvidenceSheet. */
export function TierBadge({
  tier,
  onClick,
  className,
  ...props
}: { tier: Tier; onClick?: () => void } & Omit<
  ComponentProps<"button">,
  "onClick" | "children"
>) {
  const cls = cn(
    "inline-flex h-5 items-center gap-1 rounded-xs px-1.5 text-2xs font-semibold whitespace-nowrap",
    TIER[tier],
    className,
  );
  const hollow = tier >= 4 && (
    <span
      aria-hidden="true"
      className="size-1.5 rounded-full bg-transparent ring-1 ring-soft ring-inset"
    />
  );
  const aria = `Evidence tier ${tier}: ${TIER_WORD[tier]}`;
  return onClick ? (
    <button
      type="button"
      onClick={onClick}
      aria-label={aria}
      className={cn(cls, "min-h-5 hover:opacity-80")}
      {...props}
    >
      {hollow}T{tier}
    </button>
  ) : (
    <span aria-label={aria} role="img" className={cls}>
      {hollow}T{tier}
    </span>
  );
}
