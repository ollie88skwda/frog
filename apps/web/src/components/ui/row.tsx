import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

type RowVariants = { interactive?: boolean; dense?: boolean };

/**
 * The app's one fixed-height list-row template (history's original shape):
 * 44px on touch / 32px on desktop, px-4, items-center — every plain data row
 * (not a bespoke flex arrangement) renders through this so row height,
 * padding and alignment match across screens. `interactive` (default true)
 * adds the hover-surface treatment; turn it off for a static, unclickable row.
 * Exported as a class builder so a row that must itself be a `<Link>` or
 * `<button>` (rather than a `<div>`) can still use the exact same template.
 */
export function rowClass({
  interactive = true,
  dense = false,
  className,
}: RowVariants & { className?: string } = {}) {
  return cn(
    "flex items-center justify-between gap-2 px-4",
    // dense = the 48px data row (sparkline + number + delta); same height on
    // touch and desktop so inline marks never get squeezed.
    dense ? "h-12" : "h-11 md:h-8",
    interactive &&
      "transition-colors duration-150 ease-(--ease-out-quad) hover:bg-surface-hover",
    className,
  );
}

export function Row({
  interactive,
  dense,
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & RowVariants) {
  return (
    <div className={rowClass({ interactive, dense, className })} {...props} />
  );
}
