import type { ConfidenceScore } from "@frog/core";
import { CONFIDENCE_WORD } from "@frog/core";
import { cn } from "@/lib/utils";

/**
 * Confidence meter (boss request 2026-11-14): a computed percentage, never
 * decorative (domain/confidence.ts). Fern when 50%+, amber when low (D5), and
 * the word "tentative" travels with a low number so it is never read as fact.
 * Tappable: opens the EvidenceSheet that explains what would raise it.
 */
export function ConfidenceBadge({
  score,
  onClick,
  showWord = false,
  className,
}: {
  score: Pick<ConfidenceScore, "pct" | "level">;
  onClick?: () => void;
  /** Append "tentative" / "likely" / "firm". */
  showWord?: boolean;
  className?: string;
}) {
  const low = score.level === "low";
  const word = CONFIDENCE_WORD[score.level];
  const label = `${score.pct}% confident, ${word}. Tap for what would raise it.`;
  const cls = cn(
    "relative inline-flex h-5 items-center gap-2 rounded-xs px-2 text-2xs font-semibold whitespace-nowrap",
    low ? "bg-attn-soft text-attn" : "bg-accent-soft text-accent-ink",
    className,
  );
  const body = (
    <>
      <span
        aria-hidden="true"
        className="h-1 w-6 overflow-hidden rounded-full bg-active"
      >
        <span
          className={cn(
            "block h-full rounded-full",
            low ? "bg-attn" : "bg-chart-mark",
          )}
          style={{ width: `${score.pct}%` }}
        />
      </span>
      <span className="num">{score.pct}%</span>
      {showWord && <span className="font-medium">{word}</span>}
    </>
  );
  return onClick ? (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className={cn(
        cls,
        "min-h-5 after:absolute after:-inset-y-3 after:-inset-x-2 hover:opacity-80",
      )}
    >
      {body}
    </button>
  ) : (
    <span role="img" aria-label={label} className={cls}>
      {body}
    </span>
  );
}
