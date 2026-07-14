import { cn } from "@/lib/utils";

/**
 * Circular progress-ring status glyph (Linear's status-icon metaphor, mapped
 * to set completion): empty thin ring → partial pie → filled accent + check.
 */
export function StatusRing({
  state,
  progress = 0,
  className,
}: {
  state: "empty" | "partial" | "done";
  /** 0..1, used when state is "partial". */
  progress?: number;
  className?: string;
}) {
  const size = 14;
  const r = 5;
  const c = size / 2;

  if (state === "done") {
    return (
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className={cn("shrink-0", className)}
        aria-hidden="true"
        role="presentation"
      >
        <circle cx={c} cy={c} r={r + 1} fill="var(--accent)" />
        <path
          d={`M ${c - 2.6} ${c} l 1.9 1.9 l 3.3 -3.6`}
          stroke="var(--accent-fg)"
          strokeWidth="1.4"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
      </svg>
    );
  }

  const clamped = Math.max(0, Math.min(1, progress));
  const angle = clamped * Math.PI * 2 - Math.PI / 2;
  const large = clamped > 0.5 ? 1 : 0;
  const px = c + (r - 1.5) * Math.cos(angle);
  const py = c + (r - 1.5) * Math.sin(angle);

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      className={cn("shrink-0", className)}
      aria-hidden="true"
      role="presentation"
    >
      <circle
        cx={c}
        cy={c}
        r={r}
        fill="none"
        stroke={state === "partial" ? "var(--warn)" : "var(--faint)"}
        strokeWidth="1.4"
      />
      {state === "partial" && clamped > 0 && (
        <path
          d={`M ${c} ${c} L ${c} ${c - (r - 1.5)} A ${r - 1.5} ${r - 1.5} 0 ${large} 1 ${px} ${py} Z`}
          fill="var(--warn)"
        />
      )}
    </svg>
  );
}
