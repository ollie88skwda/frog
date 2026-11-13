// Program A as written (isolation 10-15, no top-set-first): the research
// version of the Frog default, same session and weekly sets.

import type { ProgramTemplate } from "../types";
import {
  FROG_DEFAULT,
  PROGRAM_A_SLOTS,
  PROGRAM_A_WEEKLY,
} from "./frog-default";

export const RESEARCH_A: ProgramTemplate = {
  ...FROG_DEFAULT,
  id: "research-a",
  name: "Research A: full body every other day",
  summary:
    "The same full-body session every other day, as the research notes lay it out: isolation at 10-15 reps, flat 1-3 RIR.",
  author: "research-a",
  sessions: [{ id: "full", name: "Full body", slots: PROGRAM_A_SLOTS }],
  philosophy: {
    firstSet: "off",
    repBias: "research",
    grouping: "joint_action",
  },
  expectedWeekly: PROGRAM_A_WEEKLY,
};
