import type {
  NewRoutineInput,
  Routine,
  RoutineDetail,
  RoutineFolder,
} from "@sbl/core";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRepo } from "./repo";

// Routine + folder hooks (Hevy-parity M2). Same optimistic pattern as
// queries.ts: synchronous onMutate → rollback on error → invalidate on settle.
// Kept in their own module so the routines feature stays a lazy chunk.

export function useRoutineFolders() {
  const repo = useRepo();
  return useQuery({
    queryKey: ["routine-folders"],
    queryFn: () => repo.listRoutineFolders(),
  });
}

export function useRoutines() {
  const repo = useRepo();
  return useQuery({
    queryKey: ["routines"],
    queryFn: () => repo.listRoutines(),
  });
}

export function useRoutineDetail(routineId: string | null) {
  const repo = useRepo();
  return useQuery({
    queryKey: ["routine-detail", routineId],
    queryFn: () => (routineId ? repo.getRoutineDetail(routineId) : null),
    enabled: routineId != null,
  });
}

export function useCreateRoutineFolder() {
  const repo = useRepo();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => repo.createRoutineFolder(name),
    onSettled: () => qc.invalidateQueries({ queryKey: ["routine-folders"] }),
  });
}

export function useRenameRoutineFolder() {
  const repo = useRepo();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { id: string; name: string }) =>
      repo.renameRoutineFolder(input.id, input.name),
    onMutate: ({ id, name }) => {
      void qc.cancelQueries({ queryKey: ["routine-folders"] });
      const prev = qc.getQueryData<RoutineFolder[]>(["routine-folders"]);
      qc.setQueryData<RoutineFolder[]>(["routine-folders"], (old = []) =>
        old.map((f) => (f.id === id ? { ...f, name } : f)),
      );
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(["routine-folders"], ctx.prev);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["routine-folders"] }),
  });
}

export function useReorderRoutineFolders() {
  const repo = useRepo();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (ids: string[]) => repo.reorderRoutineFolders(ids),
    onMutate: (ids) => {
      void qc.cancelQueries({ queryKey: ["routine-folders"] });
      const prev = qc.getQueryData<RoutineFolder[]>(["routine-folders"]);
      const byId = new Map(prev?.map((f) => [f.id, f]) ?? []);
      qc.setQueryData<RoutineFolder[]>(
        ["routine-folders"],
        ids.flatMap((id, i) => {
          const f = byId.get(id);
          return f ? [{ ...f, position: i }] : [];
        }),
      );
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(["routine-folders"], ctx.prev);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["routine-folders"] }),
  });
}

export function useDeleteRoutineFolder() {
  const repo = useRepo();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => repo.deleteRoutineFolder(id),
    onMutate: (id) => {
      void qc.cancelQueries({ queryKey: ["routine-folders"] });
      const prev = qc.getQueryData<RoutineFolder[]>(["routine-folders"]);
      qc.setQueryData<RoutineFolder[]>(["routine-folders"], (old = []) =>
        old.filter((f) => f.id !== id),
      );
      // Its routines become unfiled.
      const prevRoutines = qc.getQueryData<Routine[]>(["routines"]);
      qc.setQueryData<Routine[]>(["routines"], (old = []) =>
        old.map((r) => (r.folderId === id ? { ...r, folderId: null } : r)),
      );
      return { prev, prevRoutines };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(["routine-folders"], ctx.prev);
      if (ctx?.prevRoutines) qc.setQueryData(["routines"], ctx.prevRoutines);
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: ["routine-folders"] });
      void qc.invalidateQueries({ queryKey: ["routines"] });
    },
  });
}

export function useCreateRoutine() {
  const repo = useRepo();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: NewRoutineInput) => repo.createRoutine(input),
    onSettled: () => qc.invalidateQueries({ queryKey: ["routines"] }),
  });
}

export function useUpdateRoutine() {
  const repo = useRepo();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { routineId: string; patch: NewRoutineInput }) =>
      repo.updateRoutine(input.routineId, input.patch),
    onSettled: (_d, _e, { routineId }) => {
      void qc.invalidateQueries({ queryKey: ["routines"] });
      void qc.invalidateQueries({ queryKey: ["routine-detail", routineId] });
    },
  });
}

export function useMoveRoutine() {
  const repo = useRepo();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { routineId: string; folderId: string | null }) =>
      repo.moveRoutine(input.routineId, input.folderId),
    onMutate: ({ routineId, folderId }) => {
      void qc.cancelQueries({ queryKey: ["routines"] });
      const prev = qc.getQueryData<Routine[]>(["routines"]);
      qc.setQueryData<Routine[]>(["routines"], (old = []) =>
        old.map((r) => (r.id === routineId ? { ...r, folderId } : r)),
      );
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(["routines"], ctx.prev);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["routines"] }),
  });
}

export function useReorderRoutines() {
  const repo = useRepo();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (ids: string[]) => repo.reorderRoutines(ids),
    onMutate: (ids) => {
      void qc.cancelQueries({ queryKey: ["routines"] });
      const prev = qc.getQueryData<Routine[]>(["routines"]);
      const order = new Map(ids.map((id, i) => [id, i]));
      qc.setQueryData<Routine[]>(["routines"], (old = []) =>
        [...old].sort(
          (a, b) =>
            (order.get(a.id) ?? a.position) - (order.get(b.id) ?? b.position),
        ),
      );
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(["routines"], ctx.prev);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["routines"] }),
  });
}

export function useDuplicateRoutine() {
  const repo = useRepo();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (routineId: string) => repo.duplicateRoutine(routineId),
    onSettled: () => qc.invalidateQueries({ queryKey: ["routines"] }),
  });
}

export function useDeleteRoutine() {
  const repo = useRepo();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (routineId: string) => repo.deleteRoutine(routineId),
    onMutate: (routineId) => {
      void qc.cancelQueries({ queryKey: ["routines"] });
      const prev = qc.getQueryData<Routine[]>(["routines"]);
      qc.setQueryData<Routine[]>(["routines"], (old = []) =>
        old.filter((r) => r.id !== routineId),
      );
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(["routines"], ctx.prev);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["routines"] }),
  });
}

export type { RoutineDetail };
