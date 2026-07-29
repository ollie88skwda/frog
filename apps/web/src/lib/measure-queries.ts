import { type Measurement, type MeasurementPatch, newId } from "@frog/core";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRepo } from "./repo";

const KEY = ["measurements"];

// Newest-first, matching repo.listMeasurements() (order by measured_on desc).
function sortByDateDesc(rows: Measurement[]): Measurement[] {
  return [...rows].sort((a, b) => b.measuredOn.localeCompare(a.measuredOn));
}

export function useMeasurements() {
  const repo = useRepo();
  return useQuery({
    queryKey: KEY,
    queryFn: () => repo.listMeasurements(),
  });
}

// Blank entry with every metric field null — the base an optimistic insert
// starts from before the patch is spread over it (mirrors the server row shape).
function blankMeasurement(measuredOn: string): Measurement {
  const now = Date.now();
  return {
    id: newId(),
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    ownerId: "",
    measuredOn,
    bodyweightKg: null,
    bodyfatPct: null,
    neckCm: null,
    shouldersCm: null,
    chestCm: null,
    waistCm: null,
    abdomenCm: null,
    hipsCm: null,
    bicepLCm: null,
    bicepRCm: null,
    forearmLCm: null,
    forearmRCm: null,
    thighLCm: null,
    thighRCm: null,
    calfLCm: null,
    calfRCm: null,
    photoPath: null,
  };
}

export function useUpsertMeasurement() {
  const repo = useRepo();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      measuredOn,
      patch,
    }: {
      measuredOn: string;
      patch: MeasurementPatch;
    }) => repo.upsertMeasurement(measuredOn, patch),
    // Synchronous optimistic write (see useCreateExercise): the day's entry is
    // updated-or-inserted before the next render so blur-committed fields and
    // the trend graph reflect instantly. Only the provided keys are written —
    // the same partial-merge semantics the repo applies server-side.
    onMutate: ({ measuredOn, patch }) => {
      void qc.cancelQueries({ queryKey: KEY });
      const prev = qc.getQueryData<Measurement[]>(KEY);
      const now = Date.now();
      qc.setQueryData<Measurement[]>(KEY, (old = []) => {
        const existing = old.find((m) => m.measuredOn === measuredOn);
        if (existing)
          return sortByDateDesc(
            old.map((m) =>
              m.measuredOn === measuredOn
                ? { ...m, ...patch, updatedAt: now }
                : m,
            ),
          );
        return sortByDateDesc([
          ...old,
          { ...blankMeasurement(measuredOn), ...patch },
        ]);
      });
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(KEY, ctx.prev);
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: KEY });
      // Bodyweight logged here powers bodyweight-exercise volume + the
      // Bodyweight-condition correlation — keep those computations fresh.
      void qc.invalidateQueries({ queryKey: ["findings-data"] });
    },
  });
}

export function useDeleteMeasurement() {
  const repo = useRepo();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => repo.deleteMeasurement(id),
    onMutate: (id) => {
      void qc.cancelQueries({ queryKey: KEY });
      const prev = qc.getQueryData<Measurement[]>(KEY);
      qc.setQueryData<Measurement[]>(KEY, (old = []) =>
        old.filter((m) => m.id !== id),
      );
      return { prev };
    },
    onError: (_e, _id, ctx) => {
      if (ctx?.prev) qc.setQueryData(KEY, ctx.prev);
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: KEY });
      void qc.invalidateQueries({ queryKey: ["findings-data"] });
    },
  });
}

export function useUploadProgressPhoto() {
  const repo = useRepo();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { measurementId: string; file: Blob }) =>
      repo.uploadProgressPhoto(input.measurementId, input.file),
    // Off the logging hot path — no optimistic write; the thumbnail appears on
    // settle once the signed URL resolves (see useUploadMachinePhoto).
    onSettled: (_d, _e, { measurementId }) => {
      void qc.invalidateQueries({ queryKey: KEY });
      void qc.invalidateQueries({
        queryKey: ["progress-photo", measurementId],
      });
    },
  });
}

// Clears the day's photo but keeps its measurements. Used by the photo
// viewer's Delete; the entry survives with photoPath nulled.
export function useClearProgressPhoto() {
  const repo = useRepo();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (measurementId: string) =>
      repo.clearProgressPhoto(measurementId),
    onMutate: (measurementId) => {
      void qc.cancelQueries({ queryKey: KEY });
      const prev = qc.getQueryData<Measurement[]>(KEY);
      qc.setQueryData<Measurement[]>(KEY, (old = []) =>
        old.map((m) =>
          m.id === measurementId ? { ...m, photoPath: null } : m,
        ),
      );
      return { prev };
    },
    onError: (_e, _id, ctx) => {
      if (ctx?.prev) qc.setQueryData(KEY, ctx.prev);
    },
    onSettled: (_d, _e, measurementId) => {
      void qc.invalidateQueries({ queryKey: KEY });
      void qc.invalidateQueries({
        queryKey: ["progress-photo", measurementId],
      });
    },
  });
}

export function useProgressPhotoUrl(m: Measurement | null | undefined) {
  const repo = useRepo();
  return useQuery({
    queryKey: ["progress-photo", m?.id, m?.photoPath],
    queryFn: () => (m ? repo.progressPhotoUrl(m) : null),
    enabled: !!m?.photoPath,
    staleTime: 45 * 60_000, // signed URLs live an hour
  });
}
