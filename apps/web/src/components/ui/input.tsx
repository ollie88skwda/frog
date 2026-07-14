import type { InputHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

type InputProps = InputHTMLAttributes<HTMLInputElement>;

export function Input({ className, ...props }: InputProps) {
  return (
    <input
      className={cn(
        // Filled, clearly-bordered box so it reads as tappable/editable on
        // touch (mobile-first) rather than blending into the row surface.
        "h-8 w-full rounded-md border border-border-strong bg-surface-2 px-2 text-sm text-ink",
        "placeholder:text-faint",
        "transition-[border-color,box-shadow] duration-150 ease-(--ease-out-quad)",
        "hover:border-border-strong",
        "focus:border-transparent focus:outline-none focus:ring-2 focus:ring-ring/70",
        className,
      )}
      {...props}
    />
  );
}
