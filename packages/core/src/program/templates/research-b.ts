// Program B: full body 3×/week (Mon/Wed/Fri), programs/full-body-3x-week.md.
// The cable-curl + overhead-extension "superset" of the doc is two ordinary
// slots (7a, 7b): Frog no longer offers supersets (DECISIONS 2026-08-12).

import { DEFAULT_DELOAD_RULE } from "../deload";
import type { ProgramTemplate, SessionTemplate, SlotTemplate } from "../types";
import {
  SLOT_CABLE_CURL,
  SLOT_CALF,
  SLOT_HIP_THRUST,
  SLOT_INCLINE_PRESS,
  SLOT_LATERAL_RAISE,
  SLOT_LEG_EXT,
  SLOT_LEG_PRESS,
  SLOT_OVERHEAD_TRICEPS,
  SLOT_PULL,
  SLOT_RDL,
  SLOT_SEATED_CURL,
} from "./slots";

const withSets = (
  s: SlotTemplate,
  slot: string,
  perSession?: SlotTemplate["perSession"],
  onlySessions?: string[],
): SlotTemplate => ({ ...s, slot, perSession, onlySessions });

/** Slot order follows the doc: 1, 1b, 2, 3, 4, 5, 6, 7a/7b, 8, 9. */
export const PROGRAM_B_SLOTS: SlotTemplate[] = [
  withSets(SLOT_LEG_PRESS, "1"),
  withSets(SLOT_LEG_EXT, "1b"),
  withSets(SLOT_RDL, "2"),
  withSets(SLOT_INCLINE_PRESS, "3", { mon: { sets: 4 } }),
  withSets(SLOT_PULL, "4", { wed: { sets: 4 } }),
  withSets(SLOT_LATERAL_RAISE, "5", { fri: { sets: 4 } }),
  withSets(SLOT_SEATED_CURL, "6"),
  withSets(SLOT_CABLE_CURL, "7a"),
  withSets(SLOT_OVERHEAD_TRICEPS, "7b"),
  withSets(SLOT_CALF, "8", {
    mon: { sets: 4 },
    wed: { sets: 3 },
    fri: { sets: 3 },
  }),
  withSets(SLOT_HIP_THRUST, "9", undefined, ["wed"]),
];

export const PROGRAM_B_SESSIONS: SessionTemplate[] = [
  { id: "mon", name: "Monday", slots: PROGRAM_B_SLOTS },
  { id: "wed", name: "Wednesday", slots: PROGRAM_B_SLOTS },
  { id: "fri", name: "Friday", slots: PROGRAM_B_SLOTS },
];

/** Weekly fractional sets, weeks 1-5, from the program doc. */
export const PROGRAM_B_WEEKLY: Record<string, number> = {
  quads: 15,
  hamstrings: 15.5,
  glutes: 10,
  "upper-pecs": 10,
  lats: 10,
  "mid-traps-rhomboids": 10,
  "side-delts": 10,
  triceps: 11,
  biceps: 11,
  calves: 10,
};

export const RESEARCH_B: ProgramTemplate = {
  id: "research-b",
  name: "Research B: full body 3× a week",
  summary:
    "Monday, Wednesday, Friday. Three full-body sessions with small set differences per day; isolation at 10-15 reps.",
  author: "research-b",
  schedule: { kind: "weekdays", days: [1, 3, 5] },
  rotation: "cycle",
  sessions: PROGRAM_B_SESSIONS,
  block: { kind: "continuous", deload: DEFAULT_DELOAD_RULE },
  goal: "muscle",
  philosophy: {
    firstSet: "off",
    repBias: "research",
    grouping: "joint_action",
  },
  expectedWeekly: PROGRAM_B_WEEKLY,
  minutes: { min: 50, max: 66 },
  provenance: {
    programDoc: "programs/full-body-3x-week.md",
    rules: ["R1", "R4", "R6", "R7", "R7b", "R8b", "R10", "R12b", "R15", "R17"],
  },
};
