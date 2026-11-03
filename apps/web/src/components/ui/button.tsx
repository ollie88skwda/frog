import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

type Variant = "primary" | "accent" | "outline" | "ghost" | "danger";
type Size = "sm" | "md" | "lg" | "icon" | "icon-lg";

// Because button anatomy (docs/brand/because-reference): no borders, tone
// separation only. `primary` = ink by day / paper at night (one per view);
// `accent` = Fern, for the one creative action and selected states; `outline`
// and `ghost` both keep a resting sand fill (AGENTS.md: never a bare-text
// button) — the old outline line is gone with the no-lines rule.
const VARIANT: Record<Variant, string> = {
  primary: "bg-action text-on-action hover:bg-action-hover",
  accent: "bg-accent text-on-accent hover:bg-accent-hover",
  outline: "bg-secondary text-on-secondary hover:bg-active",
  ghost: "bg-secondary/60 text-on-secondary hover:bg-secondary",
  danger: "bg-danger-soft text-danger hover:bg-danger-soft/70",
};

// Heights held from the pre-rebrand scale so no call-site layout shifts:
// 32px (sm/md/icon) and 40px (lg/icon-lg). Radius is Base 8 (8px) for both.
const SIZE: Record<Size, string> = {
  sm: "h-8 px-3 text-xs",
  md: "h-8 px-3 text-sm",
  lg: "h-10 px-4 text-sm",
  icon: "size-8 p-0",
  "icon-lg": "size-10 p-0",
};

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
};

export function Button({
  className,
  variant = "outline",
  size = "md",
  type = "button",
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cn(
        "inline-flex shrink-0 items-center justify-center gap-2 rounded-sm font-semibold whitespace-nowrap transition-colors duration-150 disabled:cursor-not-allowed disabled:bg-hover disabled:text-disabled",
        VARIANT[variant],
        SIZE[size],
        className,
      )}
      {...props}
    />
  );
}
