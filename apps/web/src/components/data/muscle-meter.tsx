import { cn } from "@/lib/utils";
import { METER_STATUS_WORD, meterStatus } from "./logic";

/**
 * F3 weekly hard sets vs the 10-20 starting band (R6 [T4/T5], R18b ~1/3
 * maintains, C12 trim >20 only if stalled). Band is a tone block, never lines;
 * fill = --chart-mark; over band = amber, never red. Tap opens contributions.
 */
export function MuscleMeter({
  label,
  sets,
  band = [10, 20],
  max = 24,
  onClick,
}: {
  label: string;
  sets: number;
  band?: [number, number];
  /** Track scale (sets). */
  max?: number;
  onClick?: () => void;
}) {
  const status = meterStatus(sets, band);
  const pct = (v: number) => `${Math.min(100, Math.max(0, (v / max) * 100))}%`;
  const fill =
    status === "high"
      ? "bg-attn"
      : status === "in-band" || status === "below"
        ? "bg-chart-mark"
        : "bg-soft";
  const word = METER_STATUS_WORD[status];
  const shown = Math.round(sets * 10) / 10;
  const cls =
    "flex min-h-11 w-full items-center gap-3 px-4 py-2 text-left" +
    (onClick ? " transition-colors duration-150 hover:bg-surface-hover" : "");
  const body = (
    <>
      <span className="w-[5.5rem] shrink-0 truncate text-sm font-semibold text-ink">
        {label}
      </span>
      <span className="min-w-0 flex-1">
        <span
          role="img"
          aria-label={`${label}: ${shown} hard sets this week, ${word}`}
          className="relative block h-2 rounded-xs bg-hover"
        >
          <span
            aria-hidden="true"
            className="absolute inset-y-0 rounded-xs bg-active"
            style={{ left: pct(band[0]), width: pct(band[1] - band[0]) }}
          />
          <span
            aria-hidden="true"
            className={cn(
              "meter-grow absolute inset-y-0 left-0 rounded-xs",
              fill,
            )}
            style={{ width: pct(sets) }}
          />
        </span>
        <span
          className={cn(
            "mt-0.5 block text-2xs",
            status === "high" ? "text-attn" : "text-soft",
          )}
        >
          {word}
        </span>
      </span>
      <span className="num w-9 shrink-0 text-right text-sm font-semibold text-ink">
        {shown}
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
