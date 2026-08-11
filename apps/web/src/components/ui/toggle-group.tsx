import * as ToggleGroupPrimitive from "@radix-ui/react-toggle-group";
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

// Radix ToggleGroup on the frog tokens. Segmented control: one hairline box,
// items separated by 1px rules, the selected item filled with the accent.
// Items are ≥40px tall on the logging path (AGENTS.md tap-target rule) — the
// caller sizes them via `size`.
export function ToggleGroup({
  className,
  ...props
}: ComponentProps<typeof ToggleGroupPrimitive.Root>) {
  return (
    <ToggleGroupPrimitive.Root
      data-slot="toggle-group"
      className={cn(
        "flex items-stretch divide-x divide-border border border-border bg-surface",
        className,
      )}
      {...props}
    />
  );
}

export function ToggleGroupItem({
  className,
  ...props
}: ComponentProps<typeof ToggleGroupPrimitive.Item>) {
  return (
    <ToggleGroupPrimitive.Item
      data-slot="toggle-group-item"
      className={cn(
        // Never bare text: the resting state keeps the surface fill, the
        // selected state the accent fill (AGENTS.md button rule).
        "flex min-w-10 flex-1 items-center justify-center px-2.5 text-xs font-medium text-soft",
        "transition-colors duration-100 outline-none",
        "hover:bg-surface-hover focus-visible:ring-2 focus-visible:ring-ring/70 focus-visible:ring-inset",
        "data-[state=on]:bg-accent data-[state=on]:text-accent-fg data-[state=on]:hover:bg-accent",
        "disabled:pointer-events-none disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}
