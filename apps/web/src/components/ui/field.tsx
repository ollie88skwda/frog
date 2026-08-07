import type { InputHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

type FieldProps = InputHTMLAttributes<HTMLInputElement>;

/**
 * Boxless data-entry field for logging rows (the Hevy trick): transparent on
 * the row's own surface, no border, a dimmed placeholder hint that the typed
 * value replaces. 40px tall on touch / 32px on desktop — the same line height
 * as a committed row — and the value takes the accent while the field is
 * focused, so an editing cell reads at a glance without a box.
 */
export function Field({ className, ...props }: FieldProps) {
  return (
    <input
      className={cn(
        "num h-10 min-w-0 w-full bg-transparent px-1 text-sm text-ink placeholder:text-faint focus:bg-transparent focus:text-accent focus:outline-none md:h-8",
        className,
      )}
      {...props}
    />
  );
}
