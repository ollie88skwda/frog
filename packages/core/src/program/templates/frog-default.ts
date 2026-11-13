// "Frog default": Oliver's method, built from research Program A (full body,
// same session, every other day ≈ 3.5×/week). The session, set counts and
// RIR come from programs/full-body-every-other-day.md. The method flags
// (top-set-first, 4-8 on isolation) are labelled as a method, not evidence
// (report §12 #11, D4); `research-a` is the same session with isolation at
// 10-15.

import { DEFAULT_DELOAD_RULE } from "../deload";
import type { ProgramTemplate } from "../types";
import {
  SLOT_CALF,
  SLOT_CHEST_PRESS,
  SLOT_INCLINE_CURL,
  SLOT_LATERAL_RAISE,
  SLOT_LEG_EXT,
  SLOT_LEG_PRESS,
  SLOT_OVERHEAD_TRICEPS,
  SLOT_RDL,
  SLOT_ROW,
} from "./slots";

/** The Program A session, 24 working sets. */
export const PROGRAM_A_SLOTS = [
  SLOT_LEG_PRESS,
  SLOT_LEG_EXT,
  SLOT_RDL,
  SLOT_CHEST_PRESS,
  SLOT_ROW,
  SLOT_LATERAL_RAISE,
  SLOT_INCLINE_CURL,
  SLOT_OVERHEAD_TRICEPS,
  SLOT_CALF,
];

/** Weekly fractional sets at 3.5 sessions/week, from the program doc. */
export const PROGRAM_A_WEEKLY: Record<string, number> = {
  quads: 17.5,
  hamstrings: 10.5,
  glutes: 10.5,
  pecs: 10.5,
  lats: 10.5,
  "mid-traps-rhomboids": 10.5,
  "side-delts": 10.5,
  calves: 10.5,
  biceps: 12.25,
  triceps: 12.25,
};

export const FROG_DEFAULT: ProgramTemplate = {
  id: "frog-default",
  name: "Frog default",
  summary:
    "Oliver's method. Top set first, 4-8 reps, 1-3 RIR, every other day. Where this goes beyond the evidence, the Why sheet says so.",
  author: "frog-default",
  schedule: { kind: "interval", everyDays: 2 },
  rotation: "same",
  sessions: [{ id: "full", name: "Full body", slots: PROGRAM_A_SLOTS }],
  block: { kind: "continuous", deload: DEFAULT_DELOAD_RULE },
  goal: "muscle",
  philosophy: { firstSet: "top", repBias: "heavy", grouping: "joint_action" },
  expectedWeekly: PROGRAM_A_WEEKLY,
  minutes: { min: 47, max: 59 },
  provenance: {
    programDoc: "programs/full-body-every-other-day.md",
    rules: [
      "R1",
      "R3",
      "R6",
      "R7",
      "R7b",
      "R8b",
      "R10",
      "R12b",
      "R13",
      "R15",
      "R17",
      "R17b",
    ],
  },
};
