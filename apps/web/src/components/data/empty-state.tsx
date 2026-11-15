import type { ReactNode } from "react";

/**
 * Frog-voice zone (edges only). It must still say what data is needed
 * ("Log 3 sessions of squat to see a trend"); numbers are never in a joke.
 */
export function EmptyState({
  title,
  need,
  action,
  glyph,
}: {
  title: string;
  /** The honest requirement, e.g. "6 sessions logged; stall check starts at 7". */
  need: string;
  action?: ReactNode;
  glyph?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-2 px-6 py-8 text-center">
      {glyph}
      <p className="text-sm font-semibold text-ink">{title}</p>
      <p className="text-xs text-soft">{need}</p>
      {action}
    </div>
  );
}
