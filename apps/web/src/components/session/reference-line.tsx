import { Button } from "@/components/ui/button";

/**
 * The ONE labeled reference line (session redesign R2, requirement 4). It
 * replaces all three of the old faint-grey references at once — the PREVIOUS
 * column, the ghost placeholders inside the weight/reps inputs, and the
 * target-styled upcoming rows — with a single dashed strip directly above the
 * inputs that says, in words, what each number is:
 *
 *   LAST 80 kg × 5   ·   TARGET 87.5 × 5   ·   [use]
 *
 * `last` must already be formatted through `formatPrevious()` (domain/
 * previous.ts) by the caller — it owns the uneven-unilateral-pair convention.
 */
export function ReferenceLine({
  last,
  target,
  onUse,
  testId,
}: {
  /** Last session's performance at this set index, pre-formatted. */
  last: string | null;
  /** The routine's target for this set index, pre-formatted. */
  target: string | null;
  /** Fill the inputs from LAST when there is one, else from TARGET. */
  onUse: () => void;
  testId: string;
}) {
  const labelCls =
    "shrink-0 text-2xs font-medium tracking-widest text-faint uppercase";
  return (
    <div
      className="flex min-h-9 items-center gap-2 border border-dashed border-border px-2 py-1"
      data-testid={testId}
    >
      <span className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <span className={labelCls}>Last</span>
        <span
          className="num min-w-0 text-xs text-soft"
          data-testid={`${testId}-last`}
        >
          {last ?? "— (new set)"}
        </span>
        {target && (
          <>
            <span className={labelCls}>Target</span>
            <span
              className="num min-w-0 text-xs text-soft"
              data-testid={`${testId}-target`}
            >
              {target}
            </span>
          </>
        )}
      </span>
      {(last || target) && (
        <Button
          variant="ghost"
          size="sm"
          // Keep whichever input is focused focused — tapping must not blur
          // it (Safari doesn't focus buttons on tap either way).
          onMouseDown={(e) => e.preventDefault()}
          onClick={onUse}
          title={last ? "Fill from last time" : "Fill from the target"}
          data-testid={`${testId}-use`}
        >
          use
        </Button>
      )}
    </div>
  );
}
