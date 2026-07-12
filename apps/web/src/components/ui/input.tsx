import type { InputHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

type InputProps = InputHTMLAttributes<HTMLInputElement>;

export function Input({ className, ...props }: InputProps) {
  return (
    <input
      className={cn(
        "h-8 w-full rounded-md border border-border bg-surface px-2.5 text-sm text-ink",
        "placeholder:text-faint transition-colors duration-100",
        "hover:border-border-strong",
        "focus:border-accent focus:outline-none focus:ring-2 focus:ring-ring/40",
        className,
      )}
      {...props}
    />
  );
}
