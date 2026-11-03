import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

// The one line in the system: a 1px `border-field` on text inputs (Because
// BRAND-FINAL-SPEC §3.3). Sizing/text classes from call sites apply to the
// <input> itself.
export function Input({
  className,
  size: _size,
  ...props
}: Omit<ComponentProps<"input">, "size"> & { size?: string }) {
  return (
    <input
      className={cn(
        "h-8 min-w-0 rounded-sm border border-field bg-sunken px-3 text-sm text-ink outline-none placeholder:text-faint focus-visible:border-focus disabled:cursor-not-allowed disabled:bg-hover disabled:text-disabled",
        className,
      )}
      {...props}
    />
  );
}
