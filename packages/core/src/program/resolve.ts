// Template → concrete routines. Pure: takes the exercise library as data.
// Output is the existing `GeneratedProgram` so `useMaterializeProgram`
// (folder → routines → program row) is unchanged. No supersets are emitted
// (DECISIONS 2026-08-12). Name lookup uses the repo's one matcher
// (`domain/match-exercise.ts`), never a second one.

import { sameExerciseName } from "../domain/match-exercise";
import type { GeneratedProgram, SelectableExercise } from "../generator/types";
import type { RoutineExerciseInput, RoutineSetInput } from "../repo/types";
import { PROGRAM_RULES as R } from "./rules";
import type {
  BuilderAnswers,
  MenuEntry,
  Philosophy,
  ProgramTemplate,
  SlotOverride,
  SlotStability,
  ViewSlot,
} from "./types";
import { DEFAULT_PHILOSOPHY } from "./types";
import { viewOf } from "./view";

const STABILITY_RANK: Record<SlotStability, number> = {
  stable: 0,
  moderate: 1,
  free: 2,
};

export type ResolveOptions = {
  philosophy?: Philosophy;
  answers?: Pick<BuilderAnswers, "goal" | "minutes" | "equipment"> &
    Partial<Pick<BuilderAnswers, "schedule">>;
  overrides?: readonly SlotOverride[];
  excludedIds?: ReadonlySet<string>;
  /** Starting working weights from records history (exerciseId → kg). */
  startingWeightsKg?: ReadonlyMap<string, number>;
};

export type UnresolvedSlot = { session: string; slot: string };

export type ResolvedProgram = {
  program: GeneratedProgram;
  /** Slots with no available exercise (equipment filter, empty library). */
  unresolved: UnresolvedSlot[];
  /** slot id → chosen menu entry, per session id (for "Why this exercise"). */
  chosen: Record<string, Record<string, MenuEntry>>;
};

const REP_TYPES = new Set([
  "weight_reps",
  "bodyweight_reps",
  "weighted_bodyweight",
]);

function available(
  e: SelectableExercise,
  equipment: ReadonlySet<string> | null,
  excluded: ReadonlySet<string>,
): boolean {
  if (excluded.has(e.id) || !REP_TYPES.has(e.exerciseType)) return false;
  if (!equipment) return true;
  return (
    e.equipment == null ||
    e.equipment === "bodyweight" ||
    e.equipment === "other" ||
    equipment.has(e.equipment)
  );
}

/** Best library exercise for a slot's menu: stable-first, then menu order. */
export function pickMenuEntry(
  menu: readonly MenuEntry[],
  pool: readonly SelectableExercise[],
): { entry: MenuEntry; exercise: SelectableExercise } | null {
  const ranked = menu
    .map((entry, i) => ({ entry, i }))
    .sort(
      (a, b) =>
        STABILITY_RANK[a.entry.stability] - STABILITY_RANK[b.entry.stability] ||
        a.i - b.i,
    );
  for (const { entry } of ranked) {
    const hit = pool.find(
      (e) => !e.isCustom && sameExerciseName(e.name, entry.matchKey),
    );
    if (hit) return { entry, exercise: hit };
  }
  return null;
}

/**
 * Set targets for a slot. Top-set-first (a method, not a research rule, T5):
 * "top" puts set 1 at RIR 1 and the rest at 2-3; "max" puts set 1 at 0-1.
 * Only compound slots flagged `firstSetMax` take it; isolation stays flat.
 */
export function setTargets(
  slot: Pick<ViewSlot, "rx" | "firstSetMax">,
  firstSet: Philosophy["firstSet"],
): { reps: [number, number]; rirMin: number; rirMax: number }[] {
  const { sets, reps, rir } = slot.rx;
  const topFirst = firstSet !== "off" && slot.firstSetMax && sets > 1;
  const first: [number, number] =
    firstSet === "max" ? [0, 1] : [R.rirFloorCompound, R.rirFloorCompound];
  const rest: [number, number] = [Math.max(2, rir[0]), Math.max(2, rir[1])];
  return Array.from({ length: sets }, (_, i) => {
    const [rirMin, rirMax] = topFirst ? (i === 0 ? first : rest) : rir;
    return { reps: [reps[0], reps[1]], rirMin, rirMax };
  });
}

export function resolveTemplate(
  template: ProgramTemplate,
  library: readonly SelectableExercise[],
  opts: ResolveOptions = {},
): ResolvedProgram {
  const philosophy =
    opts.philosophy ?? template.philosophy ?? DEFAULT_PHILOSOPHY;
  const view = viewOf(template, {
    philosophy,
    answers: opts.answers,
    overrides: opts.overrides,
  });
  const equipment = opts.answers?.equipment
    ? new Set<string>(opts.answers.equipment)
    : null;
  const pool = library.filter((e) =>
    available(e, equipment, opts.excludedIds ?? new Set()),
  );
  const unresolved: UnresolvedSlot[] = [];
  const chosen: ResolvedProgram["chosen"] = {};

  const routines = view.sessions.map((vs) => {
    const tpl = template.sessions.find((s) => s.id === vs.id);
    const used = new Set<string>();
    const exercises: RoutineExerciseInput[] = [];
    for (const slot of vs.slots) {
      const tslot = tpl?.slots.find((x) => x.slot === slot.slot);
      const pinned = [...(opts.overrides ?? [])]
        .reverse()
        .find(
          (o) =>
            o.slot === slot.slot &&
            o.exerciseId &&
            (o.session == null || o.session === vs.id),
        )?.exerciseId;
      let exercise: SelectableExercise | undefined;
      if (pinned) exercise = library.find((e) => e.id === pinned);
      let entry: MenuEntry | undefined;
      if (!exercise && tslot) {
        const hit = pickMenuEntry(
          tslot.menu,
          pool.filter((e) => !used.has(e.id)),
        );
        if (hit) {
          exercise = hit.exercise;
          entry = hit.entry;
        }
      }
      if (!exercise) {
        unresolved.push({ session: vs.id, slot: slot.slot });
        continue;
      }
      used.add(exercise.id);
      if (entry) {
        chosen[vs.id] ??= {};
        chosen[vs.id][slot.slot] = entry;
      }
      const startKg = opts.startingWeightsKg?.get(exercise.id) ?? null;
      const targets = setTargets(slot, philosophy.firstSet);
      const sets: RoutineSetInput[] = targets.map((t, i) => ({
        setNo: i,
        setType: "normal",
        targetWeightKg: startKg,
        targetReps: t.reps[0],
        targetRepsMax: t.reps[1],
        targetRirMin: t.rirMin,
        targetRirMax: t.rirMax,
      }));
      exercises.push({
        exerciseId: exercise.id,
        orderIndex: exercises.length,
        restSec: Math.round((slot.rx.restSec[0] + slot.rx.restSec[1]) / 2),
        note: null,
        supersetGroup: null,
        sets,
      });
    }
    return {
      name:
        template.sessions.length > 1
          ? `${template.name} · ${vs.name}`
          : template.name,
      exercises,
    };
  });

  return { program: { name: template.name, routines }, unresolved, chosen };
}
