import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

// The one line in the system: a 1px `border-field` on text inputs (Because
// BRAND-FINAL-SPEC §3.3). Sizing/text classes from call sites apply to the
// <input> itself.
export function Input({ className, ...props }: ComponentProps<"input">) {
  return (
    <input
      className={cn(
        "h-10 md:h-8 w-full min-w-0 rounded-sm border border-field bg-sunken px-3 text-sm text-ink placeholder:text-faint focus-visible:border-focus disabled:cursor-not-allowed disabled:bg-hover disabled:text-disabled",
        className,
      )}
      {...props}
    />
  );
}

/** Multi-line text field: same single 1px line as `Input`. */
export function Textarea({ className, ...props }: ComponentProps<"textarea">) {
  return (
    <textarea
      className={cn(
        "w-full min-w-0 rounded-sm border border-field bg-sunken px-3 py-2 text-sm text-ink placeholder:text-faint focus-visible:border-focus disabled:cursor-not-allowed disabled:bg-hover disabled:text-disabled",
        className,
      )}
      {...props}
    />
  );
}
