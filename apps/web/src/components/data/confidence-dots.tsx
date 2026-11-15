import { cn } from "@/lib/utils";
import type { Confidence } from "./logic";

/** 3 dots; text always present for assistive tech, never a percentage. */
export function ConfidenceDots({
  confidence,
  showLabel = false,
  className,
}: {
  confidence: Confidence;
  showLabel?: boolean;
  className?: string;
}) {
  return (
    <span
      className={cn("inline-flex items-center gap-1", className)}
      title={confidence.label}
    >
      <span role="img" aria-label={confidence.label} className="flex gap-0.5">
        {[1, 2, 3].map((i) => (
          <span
            key={i}
            className={cn(
              "size-1.5 rounded-full",
              i <= confidence.level ? "bg-chart-mark" : "bg-active",
            )}
          />
        ))}
      </span>
      {showLabel && (
        <span className="text-2xs text-soft">{confidence.label}</span>
      )}
    </span>
  );
}
