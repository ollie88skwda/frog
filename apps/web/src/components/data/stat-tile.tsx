import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { InfoNote } from "./info-note";
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
  emphasis,
  info,
  infoTitle,
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
  /** Opt-in: one primary number, quiet secondary line, roomier box. */
  emphasis?: boolean;
  /** Opt-in (with `emphasis`): explanation moved behind an info icon. */
  info?: ReactNode;
  infoTitle?: string;
}) {
  if (emphasis) {
    const inner = (
      <>
        <span
          className={cn(
            "text-xs font-semibold text-ink-2",
            info != null && "pr-8",
          )}
        >
          {label}
        </span>
        <span className="flex w-full flex-wrap items-center gap-x-2 gap-y-1">
          <Num value={value} unit={unit} size="xl" />
          {delta}
          {confidence}
          {spark}
        </span>
        {basis && <span className="text-2xs text-soft">{basis}</span>}
      </>
    );
    const box = cn(
      "flex h-full min-h-28 w-full min-w-0 flex-col items-start justify-between gap-2 rounded-md bg-surface-2 p-4 text-left",
      onClick &&
        "transition-colors duration-150 hover:bg-surface-hover active:bg-surface-active",
      className,
    );
    return (
      <div className="relative h-full min-w-0">
        {onClick ? (
          <button type="button" onClick={onClick} className={box}>
            {inner}
          </button>
        ) : (
          <div className={box}>{inner}</div>
        )}
        {info != null && (
          <InfoNote
            title={infoTitle ?? label}
            className="absolute top-3.5 right-3.5"
          >
            {info}
          </InfoNote>
        )}
      </div>
    );
  }
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
      <span className="flex flex-wrap items-center gap-2">
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
