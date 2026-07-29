import type { GeneratedProgram, GeneratorConfig, Program } from "@frog/core";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRepo } from "./repo";

// Programs feature data seam (Hevy-parity M11). A program is a provenance row
// tying a routine folder (of materialized routines) to a generator config or a
// catalog key. Materialization is a heavy multi-step setup action (folder →
// routines → program row) run off the logging hot path, so these mutations
// await sequentially and reconcile via invalidation rather than optimistic
// writes. Kept in its own module so /programs + /trainer stay lazy chunks.

export function useActiveProgram() {
  const repo = useRepo();
  return useQuery({
    queryKey: ["active-program"],
    queryFn: () => repo.activeProgram(),
  });
}

export function usePrograms() {
  const repo = useRepo();
  return useQuery({
    queryKey: ["programs"],
    queryFn: () => repo.listPrograms(),
  });
}

function invalidatePrograms(qc: ReturnType<typeof useQueryClient>) {
  void qc.invalidateQueries({ queryKey: ["routines"] });
  void qc.invalidateQueries({ queryKey: ["routine-folders"] });
  void qc.invalidateQueries({ queryKey: ["programs"] });
  void qc.invalidateQueries({ queryKey: ["active-program"] });
}

export type MaterializeInput = {
  /** The generated routine graph (from generateProgram). */
  program: GeneratedProgram;
  source: "generated" | "library";
  /** Questionnaire answers for generated programs (null for catalog imports). */
  config?: GeneratorConfig | null;
  libraryKey?: string | null;
  /** Folder name override (catalog programs use their catalog name, not the
   *  generic generated "Goal · N×/week" label). Defaults to program.name. */
  name?: string;
};

// Create the folder, its routines (in order — position follows creation), then
// the program row (which auto-deactivates any prior active program). Returns
// the new program so the caller can route into the Trainer / Train tab.
export function useMaterializeProgram() {
  const repo = useRepo();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      program,
      source,
      config,
      libraryKey,
      name,
    }: MaterializeInput): Promise<Program> => {
      const folder = await repo.createRoutineFolder(name ?? program.name);
      for (const r of program.routines) {
        await repo.createRoutine({
          name: r.name,
          folderId: folder.id,
          exercises: r.exercises,
        });
      }
      return repo.createProgram({
        source,
        folderId: folder.id,
        config: config ? (config as unknown as Record<string, unknown>) : null,
        libraryKey: libraryKey ?? null,
      });
    },
    onSettled: () => invalidatePrograms(qc),
  });
}

// Program Settings → change config → rebuild the folder's routines in place.
// Destructive (old routines are soft-deleted and their history detaches from
// the routine); the caller confirms first.
export function useRegenerateProgram() {
  const repo = useRepo();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      programId,
      folderId,
      program,
      config,
    }: {
      programId: string;
      folderId: string;
      program: GeneratedProgram;
      config: GeneratorConfig;
    }) => {
      const existing = (await repo.listRoutines()).filter(
        (r) => r.folderId === folderId,
      );
      for (const r of existing) await repo.deleteRoutine(r.id);
      for (const r of program.routines) {
        await repo.createRoutine({
          name: r.name,
          folderId,
          exercises: r.exercises,
        });
      }
      await repo.updateProgramConfig(
        programId,
        config as unknown as Record<string, unknown>,
      );
    },
    onSettled: () => invalidatePrograms(qc),
  });
}

export function useDeleteProgram() {
  const repo = useRepo();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (programId: string) => repo.deleteProgram(programId),
    onSettled: () => invalidatePrograms(qc),
  });
}

// Trainer "Don't recommend again" flag (exercise_prefs.generatorExcluded). The
// caller then regenerates the slot with the next-best alternative.
export function useSetGeneratorExcluded() {
  const repo = useRepo();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { exerciseId: string; excluded: boolean }) =>
      repo.setGeneratorExcluded(input.exerciseId, input.excluded),
    onSettled: () =>
      void qc.invalidateQueries({ queryKey: ["exercise-prefs"] }),
  });
}
