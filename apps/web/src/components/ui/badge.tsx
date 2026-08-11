import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

// Small, square, non-interactive label. shadcn's stock badge is cva-driven;
// this is the same API with a plain lookup, so the app doesn't take a
// class-variance-authority dependency for four class strings.
const VARIANT = {
  outline: "border-border bg-surface text-soft",
  accent: "border-accent/40 bg-accent-soft text-pos",
  solid: "border-accent bg-accent text-accent-fg",
  quiet: "border-transparent bg-surface-2 text-faint",
} as const;

export function Badge({
  className,
  variant = "outline",
  ...props
}: ComponentProps<"span"> & { variant?: keyof typeof VARIANT }) {
  return (
    <span
      data-slot="badge"
      className={cn(
        "inline-flex shrink-0 items-center gap-1 border px-1.5 py-0.5 text-2xs leading-none font-medium whitespace-nowrap",
        VARIANT[variant],
        className,
      )}
      {...props}
    />
  );
}
