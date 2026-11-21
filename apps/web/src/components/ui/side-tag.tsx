import { formatPreviousSides, type GhostSet } from "@frog/core";
import { cn } from "@/lib/utils";

// The one way Frog marks which side of a unilateral set a value belongs to.
// Replaces the raised ᴸ/ᴿ glyphs (tiny, off the baseline, unreadable): a
// small chip at the text's own baseline, readable at 11px and up.

export type Side = "left" | "right";

const LABEL: Record<Side, { short: string; long: string }> = {
  left: { short: "L", long: "Left" },
  right: { short: "R", long: "Right" },
};

export function SideTag({
  side,
  long = false,
  className,
  testId,
}: {
  side: Side | "both";
  /** "Left"/"Right" instead of "L"/"R" (headers, tabs). */
  long?: boolean;
  className?: string;
  testId?: string;
}) {
  const text =
    side === "both"
      ? long
        ? "Left + Right"
        : "L+R"
      : long
        ? LABEL[side].long
        : LABEL[side].short;
  const aria =
    side === "both" ? "both sides" : `${LABEL[side].long.toLowerCase()} side`;
  return (
    <span
      role="img"
      aria-label={aria}
      data-testid={testId}
      className={cn(
        "num inline-flex h-4 min-w-4 shrink-0 items-center justify-center rounded-xs bg-surface-2 px-1 align-baseline text-[11px] leading-none font-bold tracking-normal text-soft",
        className,
      )}
    >
      {text}
    </span>
  );
}

/**
 * A previous performance, side-labelled when it was a unilateral pair.
 * Same collapse rule as `formatPrevious` (matched pair = one value, uneven =
 * both), rendered with SideTags instead of a bare "a / b".
 */
export function PreviousSets({
  ghost,
  formatWeight,
  className,
}: {
  ghost: GhostSet;
  formatWeight: (kg: number) => string;
  className?: string;
}) {
  const p = formatPreviousSides(ghost, formatWeight);
  if (p.left == null && p.right == null) return null;
  if (!p.paired) return <span className={className}>{p.left}</span>;
  if (p.right == null)
    return (
      <span className={cn("inline-flex items-center gap-1", className)}>
        {p.left}
        <SideTag side="both" />
      </span>
    );
  return (
    <span className={cn("inline-flex items-center gap-1", className)}>
      <SideTag side="left" />
      {p.left}
      <SideTag side="right" className="ml-1" />
      {p.right}
    </span>
  );
}
