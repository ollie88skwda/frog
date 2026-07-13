import { jointActionLabel, type Tier } from "@sbl/core";
import { cn } from "@/lib/utils";

// S/A/B/C tier glyph — 16px square, tier encoded by fill strength so it
// stays legible without relying on color alone.
export function TierBadge({
  tier,
  className,
}: {
  tier: Tier;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "num inline-flex size-4 shrink-0 items-center justify-center text-[10px] font-semibold leading-none",
        tier === "S" && "bg-accent text-accent-fg",
        tier === "A" && "bg-accent-soft text-ink",
        tier === "B" && "bg-translucent text-soft",
        tier === "C" && "border border-border text-faint",
        className,
      )}
      title={`${tier} tier`}
    >
      {tier}
    </span>
  );
}

export function JointActionChips({
  actions,
  className,
}: {
  actions: string[] | null;
  className?: string;
}) {
  if (!actions?.length) return null;
  return (
    <span className={cn("flex min-w-0 items-center gap-1", className)}>
      {actions.map((a) => (
        <span
          key={a}
          className="truncate bg-translucent px-1 text-2xs text-faint"
        >
          {jointActionLabel(a)}
        </span>
      ))}
    </span>
  );
}
