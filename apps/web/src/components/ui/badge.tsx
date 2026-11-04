import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

type Tone = "neutral" | "accent" | "warn" | "danger";

const TONE: Record<Tone, string> = {
  neutral: "bg-hover text-ink",
  accent: "bg-accent-soft text-accent-ink",
  warn: "bg-secondary text-ink",
  danger: "bg-danger-soft text-danger",
};

// Status color never stands alone (Because §3.1.5): callers always pass words.
export function Badge({
  tone = "neutral",
  className,
  ...props
}: ComponentProps<"span"> & { tone?: Tone }) {
  return (
    <span
      className={cn(
        "inline-flex h-5 items-center rounded-xs px-1.5 text-2xs font-semibold whitespace-nowrap",
        TONE[tone],
        className,
      )}
      {...props}
    />
  );
}
