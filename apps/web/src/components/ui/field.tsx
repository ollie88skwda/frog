import { sanitizeNumeric } from "@frog/core";
import type { InputHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

type FieldProps = InputHTMLAttributes<HTMLInputElement>;

/**
 * Boxless data-entry field for logging rows (the Hevy trick): transparent on
 * the row's own surface, no border, a dimmed placeholder hint that the typed
 * value replaces. 44px tall on touch / 32px on desktop — the same line height
 * as a committed row — and the value takes the accent while the field is
 * focused, so an editing cell reads at a glance without a box.
 */
export function Field({ className, onChange, ...props }: FieldProps) {
  // A numeric/decimal keyboard request means a numbers-only field: typed and
  // pasted text is cleaned before the caller sees it.
  const mode = props.inputMode;
  const numeric = mode === "numeric" || mode === "decimal";
  return (
    <input
      onChange={
        numeric && onChange
          ? (e) => {
              const clean = sanitizeNumeric(e.target.value, {
                decimal: mode === "decimal",
              });
              if (clean !== e.target.value) e.target.value = clean;
              onChange(e);
            }
          : onChange
      }
      className={cn(
        "num h-11 min-w-0 w-full bg-transparent px-1 text-sm text-ink placeholder:text-faint focus:bg-transparent focus:text-accent-ink md:h-8",
        className,
      )}
      {...props}
    />
  );
}
