import type { ConditionValue, ConditionMap } from "./conditions";

export type DraftSet = {
  weightKg: number | null;
  reps: number | null;
  metricValues?: ConditionMap;
};
export type DraftState = { sets: DraftSet[] };
export type Action =
  | { type: "addSet" }
  | { type: "editSet"; index: number; patch: Partial<Pick<DraftSet, "weightKg" | "reps">> }
  | { type: "removeSet"; index: number }
  | { type: "setMetricValue"; index: number; metricId: string; value: ConditionValue };

export function reducer(state: DraftState, action: Action): DraftState {
  switch (action.type) {
    case "addSet":
      return { sets: [...state.sets, { weightKg: null, reps: null }] };
    case "editSet":
      return { sets: state.sets.map((s, i) => i === action.index ? { ...s, ...action.patch } : s) };
    case "removeSet":
      return { sets: state.sets.filter((_, i) => i !== action.index) };
    case "setMetricValue":
      return {
        sets: state.sets.map((s, i) =>
          i === action.index
            ? { ...s, metricValues: { ...(s.metricValues ?? {}), [action.metricId]: action.value } }
            : s,
        ),
      };
  }
}

export function ghostFor(prev: DraftSet[], index: number): DraftSet {
  if (prev.length === 0) return { weightKg: null, reps: null };
  return prev[Math.min(index, prev.length - 1)];
}
