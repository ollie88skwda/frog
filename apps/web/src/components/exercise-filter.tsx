import { MUSCLES, type MuscleTarget } from "@sbl/core";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";

const MUSCLE_KEYS = new Set(MUSCLES.map((m) => m.key));

// Same bucketing rule as groupByPrimaryMuscle: primary target muscle, or
// "other" when it has none / an unknown key. Keeps the filter consistent with
// the group headers it filters within.
export function primaryMuscleKey(e: {
  muscleTargets: MuscleTarget[] | null;
}): string {
  const primary = e.muscleTargets?.[0]?.muscle;
  return primary && MUSCLE_KEYS.has(primary) ? primary : "other";
}

export function filterExercises<
  T extends { name: string; muscleTargets: MuscleTarget[] | null },
>(items: T[], query: string, muscle: string): T[] {
  const q = query.trim().toLowerCase();
  return items.filter((e) => {
    if (q && !e.name.toLowerCase().includes(q)) return false;
    if (muscle && primaryMuscleKey(e) !== muscle) return false;
    return true;
  });
}

// Search box + muscle-group filter, shared by the Library and the session
// exercise picker so both stay in sync.
export function ExerciseFilterBar({
  query,
  onQuery,
  muscle,
  onMuscle,
  autoFocus,
}: {
  query: string;
  onQuery: (v: string) => void;
  muscle: string;
  onMuscle: (v: string) => void;
  autoFocus?: boolean;
}) {
  return (
    <div className="flex gap-2">
      <div className="relative flex-1">
        <Search className="pointer-events-none absolute top-1/2 left-2 size-4 -translate-y-1/2 text-faint" />
        <Input
          placeholder="Search exercises…"
          value={query}
          onChange={(e) => onQuery(e.target.value)}
          autoFocus={autoFocus}
          className="pl-8"
          data-testid="exercise-search-input"
        />
      </div>
      <select
        value={muscle}
        onChange={(e) => onMuscle(e.target.value)}
        className="h-8 w-32 shrink-0 rounded-md border border-border bg-surface px-2 text-xs text-ink"
        data-testid="exercise-filter-select"
      >
        <option value="">All muscles</option>
        {MUSCLES.map((m) => (
          <option key={m.key} value={m.key}>
            {m.label}
          </option>
        ))}
        <option value="other">Other</option>
      </select>
    </div>
  );
}
