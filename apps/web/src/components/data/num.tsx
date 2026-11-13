import type { ReactNode } from "react";
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
  return (
    <span
      className={cn("num whitespace-nowrap text-ink", SIZE[size], className)}
    >
      {value}
      {unit && (
        <span className="ml-0.5 text-[0.6em] font-semibold text-soft">
          {unit}
        </span>
      )}
    </span>
  );
}
