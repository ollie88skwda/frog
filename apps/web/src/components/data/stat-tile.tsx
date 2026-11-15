import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Num } from "./num";

/**
 * tracker.gg-style tile: value · delta · basis label · n. One 44px+ button when
 * `onClick` is set (drill-down), else a static card. Fits 2-up at 390px.
 */
export function StatTile({
  label,
  value,
  unit,
  delta,
  basis,
  n,
  spark,
  confidence,
  onClick,
  className,
}: {
  label: string;
  value: ReactNode;
  unit?: string;
  delta?: ReactNode;
  /** e.g. "vs your last 12 wk" */
  basis?: string;
  n?: number;
  spark?: ReactNode;
  confidence?: ReactNode;
  onClick?: () => void;
  className?: string;
}) {
  const cls = cn(
    "flex min-h-24 w-full min-w-0 flex-col items-start gap-1 rounded-md bg-surface-2 p-3 text-left",
    onClick &&
      "transition-colors duration-150 hover:bg-surface-hover active:bg-surface-active",
    className,
  );
  const body = (
    <>
      <span className="text-xs text-soft">{label}</span>
      <span className="flex w-full flex-wrap items-end justify-between gap-x-2">
        <Num value={value} unit={unit} size="xl" />
        {spark}
      </span>
      <span className="flex flex-wrap items-center gap-1.5">
        {delta}
        {confidence}
      </span>
      {(basis || n != null) && (
        <span className="text-2xs text-soft">
          {basis}
          {basis && n != null && " · "}
          {n != null && `n=${n}`}
        </span>
      )}
    </>
  );
  return onClick ? (
    <button type="button" onClick={onClick} className={cls}>
      {body}
    </button>
  ) : (
    <div className={cls}>{body}</div>
  );
}
