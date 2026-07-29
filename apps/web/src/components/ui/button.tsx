import {
  Button as RtButton,
  IconButton as RtIconButton,
} from "@radix-ui/themes";
import type { ButtonHTMLAttributes } from "react";

type Variant = "primary" | "outline" | "ghost" | "danger";
type Size = "sm" | "md" | "lg" | "icon";

// Frog variant -> Radix Themes (variant, color).
//
// `ghost` deliberately maps to Radix `soft`, NOT Radix `ghost`: soft keeps a
// resting background, which is exactly what the no-bare-text-buttons rule
// requires (AGENTS.md) — Radix's own `ghost` is transparent until hover.
// `outline`/`ghost`/`danger` pin an explicit color because Radix defaults to
// the theme accent, and these are quiet/neutral controls; only `primary` is
// meant to carry the frog green.
const VARIANT = {
  primary: { variant: "solid" },
  outline: { variant: "surface", color: "gray" },
  ghost: { variant: "soft", color: "gray" },
  danger: { variant: "soft", color: "red" },
} as const satisfies Record<
  Variant,
  { variant: "solid" | "surface" | "soft"; color?: "gray" | "red" }
>;

// Heights are held at the pre-Radix scale so no call-site layout shifts:
// Radix size 2 = 32px (was h-8), size 3 = 40px (was h-10). `sm` and `md`
// collapse onto the same height because they already both rendered at h-8.
const SIZE = { sm: "2", md: "2", lg: "3", icon: "2" } as const;

// `color` is omitted from the HTML attrs because React's HTMLAttributes still
// carries the legacy `color?: string`, which collides with Radix's accent prop.
type ButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "color"> & {
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
  const styling = VARIANT[variant];
  const Comp = size === "icon" ? RtIconButton : RtButton;
  return (
    <Comp
      type={type}
      size={SIZE[size]}
      {...styling}
      className={className}
      {...props}
    />
  );
}
