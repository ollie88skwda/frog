import {
  type Exercise,
  type ExerciseClassification,
  type ExerciseFavorite,
  type Machine,
  type MachinePatch,
  type Metric,
  type NewExerciseOpts,
  type NewMachineInput,
  type NewMetricInput,
  newId,
  type Session,
  type TrackedCondition,
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
    mutationFn: ({ name, opts }: { name: string; opts?: NewExerciseOpts }) =>
      repo.createExercise(name, opts),
    // Synchronous onMutate: the optimistic write must land before React's
    // next render, or controlled inputs flash back to the stale value.
    onMutate: ({ name, opts }) => {
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
        machineId: opts?.machineId ?? null,
        jointActions: opts?.jointActions ?? null,
        muscleTargets: opts?.muscleTargets ?? null,
        imageUrl: null,
        imageAttribution: null,
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

export function useDeleteExercise() {
  const repo = useRepo();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => repo.deleteExercise(id),
    onMutate: (id) => {
      void qc.cancelQueries({ queryKey: ["exercises"] });
      const prev = qc.getQueryData<Exercise[]>(["exercises"]);
      qc.setQueryData<Exercise[]>(["exercises"], (old = []) =>
        old.filter((e) => e.id !== id),
      );
      return { prev };
    },
    onError: (_e, _id, ctx) => {
      if (ctx?.prev) qc.setQueryData(["exercises"], ctx.prev);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["exercises"] }),
  });
}

export function useDeleteMetric() {
  const repo = useRepo();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => repo.deleteMetric(id),
    onMutate: (id) => {
      void qc.cancelQueries({ queryKey: ["metrics"] });
      const prev = qc.getQueryData<Metric[]>(["metrics"]);
      qc.setQueryData<Metric[]>(["metrics"], (old = []) =>
        old.filter((m) => m.id !== id),
      );
      return { prev };
    },
    onError: (_e, _id, ctx) => {
      if (ctx?.prev) qc.setQueryData(["metrics"], ctx.prev);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["metrics"] }),
  });
}

export function useSetExerciseTags() {
  const repo = useRepo();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { exerciseId: string; tags: string[] }) =>
      repo.setExerciseTags(input.exerciseId, input.tags),
    onMutate: ({ exerciseId, tags }) => {
      void qc.cancelQueries({ queryKey: ["exercises"] });
      const prev = qc.getQueryData<Exercise[]>(["exercises"]);
      qc.setQueryData<Exercise[]>(["exercises"], (old = []) =>
        old.map((e) =>
          e.id === exerciseId ? { ...e, tags: tags.length ? tags : null } : e,
        ),
      );
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(["exercises"], ctx.prev);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["exercises"] }),
  });
}

export function useSetExerciseClassification() {
  const repo = useRepo();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      exerciseId: string;
      classification: ExerciseClassification;
    }) =>
      repo.setExerciseClassification(input.exerciseId, input.classification),
    onMutate: ({ exerciseId, classification }) => {
      void qc.cancelQueries({ queryKey: ["exercises"] });
      const prev = qc.getQueryData<Exercise[]>(["exercises"]);
      qc.setQueryData<Exercise[]>(["exercises"], (old = []) =>
        old.map((e) =>
          e.id === exerciseId
            ? {
                ...e,
                ...("jointActions" in classification
                  ? { jointActions: classification.jointActions ?? null }
                  : {}),
                ...("muscleTargets" in classification
                  ? { muscleTargets: classification.muscleTargets ?? null }
                  : {}),
              }
            : e,
        ),
      );
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(["exercises"], ctx.prev);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["exercises"] }),
  });
}

export function useSetExerciseMachine() {
  const repo = useRepo();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { exerciseId: string; machineId: string | null }) =>
      repo.setExerciseMachine(input.exerciseId, input.machineId),
    onMutate: ({ exerciseId, machineId }) => {
      void qc.cancelQueries({ queryKey: ["exercises"] });
      const prev = qc.getQueryData<Exercise[]>(["exercises"]);
      qc.setQueryData<Exercise[]>(["exercises"], (old = []) =>
        old.map((e) => (e.id === exerciseId ? { ...e, machineId } : e)),
      );
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(["exercises"], ctx.prev);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["exercises"] }),
  });
}

export function useMachines() {
  const repo = useRepo();
  return useQuery({
    queryKey: ["machines"],
    queryFn: () => repo.listMachines(),
  });
}

export function useCreateMachine() {
  const repo = useRepo();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: NewMachineInput) => repo.createMachine(input),
    onMutate: (input) => {
      void qc.cancelQueries({ queryKey: ["machines"] });
      const prev = qc.getQueryData<Machine[]>(["machines"]);
      const now = Date.now();
      const optimistic: Machine = {
        id: newId(),
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
        ownerId: "",
        name: input.name,
        brand: input.brand ?? null,
        catalogKey: input.catalogKey ?? null,
        settings: input.settings ?? null,
        notes: input.notes ?? null,
        photoPath: null,
      };
      qc.setQueryData<Machine[]>(["machines"], (old = []) =>
        [...old, optimistic].sort((a, b) => a.name.localeCompare(b.name)),
      );
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(["machines"], ctx.prev);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["machines"] }),
  });
}

export function useUpdateMachine() {
  const repo = useRepo();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { id: string; patch: MachinePatch }) =>
      repo.updateMachine(input.id, input.patch),
    // Powers in-session setup edits — must feel instant.
    onMutate: ({ id, patch }) => {
      void qc.cancelQueries({ queryKey: ["machines"] });
      const prev = qc.getQueryData<Machine[]>(["machines"]);
      qc.setQueryData<Machine[]>(["machines"], (old = []) =>
        old.map((m) =>
          m.id === id
            ? {
                ...m,
                ...("name" in patch && patch.name != null
                  ? { name: patch.name }
                  : {}),
                ...("brand" in patch ? { brand: patch.brand ?? null } : {}),
                ...("settings" in patch
                  ? { settings: patch.settings ?? null }
                  : {}),
                ...("notes" in patch ? { notes: patch.notes ?? null } : {}),
              }
            : m,
        ),
      );
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(["machines"], ctx.prev);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["machines"] }),
  });
}

export function useDeleteMachine() {
  const repo = useRepo();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => repo.deleteMachine(id),
    onMutate: (id) => {
      void qc.cancelQueries({ queryKey: ["machines"] });
      const prev = qc.getQueryData<Machine[]>(["machines"]);
      qc.setQueryData<Machine[]>(["machines"], (old = []) =>
        old.filter((m) => m.id !== id),
      );
      return { prev };
    },
    onError: (_e, _id, ctx) => {
      if (ctx?.prev) qc.setQueryData(["machines"], ctx.prev);
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: ["machines"] });
      void qc.invalidateQueries({ queryKey: ["exercises"] });
    },
  });
}

export function useUploadMachinePhoto() {
  const repo = useRepo();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { machineId: string; file: Blob }) =>
      repo.uploadMachinePhoto(input.machineId, input.file),
    // Off the logging hot path — no optimistic write; thumbnail appears on settle.
    onSettled: (_d, _e, { machineId }) => {
      void qc.invalidateQueries({ queryKey: ["machines"] });
      void qc.invalidateQueries({ queryKey: ["machine-photo", machineId] });
    },
  });
}

export function useMachinePhotoUrl(machine: Machine | null | undefined) {
  const repo = useRepo();
  return useQuery({
    queryKey: ["machine-photo", machine?.id, machine?.photoPath],
    queryFn: () => (machine ? repo.machinePhotoUrl(machine) : null),
    enabled: !!machine?.photoPath,
    staleTime: 45 * 60_000, // signed URLs live an hour
  });
}

export function useSessionExercises(sessionId: string) {
  const repo = useRepo();
  return useQuery({
    queryKey: ["session-exercises", sessionId],
    queryFn: () => repo.listSessionExercises(sessionId),
    // Fresh for the lifetime of one mount, but never served stale to a later
    // mount (resuming a session must see sets logged since the first fetch).
    staleTime: Number.POSITIVE_INFINITY,
    gcTime: 0,
  });
}

export function useSession(sessionId: string) {
  const repo = useRepo();
  return useQuery({
    queryKey: ["session", sessionId],
    queryFn: () => repo.getSession(sessionId),
  });
}

export function useUpdateSessionStartedAt(sessionId: string) {
  const repo = useRepo();
  const qc = useQueryClient();
  const key = ["session", sessionId];
  return useMutation({
    mutationFn: (startedAt: number) =>
      repo.updateSessionStartedAt(sessionId, startedAt),
    onMutate: (startedAt) => {
      void qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData<Session | null>(key);
      qc.setQueryData<Session | null>(key, (old) =>
        old ? { ...old, startedAt } : old,
      );
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev !== undefined) qc.setQueryData(key, ctx.prev);
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: key });
      void qc.invalidateQueries({ queryKey: ["sessions"] });
      // started_at drives every trend/correlation — recompute.
      void qc.invalidateQueries({ queryKey: ["findings-data"] });
    },
  });
}

export function useUpdateConditions(sessionId: string) {
  const repo = useRepo();
  const qc = useQueryClient();
  const key = ["session", sessionId];
  return useMutation({
    mutationFn: (values: Record<string, unknown>) =>
      repo.updateSessionConditions(sessionId, values),
    // Auto-save fires on every keystroke/tap — reflect it instantly (see
    // useCreateExercise). Replace semantics: callers pass the full value set.
    onMutate: (values) => {
      void qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData<Session | null>(key);
      qc.setQueryData<Session | null>(key, (old) =>
        old ? { ...old, conditionValues: values } : old,
      );
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev !== undefined) qc.setQueryData(key, ctx.prev);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: key }),
  });
}

export function useUpdateSessionNotes(sessionId: string) {
  const repo = useRepo();
  const qc = useQueryClient();
  const key = ["session", sessionId];
  return useMutation({
    mutationFn: (notes: string | null) =>
      repo.updateSessionNotes(sessionId, notes),
    onMutate: (notes) => {
      void qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData<Session | null>(key);
      qc.setQueryData<Session | null>(key, (old) =>
        old ? { ...old, notes } : old,
      );
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev !== undefined) qc.setQueryData(key, ctx.prev);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: key }),
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
    // Optimistic append (see useCreateExercise) — reconciled by the settle
    // invalidate. The real row's id arrives via mutateAsync's return value.
    onMutate: (input) => {
      void qc.cancelQueries({ queryKey: ["metrics"] });
      const prev = qc.getQueryData<Metric[]>(["metrics"]);
      const now = Date.now();
      const optimistic: Metric = {
        id: newId(),
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
        ownerId: null,
        name: input.name,
        type: input.type,
        scope: input.scope,
        unit: input.unit ?? null,
        exerciseIds: null,
      };
      qc.setQueryData<Metric[]>(["metrics"], (old = []) =>
        [...old, optimistic].sort((a, b) => a.name.localeCompare(b.name)),
      );
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(["metrics"], ctx.prev);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["metrics"] }),
  });
}

export function useTrackedConditions() {
  const repo = useRepo();
  return useQuery({
    queryKey: ["tracked-conditions"],
    queryFn: () => repo.listTrackedConditions(),
  });
}

export function useSetConditionTracked() {
  const repo = useRepo();
  const qc = useQueryClient();
  const key = ["tracked-conditions"];
  return useMutation({
    mutationFn: (input: { metricId: string; tracked: boolean }) =>
      repo.setConditionTracked(input.metricId, input.tracked),
    onMutate: ({ metricId, tracked }) => {
      void qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData<TrackedCondition[]>(key);
      const now = Date.now();
      qc.setQueryData<TrackedCondition[]>(key, (old = []) => {
        const existing = old.find((t) => t.metricId === metricId);
        if (existing)
          return old.map((t) =>
            t.metricId === metricId ? { ...t, tracked, updatedAt: now } : t,
          );
        return [
          ...old,
          {
            id: newId(),
            createdAt: now,
            updatedAt: now,
            deletedAt: null,
            ownerId: "",
            metricId,
            tracked,
            position: null,
          },
        ];
      });
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(key, ctx.prev);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: key }),
  });
}

export function useExerciseFavorites() {
  const repo = useRepo();
  return useQuery({
    queryKey: ["exercise-favorites"],
    queryFn: () => repo.listExerciseFavorites(),
  });
}

export function useSetExerciseFavorite() {
  const repo = useRepo();
  const qc = useQueryClient();
  const key = ["exercise-favorites"];
  return useMutation({
    mutationFn: (input: { exerciseId: string; favorite: boolean }) =>
      repo.setExerciseFavorite(input.exerciseId, input.favorite),
    onMutate: ({ exerciseId, favorite }) => {
      void qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData<ExerciseFavorite[]>(key);
      const now = Date.now();
      qc.setQueryData<ExerciseFavorite[]>(key, (old = []) => {
        const existing = old.find((f) => f.exerciseId === exerciseId);
        if (existing)
          return old.map((f) =>
            f.exerciseId === exerciseId
              ? { ...f, favorite, updatedAt: now }
              : f,
          );
        return [
          ...old,
          {
            id: newId(),
            createdAt: now,
            updatedAt: now,
            deletedAt: null,
            ownerId: "",
            exerciseId,
            favorite,
          },
        ];
      });
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(key, ctx.prev);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: key }),
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

export function useActiveSession() {
  const repo = useRepo();
  return useQuery({
    queryKey: ["active-session"],
    queryFn: () => repo.activeSession(),
    staleTime: 0,
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

// Library card "last set" summary — same underlying lookup as ghost prefill,
// with no session-exercise to exclude.
export function useLastSets(exerciseId: string) {
  const repo = useRepo();
  return useQuery({
    queryKey: ["last-sets", exerciseId],
    queryFn: () => repo.lastSetsForExercise(exerciseId),
    staleTime: 60_000,
  });
}
