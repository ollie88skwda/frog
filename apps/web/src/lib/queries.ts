import { type Exercise, newId } from "@sbl/core";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRepo } from "./repo";

export function useExercises() {
  const repo = useRepo();
  return useQuery({
    queryKey: ["exercises"],
    queryFn: () => repo.listExercises(),
  });
}

export function useCreateExercise() {
  const repo = useRepo();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => repo.createExercise(name),
    onMutate: async (name) => {
      await qc.cancelQueries({ queryKey: ["exercises"] });
      const prev = qc.getQueryData<Exercise[]>(["exercises"]);
      const now = Date.now();
      const optimistic: Exercise = {
        id: newId(),
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
        ownerId: null,
        name,
        tags: null,
        isCustom: true,
      };
      qc.setQueryData<Exercise[]>(["exercises"], (old = []) =>
        [...old, optimistic].sort((a, b) => a.name.localeCompare(b.name)),
      );
      return { prev };
    },
    onError: (_err, _name, ctx) => {
      if (ctx?.prev) qc.setQueryData(["exercises"], ctx.prev);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["exercises"] }),
  });
}

export function useSessionExercises(sessionId: string) {
  const repo = useRepo();
  return useQuery({
    queryKey: ["session-exercises", sessionId],
    queryFn: () => repo.listSessionExercises(sessionId),
    staleTime: Number.POSITIVE_INFINITY,
  });
}

export function useGhost(exerciseId: string, excludeSessionExerciseId: string) {
  const repo = useRepo();
  return useQuery({
    queryKey: ["ghost", exerciseId, excludeSessionExerciseId],
    queryFn: () =>
      repo.lastSetsForExercise(exerciseId, excludeSessionExerciseId),
    staleTime: Number.POSITIVE_INFINITY,
  });
}
