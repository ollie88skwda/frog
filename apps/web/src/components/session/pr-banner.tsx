import { PR_TYPE_LABELS, type PrType } from "@frog/core";
import { Medal, X } from "lucide-react";
import { useEffect } from "react";
import { useVoice } from "@/lib/voice";

export type PrBannerData = {
  // A monotonically increasing id so re-hitting the same record re-triggers the
  // auto-dismiss timer even if the text is identical.
  id: number;
  exerciseName: string;
  prTypes: PrType[];
};

/**
 * Live PR banner: announced when a completed set beats a stored record. Names
 * the exercise + which record type(s) fell, auto-dismisses after 4s. The medal
 * badge on the winning set row (session-local) persists in the grid.
 */
export function PrBanner({
  data,
  onDismiss,
}: {
  data: PrBannerData | null;
  onDismiss: () => void;
}) {
  const { t } = useVoice();
  useEffect(() => {
    if (!data) return;
    const timer = setTimeout(onDismiss, 4000);
    return () => clearTimeout(timer);
  }, [data, onDismiss]);

  if (!data) return null;
  const labels = data.prTypes.map((p) => PR_TYPE_LABELS[p]).join(" · ");

  return (
    <div className="pointer-events-none fixed inset-x-0 top-14 z-30 flex justify-center px-4">
      <div
        className="pointer-events-auto flex max-w-md items-center gap-2 rounded-md border border-accent bg-accent-soft px-3 py-2 shadow-(--inset-control)"
        role="status"
        data-testid="pr-banner"
      >
        <Medal className="size-4 shrink-0 text-accent" />
        <span className="min-w-0 text-xs text-ink">
          <span className="font-semibold">New PR — {data.exerciseName}</span>
          <span
            className="block truncate text-soft"
            data-testid="pr-banner-types"
          >
            {labels}
          </span>
          {/* Editorial framing only — the exercise name and record types above
              stay bare literals (data never routes through a register). */}
          <span className="block text-2xs text-faint">
            {t(
              "Saved to your records.",
              "The frog has recorded your personal record and updated the relevant distributions. It is not impressed easily. It is, on this occasion, impressed.",
            )}
          </span>
        </span>
        <button
          type="button"
          onClick={onDismiss}
          title="Dismiss"
          className="ml-1 flex size-6 shrink-0 items-center justify-center rounded-sm border border-border bg-surface text-faint transition-colors duration-100 hover:text-ink"
          data-testid="pr-banner-dismiss"
        >
          <X className="size-3" />
        </button>
      </div>
    </div>
  );
}
