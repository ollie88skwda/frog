import {
  estimateMinutes,
  lastPerformedByRoutine,
  type NewRoutineInput,
  type Routine,
  type RoutineDetail,
  type RoutineFolder,
  type RoutineViewInput,
  viewFromRoutines,
} from "@frog/core";
import {
  useMutation,
  useQueries,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useMemo } from "react";
import { formatDaysAgo } from "./format";
import { useAllSessions } from "./profile-queries";
import { useExercises } from "./queries";
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

// Routines-list summary line (report 8.3): "24 sets · ~52 min · last 2d ago".
// Working sets only (warm-ups are never counted), minutes from the same
// estimator the builder uses (R15/R15b, an estimate, not measured).
export type RoutineSummary = {
  sets: number;
  minutes: { min: number; max: number } | null;
  lastAt: number | null;
};

export function formatRoutineSummary(
  s: RoutineSummary,
  now: number = Date.now(),
): string {
  const parts = [`${s.sets} ${s.sets === 1 ? "set" : "sets"}`];
  if (s.minutes && s.sets > 0) {
    const m = Math.round((s.minutes.min + s.minutes.max) / 2);
    parts.push(`~${m} min`);
  }
  parts.push(
    s.lastAt != null ? `last ${formatDaysAgo(s.lastAt, now)}` : "not done yet",
  );
  return parts.join(" · ");
}

function dataOnly<T>(results: { data: T | undefined }[]): (T | undefined)[] {
  return results.map((r) => r.data);
}

export function useRoutineSummaries(
  routines: readonly Routine[],
): Map<string, RoutineSummary> {
  const repo = useRepo();
  const { data: exercises = [] } = useExercises();
  const { data: sessions = [] } = useAllSessions();
  const details = useQueries({
    queries: routines.map((r) => ({
      queryKey: ["routine-detail", r.id],
      queryFn: () => repo.getRoutineDetail(r.id),
      staleTime: 60_000,
    })),
    combine: dataOnly,
  });
  return useMemo(() => {
    const lookup = new Map(exercises.map((e) => [e.id, e]));
    const last = lastPerformedByRoutine(sessions);
    const out = new Map<string, RoutineSummary>();
    details.forEach((d, i) => {
      const r = routines[i];
      if (!r || !d) return;
      const view = viewFromRoutines(
        [
          {
            id: r.id,
            name: r.name,
            exercises: d.exercises.map((e) => ({
              exerciseId: e.exerciseId,
              restSec: e.restSec,
              sets: e.sets,
            })),
          },
        ],
        lookup,
      );
      const slots = view.sessions[0]?.slots ?? [];
      out.set(r.id, {
        sets: slots.reduce((a, s) => a + s.rx.sets, 0),
        minutes: slots.length ? estimateMinutes(slots) : null,
        lastAt: last.get(r.id) ?? null,
      });
    });
    return out;
  }, [details, routines, exercises, sessions]);
}

/** Sibling routines of a folder as meter inputs (everything but `excludeId`). */
export function useFolderRoutineInputs(
  folderId: string | null | undefined,
  excludeId: string | null,
): RoutineViewInput[] {
  const { data: routines = [] } = useRoutines();
  const repo = useRepo();
  const sibs = useMemo(
    () =>
      folderId
        ? routines
            .filter((r) => r.folderId === folderId && r.id !== excludeId)
            .sort((a, b) => a.position - b.position)
        : [],
    [routines, folderId, excludeId],
  );
  const details = useQueries({
    queries: sibs.map((r) => ({
      queryKey: ["routine-detail", r.id],
      queryFn: () => repo.getRoutineDetail(r.id),
      staleTime: 60_000,
    })),
    combine: dataOnly,
  });
  return useMemo(
    () =>
      sibs.flatMap((r, i) => {
        const d = details[i];
        return d
          ? [
              {
                id: r.id,
                name: r.name,
                exercises: d.exercises.map((e) => ({
                  exerciseId: e.exerciseId,
                  restSec: e.restSec,
                  sets: e.sets,
                })),
              },
            ]
          : [];
      }),
    [sibs, details],
  );
}
