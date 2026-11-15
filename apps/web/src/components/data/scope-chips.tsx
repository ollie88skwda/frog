import { ChipGroup, ChipItem } from "@/components/ui/chip";

export type ScopeOption = { value: string; label: string };

/** Scope switch reused everywhere (All · This block · 90 d · Last session). Never empty. */
export function ScopeChips({
  value,
  onChange,
  options,
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  options: ScopeOption[];
  className?: string;
}) {
  return (
    <ChipGroup
      value={value}
      onValueChange={(v) => v && onChange(v)}
      aria-label="Scope"
      className={className}
    >
      {options.map((o) => (
        <ChipItem key={o.value} value={o.value}>
          {o.label}
        </ChipItem>
      ))}
    </ChipGroup>
  );
}

export const DEFAULT_SCOPES: ScopeOption[] = [
  { value: "all", label: "All" },
  { value: "block", label: "This block" },
  { value: "90d", label: "90 d" },
  { value: "last", label: "Last session" },
];
