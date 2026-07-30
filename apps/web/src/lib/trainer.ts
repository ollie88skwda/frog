import {
  type Exercise,
  type NewRoutineInput,
  nextPrescription,
  type OverloadResult,
  type PerformedSet,
  type Program,
  type RecordsResult,
  type Routine,
  type RoutineDetail,
  type RoutineExerciseInput,
  type SelectableExercise,
  suggestRoutineId,
  tierRank,
} from "@frog/core";
import { useQueries } from "@tanstack/react-query";
import { useMemo } from "react";
import { useAllSessions } from "./profile-queries";
import { useExercises } from "./queries";
import { useRepo } from "./repo";
import { useRoutines } from "./routine-queries";

// Pure Trainer glue (Hevy-parity M11): rank exercise alternatives, rebuild a
// routine template after a replace/remove/overload edit, and compute the
// progressive-overload prescription per routine from its last performance.
// Framework-free helpers below; the composite data hook is at the bottom.

/** Exercise rows → the minimal shape the generator + alternative-ranker read. */
export function selectableFrom(exercises: Exercise[]): SelectableExercise[] {
  return exercises.map((e) => ({
    id: e.id,
    name: e.name,
    isCustom: e.isCustom,
    equipment: e.equipment,
    exerciseType: e.exerciseType,
    muscleTargets: e.muscleTargets,
  }));
}

/**
 * Tier-ranked alternatives for a slot's primary muscle (same logic the
 * generator uses to fill a slot): curated S/A tiers first, seeds before
 * customs, deterministic name tiebreak. Equipment-filtered when provided.
 */
export function rankAlternatives(
  library: SelectableExercise[],
  muscle: string,
  opts: { excludeIds?: Set<string>; equipment?: string[]; limit?: number } = {},
): SelectableExercise[] {
  const excluded = opts.excludeIds ?? new Set<string>();
  const equip = opts.equipment ? new Set(opts.equipment) : null;
  const cands = library.filter(
    (e) =>
      !excluded.has(e.id) &&
      e.muscleTargets?.[0]?.muscle === muscle &&
      (e.exerciseType === "weight_reps" ||
        e.exerciseType === "bodyweight_reps" ||
        e.exerciseType === "weighted_bodyweight") &&
      (equip == null ||
        e.equipment == null ||
        e.equipment === "bodyweight" ||
        e.equipment === "other" ||
        equip.has(e.equipment)),
  );
  cands.sort((a, b) => {
    const t =
      tierRank(a.muscleTargets?.[0]?.tier as never) -
      tierRank(b.muscleTargets?.[0]?.tier as never);
    if (t !== 0) return t;
    if (a.isCustom !== b.isCustom) return a.isCustom ? 1 : -1;
    return a.name.localeCompare(b.name);
  });
  return opts.limit ? cands.slice(0, opts.limit) : cands;
}

// A routine exercise carried in-memory while the Trainer edits a template,
// annotated with the source row id + display name so replace/remove/overload
// can target it. Extra fields are ignored by updateRoutine (structural typing).
export type EditableExercise = RoutineExerciseInput & {
  detailId: string;
  exerciseName: string;
};

/** Faithful RoutineDetail → editable exercise list (order-sorted). */
export function editableExercises(detail: RoutineDetail): EditableExercise[] {
  return detail.exercises
    .slice()
    .sort((a, b) => a.orderIndex - b.orderIndex)
    .map((ex) => ({
      detailId: ex.id,
      exerciseName: ex.exerciseName,
      exerciseId: ex.exerciseId,
      orderIndex: ex.orderIndex,
      supersetGroup: ex.supersetGroup,
      restSec: ex.restSec,
      note: ex.note,
      sets: ex.sets
        .slice()
        .sort((a, b) => a.setNo - b.setNo)
        .map((s) => ({
          setNo: s.setNo,
          setType: s.setType,
          targetWeightKg: s.targetWeightKg,
          targetReps: s.targetReps,
          targetRepsMax: s.targetRepsMax,
          targetDurationSec: s.targetDurationSec,
          targetDistanceM: s.targetDistanceM,
        })),
    }));
}

/** Re-index order/set numbers and drop annotations → an updateRoutine payload. */
export function buildRoutineInput(
  routine: Routine,
  exercises: RoutineExerciseInput[],
): NewRoutineInput {
  return {
    name: routine.name,
    folderId: routine.folderId,
    description: routine.description,
    exercises: exercises.map((ex, i) => ({
      exerciseId: ex.exerciseId,
      orderIndex: i,
      supersetGroup: ex.supersetGroup ?? null,
      restSec: ex.restSec ?? null,
      note: ex.note ?? null,
      sets: ex.sets.map((s, si) => ({ ...s, setNo: si })),
    })),
  };
}

/**
 * Starting working weights for a generated program: 85% of the exercise's
 * heaviest-ever logged weight, rounded to the nearest 2.5 kg (a conservative
 * working weight seed so the overload rule has room to progress). Exercises
 * with no history are left unset (null target weight).
 */
export function startingWeightsFrom(
  records: RecordsResult,
): Map<string, number> {
  const map = new Map<string, number>();
  for (const [id, rec] of records.byExercise) {
    const heaviest = rec.bests.heaviest_weight?.value;
    if (heaviest == null || heaviest <= 0) continue;
    const w = Math.round((heaviest * 0.85) / 2.5) * 2.5;
    if (w > 0) map.set(id, w);
  }
  return map;
}

export type ExerciseOverload = {
  detailId: string;
  exerciseId: string;
  exerciseName: string;
  result: OverloadResult;
};

/** Overload prescription per routine exercise from its last performance. */
export function overloadForRoutine(
  detail: RoutineDetail,
  performedByExercise: Map<string, PerformedSet[]>,
  equipmentByExercise: Map<string, string | null>,
): ExerciseOverload[] {
  return editableExercises(detail).map((ex) => ({
    detailId: ex.detailId,
    exerciseId: ex.exerciseId,
    exerciseName: ex.exerciseName,
    result: nextPrescription(
      // editableExercises already order-sorts; targets carry all the fields
      // nextPrescription reads (setNo/setType/target*).
      ex.sets.map((s) => ({
        setNo: s.setNo,
        setType: s.setType ?? "normal",
        targetWeightKg: s.targetWeightKg ?? null,
        targetReps: s.targetReps ?? null,
        targetRepsMax: s.targetRepsMax ?? null,
      })),
      performedByExercise.get(ex.exerciseId) ?? [],
      equipmentByExercise.get(ex.exerciseId) ?? null,
    ),
  }));
}

// ── Composite data hook ─────────────────────────────────────────────────────

export type TrainerData = {
  /** Program folder's routines, ordered by position. */
  routines: Routine[];
  detailByRoutine: Map<string, RoutineDetail>;
  overloadByRoutine: Map<string, ExerciseOverload[]>;
  /** Newest completed session per routine (last performance provenance). */
  lastByRoutine: Map<string, { endedAt: number; sessionId: string }>;
  /** Next workout: the folder routine whose last completion is oldest. */
  nextRoutine: Routine | null;
  loading: boolean;
};

/**
 * Assembles everything the Trainer dashboard needs for the active program:
 * the folder's routines, each routine's template detail, and each routine's
 * last-performance overload prescription. Bounded fan-out (a program has 2–6
 * routines) on a lazy route, so parallel per-routine fetches are fine.
 */
export function useTrainerData(program: Program | null): TrainerData {
  const repo = useRepo();
  const { data: allRoutines = [], isLoading: rLoading } = useRoutines();
  const { data: sessions = [], isLoading: sLoading } = useAllSessions();
  const { data: exercises = [] } = useExercises();

  const routines = useMemo(
    () =>
      program
        ? allRoutines
            .filter((r) => r.folderId === program.folderId)
            .sort((a, b) => a.position - b.position)
        : [],
    [allRoutines, program],
  );

  // Newest completed session per routine in the program.
  const lastByRoutine = useMemo(() => {
    const map = new Map<string, { endedAt: number; sessionId: string }>();
    for (const s of sessions) {
      if (!s.routineId || s.endedAt == null) continue;
      const cur = map.get(s.routineId);
      if (!cur || s.endedAt > cur.endedAt)
        map.set(s.routineId, { endedAt: s.endedAt, sessionId: s.id });
    }
    return map;
  }, [sessions]);

  const detailQueries = useQueries({
    queries: routines.map((r) => ({
      queryKey: ["routine-detail", r.id],
      queryFn: () => repo.getRoutineDetail(r.id),
    })),
  });

  // The last session of each program routine, for overload performance.
  const lastSessionIds = useMemo(
    () =>
      routines
        .map((r) => lastByRoutine.get(r.id)?.sessionId)
        .filter((id): id is string => !!id),
    [routines, lastByRoutine],
  );
  const perfQueries = useQueries({
    queries: lastSessionIds.map((id) => ({
      queryKey: ["session-exercises", id],
      queryFn: () => repo.listSessionExercises(id),
      staleTime: 60_000,
    })),
  });

  const detailByRoutine = useMemo(() => {
    const map = new Map<string, RoutineDetail>();
    detailQueries.forEach((q, i) => {
      if (q.data) map.set(routines[i].id, q.data);
    });
    return map;
  }, [detailQueries, routines]);

  const overloadByRoutine = useMemo(() => {
    const equipMap = new Map<string, string | null>(
      exercises.map((e) => [e.id, e.equipment]),
    );
    // sessionId → (exerciseId → performed sets)
    const perfBySession = new Map<string, Map<string, PerformedSet[]>>();
    perfQueries.forEach((q, i) => {
      const sid = lastSessionIds[i];
      if (!q.data) return;
      const byExercise = new Map<string, PerformedSet[]>();
      for (const block of q.data) {
        byExercise.set(
          block.exerciseId,
          block.sets.map((s) => ({
            setNo: s.setNo,
            weightKg: s.weightKg,
            reps: s.reps,
            setType: s.setType,
          })),
        );
      }
      perfBySession.set(sid, byExercise);
    });

    const map = new Map<string, ExerciseOverload[]>();
    for (const r of routines) {
      const detail = detailByRoutine.get(r.id);
      if (!detail) continue;
      const last = lastByRoutine.get(r.id);
      const perf = last
        ? (perfBySession.get(last.sessionId) ??
          new Map<string, PerformedSet[]>())
        : new Map<string, PerformedSet[]>();
      map.set(r.id, overloadForRoutine(detail, perf, equipMap));
    }
    return map;
  }, [
    perfQueries,
    lastSessionIds,
    exercises,
    routines,
    detailByRoutine,
    lastByRoutine,
  ]);

  // Shared with the Home hero — `suggestRoutineId` is the single definition of
  // "what's next" so the two screens can never disagree (domain/plan.ts).
  const nextRoutine = useMemo(() => {
    const lastPerformed = new Map(
      [...lastByRoutine].map(([id, v]) => [id, v.endedAt] as const),
    );
    const id = suggestRoutineId(routines, lastPerformed);
    return routines.find((r) => r.id === id) ?? null;
  }, [routines, lastByRoutine]);

  return {
    routines,
    detailByRoutine,
    overloadByRoutine,
    lastByRoutine,
    nextRoutine,
    loading: rLoading || sLoading || detailQueries.some((q) => q.isLoading),
  };
}
