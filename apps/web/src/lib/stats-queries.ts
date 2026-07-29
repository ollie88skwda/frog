import type { MuscleByExercise } from "@frog/core";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { useExercises } from "./queries";
import { useRepo } from "./repo";

// exerciseId → muscleTargets, the lookup every stats aggregation needs to turn a
// logged set into per-muscle credit. Built from the cached exercise list (shared
// ["exercises"] query) so the stats hub and the Home mini heat map reuse one
// fetch. Empty map while exercises load — aggregations return empty, the screens
// show their loading state.
export function useMuscleMap(): MuscleByExercise {
  const { data: exercises = [] } = useExercises();
  return useMemo(() => {
    const map: MuscleByExercise = new Map();
    for (const e of exercises) map.set(e.id, e.muscleTargets);
    return map;
  }, [exercises]);
}

// Latest logged bodyweight (kg) — threads into distribution/report tonnage so
// bodyweight-exercise volume counts (null = never logged; volume skipped).
export function useLatestBodyweight(): number | null {
  const repo = useRepo();
  const { data = null } = useQuery({
    queryKey: ["latest-bodyweight"],
    queryFn: () => repo.latestBodyweightKg(),
    staleTime: 5 * 60_000,
  });
  return data;
}
