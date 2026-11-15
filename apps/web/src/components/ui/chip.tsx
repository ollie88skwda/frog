import * as ToggleGroupPrimitive from "@radix-ui/react-toggle-group";
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

const CHIP =
  "inline-flex h-10 shrink-0 items-center justify-center gap-1.5 rounded-sm bg-secondary/60 px-3 text-xs font-semibold whitespace-nowrap text-on-secondary transition-colors duration-150 hover:bg-secondary data-[state=on]:bg-accent-soft data-[state=on]:text-accent-ink disabled:cursor-not-allowed disabled:opacity-50 md:h-8";

/**
 * Single-select chip row (segmented control / filter chips). Radix
 * ToggleGroup gives `aria-pressed`, arrow-key roving focus and a group role.
 * Pass `value` / `onValueChange` (string). Empty string = nothing selected.
 */
export function ChipGroup({
  className,
  ...props
}: Omit<
  Extract<ComponentProps<typeof ToggleGroupPrimitive.Root>, { type: "single" }>,
  "type"
>) {
  return (
    <ToggleGroupPrimitive.Root
      type="single"
      className={cn("flex flex-wrap gap-1", className)}
      {...props}
    />
  );
}

export function ChipItem({
  className,
  ...props
}: ComponentProps<typeof ToggleGroupPrimitive.Item>) {
  return (
    <ToggleGroupPrimitive.Item className={cn(CHIP, className)} {...props} />
  );
}

/** A lone on/off chip (e.g. a "Yours" filter): pressed state via `aria-pressed`. */
export function ToggleChip({
  pressed,
  className,
  ...props
}: Omit<ComponentProps<"button">, "aria-pressed"> & { pressed: boolean }) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      data-state={pressed ? "on" : "off"}
      className={cn(CHIP, className)}
      {...props}
    />
  );
}
