import { type ReactNode, useRef } from "react";
import { cn } from "@/lib/utils";

const SIZE = {
  hero: "text-2xl font-bold", // 28/34, max 1 per screen
  xl: "text-xl font-bold", // 22/29 tile number
  lg: "text-lg font-bold",
  md: "text-sm font-semibold", // 15/22 row number
  sm: "text-xs font-semibold",
} as const;

/** A number in tabular numerals; the unit renders smaller in soft ink. Never inside a joke. */
export function Num({
  value,
  unit,
  size = "md",
  className,
}: {
  value: ReactNode;
  unit?: string;
  size?: keyof typeof SIZE;
  className?: string;
}) {
  // Remount the digits (and play `num-tick`) only when a plain number/string
  // actually changes; first paint and rich nodes render as-is.
  const plain = typeof value === "string" || typeof value === "number";
  const first = useRef(value);
  const dirty = useRef(false);
  if (plain && value !== first.current) dirty.current = true;
  const changed = plain && dirty.current;
  return (
    <span
      className={cn("num whitespace-nowrap text-ink", SIZE[size], className)}
    >
      {changed ? (
        <span key={String(value)} className="num-tick">
          {value}
        </span>
      ) : (
        value
      )}
      {unit && (
        <span className="ml-1 text-[0.6em] font-semibold text-soft">
          {unit}
        </span>
      )}
    </span>
  );
}
