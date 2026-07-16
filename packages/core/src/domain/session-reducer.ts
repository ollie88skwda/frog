import type { SetType } from "./exercise-types";

export type DraftSet = {
  weightKg: number | null;
  reps: number | null;
  // Per-type extra fields (duration/distance exercise types, plan §B).
  durationSec?: number | null;
  distanceM?: number | null;
  setType?: SetType;
};
export type DraftState = { sets: DraftSet[] };
export type Action =
  | { type: "addSet"; set?: Partial<DraftSet> }
  | { type: "insertSets"; index: number; sets: DraftSet[] }
  | { type: "editSet"; index: number; patch: Partial<DraftSet> }
  | { type: "removeSet"; index: number };

const EMPTY: DraftSet = { weightKg: null, reps: null };

export function reducer(state: DraftState, action: Action): DraftState {
  switch (action.type) {
    case "addSet":
      return { sets: [...state.sets, { ...EMPTY, ...action.set }] };
    case "insertSets": {
      // Used by the warm-up calculator: insert typed sets ABOVE working sets.
      const sets = [...state.sets];
      sets.splice(action.index, 0, ...action.sets);
      return { sets };
    }
    case "editSet":
      return {
        sets: state.sets.map((s, i) =>
          i === action.index ? { ...s, ...action.patch } : s,
        ),
      };
    case "removeSet":
      return { sets: state.sets.filter((_, i) => i !== action.index) };
  }
}

export function ghostFor(prev: DraftSet[], index: number): DraftSet {
  if (prev.length === 0) return EMPTY;
  return prev[Math.min(index, prev.length - 1)];
}
