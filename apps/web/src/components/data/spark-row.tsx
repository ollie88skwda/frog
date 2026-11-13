import type { ReactNode } from "react";
import { rowClass } from "@/components/ui/row";
import { cn } from "@/lib/utils";
import { Spark } from "./spark";

/**
 * 48px dense row: glyph · name+sub · Spark · number + delta. The right cluster
 * is fixed width so numbers align down the list. Renders a <button> when
 * `onClick` is set (≥44px touch), else a div.
 */
export function SparkRow({
  glyph,
  title,
  sub,
  points,
  band,
  confidence,
  value,
  delta,
  onClick,
}: {
  glyph?: ReactNode;
  title: string;
  sub?: string;
  points?: (number | null)[];
  band?: [number, number];
  confidence?: "low" | "ok";
  value: ReactNode;
  delta?: ReactNode;
  onClick?: () => void;
}) {
  const cls = rowClass({
    dense: true,
    interactive: !!onClick,
    className: cn("w-full text-left", onClick && "bg-surface"),
  });
  const body = (
    <>
      {glyph && <span className="shrink-0">{glyph}</span>}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold text-ink">
          {title}
        </span>
        {sub && <span className="block truncate text-xs text-soft">{sub}</span>}
      </span>
      {points && <Spark points={points} band={band} confidence={confidence} />}
      <span className="flex w-[7.5rem] shrink-0 items-center justify-end gap-1.5">
        {value}
        {delta}
      </span>
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
