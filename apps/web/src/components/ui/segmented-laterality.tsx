import { cn } from "@/lib/utils";

// The in-row B / L·R laterality control (Option A · Anchor): one tap flips
// just this set between bilateral and unilateral — committed or draft — with
// no menu, no details sheet. Shared by the session screen's set rows and the
// routine editor's set rows (the routine_editor parity rule, AGENTS.md
// 2026-08-08), so the two screens can never drift on laterality language or
// behavior. The two options are the only ones left (alternating folded into
// bilateral, docs/DECISIONS.md 2026-08-08). Compact enough to live in its own
// fixed grid track on every row type.
export function SegmentedLaterality({
  value,
  onChange,
  disabled,
  testId,
}: {
  value: "bilateral" | "unilateral";
  onChange: (l: "bilateral" | "unilateral") => void;
  disabled?: boolean;
  testId?: string;
}) {
  const opts = [
    { value: "bilateral", label: "B" },
    { value: "unilateral", label: "L·R" },
  ] as const;
  return (
    <fieldset
      className={cn(
        "flex h-6 min-w-12 overflow-hidden rounded-md border border-border-strong bg-surface-2",
        disabled && "opacity-50",
      )}
    >
      <legend className="sr-only">Laterality</legend>
      {opts.map((o) => (
        <button
          key={o.value}
          type="button"
          disabled={disabled}
          onClick={() => onChange(o.value)}
          aria-pressed={value === o.value}
          title={
            o.value === "unilateral"
              ? "Unilateral — each side separately"
              : "Bilateral — both sides together"
          }
          className={cn(
            "flex flex-1 items-center justify-center text-2xs tabular-nums transition-colors duration-100",
            value === o.value
              ? "bg-accent font-medium text-accent-fg"
              : "text-faint hover:bg-surface-hover hover:text-ink",
          )}
          data-testid={testId ? `${testId}-${o.value}` : undefined}
        >
          {o.label}
        </button>
      ))}
    </fieldset>
  );
}
