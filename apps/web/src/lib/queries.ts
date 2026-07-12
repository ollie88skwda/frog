import {
  type Exercise,
  type Metric,
  type NewMetricInput,
  newId,
} from "@sbl/core";
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
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
    // Synchronous onMutate: the optimistic write must land before React's
    // next render, or controlled inputs flash back to the stale value.
    onMutate: (name) => {
      void qc.cancelQueries({ queryKey: ["exercises"] });
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

export function useSession(sessionId: string) {
  const repo = useRepo();
  return useQuery({
    queryKey: ["session", sessionId],
    queryFn: () => repo.getSession(sessionId),
  });
}

export function useUpdateConditions(sessionId: string) {
  const repo = useRepo();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (values: Record<string, unknown>) =>
      repo.updateSessionConditions(sessionId, values),
    onSettled: () => qc.invalidateQueries({ queryKey: ["session", sessionId] }),
  });
}

export function useMetrics() {
  const repo = useRepo();
  return useQuery({ queryKey: ["metrics"], queryFn: () => repo.listMetrics() });
}

export function useCreateMetric() {
  const repo = useRepo();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: NewMetricInput) => repo.createMetric(input),
    onSettled: () => qc.invalidateQueries({ queryKey: ["metrics"] }),
  });
}

export function useSetMetricExercises() {
  const repo = useRepo();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { metricId: string; exerciseIds: string[] }) =>
      repo.setMetricExercises(input.metricId, input.exerciseIds),
    // Synchronous (see useCreateExercise): controlled checkboxes revert if the
    // optimistic write lands after React re-renders.
    onMutate: ({ metricId, exerciseIds }) => {
      void qc.cancelQueries({ queryKey: ["metrics"] });
      const prev = qc.getQueryData<Metric[]>(["metrics"]);
      qc.setQueryData<Metric[]>(["metrics"], (old = []) =>
        old.map((m) => (m.id === metricId ? { ...m, exerciseIds } : m)),
      );
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(["metrics"], ctx.prev);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["metrics"] }),
  });
}

export const HISTORY_PAGE = 50;

export function useSessionHistory() {
  const repo = useRepo();
  return useInfiniteQuery({
    queryKey: ["sessions"],
    queryFn: ({ pageParam }) => repo.listSessions(HISTORY_PAGE, pageParam),
    initialPageParam: 0,
    getNextPageParam: (lastPage, pages) =>
      lastPage.length < HISTORY_PAGE ? undefined : pages.length * HISTORY_PAGE,
  });
}

export function useFindingsData() {
  const repo = useRepo();
  return useQuery({
    queryKey: ["findings-data"],
    queryFn: () => repo.findingsData(),
    staleTime: 60_000,
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
