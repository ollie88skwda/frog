import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

type IconButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  /** Accent "on" glow — a running rest stopwatch, a live state. */
  active?: boolean;
  /** Red hover — destructive actions (remove exercise). */
  danger?: boolean;
};

/**
 * The app's one square icon button: 40px on touch, 32px on desktop, a single
 * border + surface-fill treatment everywhere. Header toolbars, in-row ⋯
 * cells and standalone icon controls are built on this, so an icon button is
 * always the same size and style rather than a per-screen copy.
 */
export function IconButton({
  active = false,
  danger = false,
  className,
  type = "button",
  ...props
}: IconButtonProps) {
  return (
    <button
      type={type}
      className={cn(
        "flex size-10 shrink-0 items-center justify-center rounded-md border border-border bg-surface-2 text-faint transition-colors duration-100 hover:bg-surface-hover hover:text-ink md:size-8",
        active &&
          "border-accent bg-accent-soft text-accent hover:bg-accent-soft hover:text-accent",
        danger && "hover:text-neg",
        className,
      )}
      {...props}
    />
  );
}
