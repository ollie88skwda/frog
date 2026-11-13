import { Lightbulb, X } from "@phosphor-icons/react";
import type { ReactNode } from "react";
import { Card } from "@/components/ui/card";
import { IconButton } from "@/components/ui/icon-button";
import { ConfidenceDots } from "./confidence-dots";
import type { Confidence, Tier } from "./logic";
import { TierBadge } from "./tier-badge";

/**
 * Coach card (F4 surface): imperative title (≤8 words), one reason line with
 * the user's numbers, footer = TierBadge + ConfidenceDots + "Why?". The rule id
 * lives in the EvidenceSheet, not here. A quiet layer: never auto-applies.
 * Every card carries a tier and a Why (F4 acceptance).
 */
export function CoachCard({
  title,
  reason,
  tier,
  confidence,
  onWhy,
  onDismiss,
  action,
  glyph,
}: {
  title: string;
  reason: string;
  tier: Tier;
  confidence: Confidence;
  onWhy: () => void;
  onDismiss?: () => void;
  action?: ReactNode;
  glyph?: ReactNode;
}) {
  return (
    <Card size="sm" className="bg-surface-2">
      <div className="flex items-start gap-3 px-(--card-spacing)">
        <span className="mt-0.5 shrink-0 text-chart-mark">
          {glyph ?? (
            <Lightbulb aria-hidden="true" weight="fill" className="size-5" />
          )}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-ink">{title}</p>
          <p className="text-xs text-soft">{reason}</p>
        </div>
        {onDismiss && (
          <IconButton title="Not now" onClick={onDismiss}>
            <X aria-hidden="true" className="size-4" />
          </IconButton>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2 px-(--card-spacing)">
        <TierBadge tier={tier} onClick={onWhy} />
        <ConfidenceDots confidence={confidence} />
        <button
          type="button"
          onClick={onWhy}
          className="ml-auto inline-flex h-10 items-center rounded-sm bg-secondary px-3 text-xs font-semibold text-on-secondary transition-colors duration-150 hover:bg-hover md:h-8"
        >
          Why?
        </button>
        {action}
      </div>
    </Card>
  );
}
