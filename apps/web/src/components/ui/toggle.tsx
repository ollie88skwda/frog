import * as TogglePrimitive from "@radix-ui/react-toggle";
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

// Radix Toggle on the frog tokens. Both states carry a visible background
// (AGENTS.md: buttons are never bare text) — surface when off, accent-soft
// when on.
export function Toggle({
  className,
  ...props
}: ComponentProps<typeof TogglePrimitive.Root>) {
  return (
    <TogglePrimitive.Root
      data-slot="toggle"
      className={cn(
        "inline-flex h-8 shrink-0 items-center gap-1 border border-border bg-surface px-2 text-2xs font-medium text-soft",
        "transition-colors duration-100 outline-none hover:bg-surface-hover",
        "focus-visible:ring-2 focus-visible:ring-ring/70",
        "data-[state=on]:border-accent/50 data-[state=on]:bg-accent-soft data-[state=on]:text-pos",
        className,
      )}
      {...props}
    />
  );
}
