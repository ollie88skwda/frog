// Program C: six-week time-limited block, programs/six-week-block.md. Same
// slots as Program B. Weeks 1-5 train (wk1 at 2-3 RIR, wk5 holds load at
// 1-2 RIR), week 6 is a deload (sets halved, 3-4 RIR), week 7 retests.

import { DEFAULT_DELOAD_RULE } from "../deload";
import type { ProgramTemplate } from "../types";
import { PROGRAM_B_SESSIONS, PROGRAM_B_WEEKLY, RESEARCH_B } from "./research-b";

export const RESEARCH_C: ProgramTemplate = {
  ...RESEARCH_B,
  id: "research-c",
  name: "Research C: 6-week block",
  summary:
    "Program B as a fixed block: five training weeks, a deload week, then a retest week. A block checks that the plan is workable; six weeks of logs do not measure muscle growth.",
  author: "research-c",
  sessions: PROGRAM_B_SESSIONS,
  block: {
    kind: "fixed",
    fixed: {
      trainingWeeks: 5,
      deloadWeek: 6,
      retestWeek: true,
      weekRir: { 1: [2, 3], 5: [1, 2] },
      holdLoadWeeks: [5],
    },
    deload: { ...DEFAULT_DELOAD_RULE, everyWeeks: 6 },
  },
  expectedWeekly: PROGRAM_B_WEEKLY,
  minutes: { min: 50, max: 66 },
  provenance: {
    programDoc: "programs/six-week-block.md",
    rules: ["R6", "R7b", "R8b", "R10", "R17", "R25", "C14"],
  },
};
