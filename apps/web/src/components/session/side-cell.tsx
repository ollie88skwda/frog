import type { ReactNode } from "react";
import { SideTag } from "@/components/ui/side-tag";
import { cn } from "@/lib/utils";

// One side of a logged per-side pair, drawn as its own cell: a 1px outline in
// the text-field line colour (the one line the brand allows) and a solid L/R
// tag. Both are measured against WCAG non-text contrast (>= 3:1) on every row
// fill they sit on, day and night: surface, surface-2, hover and the selected
// accent-soft (docs/ux-audit/2026-11-25/fix-6-8). The set list and the
// logged-sets summary both render this, so the two never disagree.
export function SideCell({
  side,
  children,
  className,
  ...rest
}: {
  side: "left" | "right";
  children: ReactNode;
  className?: string;
  "data-pair-right"?: boolean;
}) {
  return (
    <span
      data-side-cell={side}
      className={cn(
        "num inline-flex min-h-7 items-center gap-1.5 rounded-sm whitespace-nowrap border border-field py-0.5 pr-2 pl-0.5",
        className,
      )}
      {...rest}
    >
      <SideTag
        side={side}
        className="h-5 min-w-5 rounded-xs bg-ink-2 px-1 text-[13px] text-bg"
      />
      {children}
    </span>
  );
}
