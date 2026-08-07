import { MoreHorizontal } from "lucide-react";
import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

/**
 * The quiet ⋯ "more" button that anchors a row's menu-gutter cell: ~24px
 * visual on desktop with a transparent resting background, scaled up to a
 * full 40px tap target on touch (the logging-path minimum). It carries no
 * border — the row's own border is the only box it needs.
 */
export function Dots({
  className,
  type = "button",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type={type}
      className={cn(
        "flex size-10 shrink-0 items-center justify-center rounded-md text-faint transition-colors duration-100 hover:bg-surface-hover hover:text-ink md:size-6",
        className,
      )}
      {...props}
    >
      <MoreHorizontal className="size-4 md:size-3.5" aria-hidden="true" />
    </button>
  );
}
