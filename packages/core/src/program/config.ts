// Runtime guard for `programs.config` (json column, no schema change, §9.4).
// Zod-free on purpose (bundle). Returns null for anything that is not a
// builder config, so legacy generator configs and old rows stay readable.

import { PROGRAM_RULES as R } from "./rules";
import type {
  BuilderAnswers,
  FixedBlock,
  Philosophy,
  ProgramSchedule,
  ProgramTemplate,
  SavedProgramConfig,
  SlotOverride,
} from "./types";
import { DEFAULT_PHILOSOPHY } from "./types";

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);
const isNum = (v: unknown): v is number =>
  typeof v === "number" && Number.isFinite(v);
const isRange = (v: unknown): v is [number, number] =>
  Array.isArray(v) && v.length === 2 && v.every(isNum);

function parseSchedule(v: unknown): ProgramSchedule | null {
  if (!isObj(v)) return null;
  if (
    v.kind === "interval" &&
    (v.everyDays === 1 || v.everyDays === 2 || v.everyDays === 3)
  )
    return { kind: "interval", everyDays: v.everyDays };
  if (
    v.kind === "weekdays" &&
    Array.isArray(v.days) &&
    v.days.every((d) => Number.isInteger(d) && d >= 0 && d <= 6)
  )
    return { kind: "weekdays", days: v.days as never };
  return null;
}

function parseAnswers(v: unknown): BuilderAnswers | null {
  if (!isObj(v)) return null;
  const schedule = parseSchedule(v.schedule);
  if (!schedule) return null;
  if (!["muscle", "strength", "general", "maintain"].includes(v.goal as string))
    return null;
  if (!["new", "intermediate", "experienced"].includes(v.status as string))
    return null;
  if (
    !Array.isArray(v.equipment) ||
    !v.equipment.every((e) => typeof e === "string")
  )
    return null;
  if (![30, 45, 60, 75, 90].includes(v.minutes as number)) return null;
  return v as unknown as BuilderAnswers;
}

function parseOverride(v: unknown): SlotOverride | null {
  if (!isObj(v) || typeof v.slot !== "string") return null;
  const o: SlotOverride = { slot: v.slot };
  if (typeof v.session === "string") o.session = v.session;
  if (isNum(v.sets)) o.sets = v.sets;
  if (isRange(v.reps)) o.reps = v.reps;
  if (isRange(v.rir)) o.rir = v.rir;
  if (isRange(v.restSec)) o.restSec = v.restSec;
  if (typeof v.exerciseId === "string") o.exerciseId = v.exerciseId;
  if (v.remove === true) o.remove = true;
  return o;
}

export function parseSavedProgramConfig(v: unknown): SavedProgramConfig | null {
  if (!isObj(v) || typeof v.templateId !== "string") return null;
  const answers = parseAnswers(v.answers);
  if (!answers) return null;
  const ph = isObj(v.philosophy) ? v.philosophy : {};
  const philosophy: Philosophy = {
    firstSet: ["off", "top", "max"].includes(ph.firstSet as string)
      ? (ph.firstSet as Philosophy["firstSet"])
      : DEFAULT_PHILOSOPHY.firstSet,
    repBias: ph.repBias === "research" ? "research" : "heavy",
    grouping: ph.grouping === "region" ? "region" : "joint_action",
  };
  const b = isObj(v.block) ? v.block : {};
  const everyWeeks = isNum(b.everyWeeks)
    ? Math.min(
        R.deloadIntervalWeeks[1],
        Math.max(R.deloadIntervalWeeks[0], Math.round(b.everyWeeks)),
      )
    : 6;
  const fixed = isObj(b.fixed) ? (b.fixed as unknown as FixedBlock) : undefined;
  const overrides = Array.isArray(v.overrides)
    ? v.overrides.map(parseOverride).filter((o): o is SlotOverride => o != null)
    : [];
  return {
    templateId: v.templateId,
    answers,
    philosophy,
    block: {
      startedAt: isNum(b.startedAt) ? b.startedAt : null,
      everyWeeks,
      ...(fixed ? { fixed } : null),
    },
    overrides,
  };
}

/** The config to store on save. `startedAt` begins the block clock (F11). */
export function buildSavedConfig(
  template: ProgramTemplate,
  answers: BuilderAnswers,
  opts: {
    philosophy?: Philosophy;
    overrides?: readonly SlotOverride[];
    startedAt?: number | null;
    everyWeeks?: number;
  } = {},
): SavedProgramConfig {
  return {
    templateId: template.id,
    answers,
    philosophy: opts.philosophy ?? template.philosophy,
    block: {
      startedAt: opts.startedAt ?? null,
      everyWeeks: opts.everyWeeks ?? template.block.deload.everyWeeks,
      ...(template.block.kind === "fixed"
        ? { fixed: template.block.fixed }
        : null),
    },
    overrides: [...(opts.overrides ?? [])],
  };
}
