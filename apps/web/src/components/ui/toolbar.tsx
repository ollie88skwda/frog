import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

/**
 * A header's right-side control row: uniform IconButtons, evenly spaced. One
 * place owns the gap, so every block/card header that carries a toolbar lays
 * its controls out identically.
 */
export function Toolbar({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("flex shrink-0 items-center gap-1.5", className)}
      {...props}
    />
  );
}
