// Template (+ philosophy, answers, user overrides) → the flat `ProgramView`
// that volume/validate/deload read. Pure. A saved program's routines can be
// turned into the same view (`viewFromRoutines`) so the meter works for any
// program, not just builder ones.

import { PROGRAM_RULES as R } from "./rules";
import type {
  BuilderAnswers,
  Philosophy,
  ProgramTemplate,
  ProgramView,
  SlotOverride,
  SlotPrescription,
  SlotTemplate,
  ViewSession,
  ViewSlot,
} from "./types";
import { DEFAULT_PHILOSOPHY } from "./types";

export type ViewOptions = {
  philosophy?: Philosophy;
  /** `schedule`, `goal` and `minutes` shape the view; the rest picks the template. */
  answers?: Partial<Pick<BuilderAnswers, "schedule" | "goal" | "minutes">>;
  overrides?: readonly SlotOverride[];
};

/** R18b: roughly a third of normal sets, min 1 per exercise. */
export function maintainSets(sets: number): number {
  return Math.max(1, Math.ceil(sets * R.maintainShare));
}

function clampSets(n: number): number {
  return Math.max(1, Math.round(n));
}

/** Reps for a slot under the rep-bias switch (D4). */
export function repsFor(
  slot: Pick<SlotTemplate, "role" | "heavyReps" | "rx">,
  repBias: Philosophy["repBias"],
): [number, number] {
  if (repBias === "heavy" && slot.heavyReps) return [...slot.heavyReps];
  return [...slot.rx.reps];
}

function applyOverrides(
  slot: ViewSlot,
  sessionId: string,
  overrides: readonly SlotOverride[],
): ViewSlot | null {
  let out = slot;
  for (const o of overrides) {
    if (o.slot !== slot.slot) continue;
    if (o.session != null && o.session !== sessionId) continue;
    if (o.remove) return null;
    const rx: SlotPrescription = {
      ...out.rx,
      ...(o.sets != null ? { sets: clampSets(o.sets) } : null),
      ...(o.reps ? { reps: o.reps } : null),
      ...(o.rir ? { rir: o.rir } : null),
      ...(o.restSec ? { restSec: o.restSec } : null),
    };
    out = { ...out, rx };
  }
  return out;
}

export function viewOf(
  template: ProgramTemplate,
  opts: ViewOptions = {},
): ProgramView {
  const philosophy =
    opts.philosophy ?? template.philosophy ?? DEFAULT_PHILOSOPHY;
  const goal = opts.answers?.goal ?? template.goal;
  const overrides = opts.overrides ?? [];

  const sessions: ViewSession[] = template.sessions.map((s) => ({
    id: s.id,
    name: s.name,
    slots: s.slots.flatMap((slot) => {
      if (slot.onlySessions && !slot.onlySessions.includes(s.id)) return [];
      const baseSets = slot.perSession?.[s.id]?.sets ?? slot.rx.sets;
      const sets = goal === "maintain" ? maintainSets(baseSets) : baseSets;
      const base: ViewSlot = {
        slot: slot.slot,
        role: slot.role,
        credits: slot.credits,
        region: slot.region,
        rx: {
          ...slot.rx,
          sets,
          reps: repsFor(slot, philosophy.repBias),
        },
        firstSetMax: slot.firstSetMax,
        rules: slot.rules,
      };
      const v = applyOverrides(base, s.id, overrides);
      return v ? [v] : [];
    }),
  }));

  return {
    schedule: opts.answers?.schedule ?? template.schedule,
    rotation: template.rotation,
    sessions,
    block: template.block,
    goal,
    philosophy: { repBias: philosophy.repBias, firstSet: philosophy.firstSet },
    maxMinutes: opts.answers?.minutes,
  };
}
