// Fixture builder for the 19 worked examples
// (research/hypertrophy/notes/coach-worked-examples.md). UTC (tz 0), 2026.

import type {
  CoachExercise,
  CoachInput,
  CoachSession,
  CoachSet,
  PlannedTarget,
} from "../types";

export const at = (md: string, hm = "18:00"): number =>
  Date.parse(`2026-${md}T${hm}:00Z`);

export const EX = {
  squat: {
    id: "squat",
    name: "Squat",
    equipment: "barbell",
    isCompound: true,
    muscleTargets: [
      { muscle: "quads", tier: "S" as const },
      { muscle: "glutes", tier: "A" as const },
    ],
  },
  bench: {
    id: "bench",
    name: "Bench",
    equipment: "barbell",
    isCompound: true,
    muscleTargets: [
      { muscle: "chest", tier: "S" as const },
      { muscle: "triceps", tier: "A" as const },
    ],
  },
  deadlift: {
    id: "deadlift",
    name: "Deadlift",
    equipment: "barbell",
    isCompound: true,
    muscleTargets: [
      { muscle: "hamstrings", tier: "S" as const },
      { muscle: "glutes", tier: "A" as const },
    ],
  },
  row: {
    id: "row",
    name: "Row",
    equipment: "barbell",
    isCompound: true,
    muscleTargets: [{ muscle: "lats", tier: "A" as const }],
  },
  legext: {
    id: "legext",
    name: "Leg extension",
    equipment: "machine",
    isCompound: false,
    muscleTargets: [{ muscle: "quads", tier: "A" as const }],
  },
} satisfies Record<string, CoachExercise>;

/** "100x6@2" → CoachSet. "30x7@2" light sets are plain working sets. */
export function set(spec: string, setNo: number): CoachSet {
  const m = /^([\d.]+)x(\d+)(?:@(\d+)(?:-(\d+))?)?$/.exec(spec);
  if (!m) throw new Error(`bad set spec ${spec}`);
  return {
    setNo,
    side: null,
    setType: "normal",
    weightKg: Number(m[1]),
    reps: Number(m[2]),
    rirMin: m[3] != null ? Number(m[3]) : null,
    rirMax: m[4] != null ? Number(m[4]) : m[3] != null ? Number(m[3]) : null,
    completed: true,
  };
}

export const P = (
  repsMin = 5,
  repsMax = 8,
  rirMin = 2,
  rirMax = 2,
  sets = 2,
  extra: Partial<PlannedTarget> = {},
): PlannedTarget => ({ repsMin, repsMax, rirMin, rirMax, sets, ...extra });

export type SessOpts = {
  sleep?: number | null;
  stress?: number | null;
  carbs?: number | null;
  caffeine?: number | null;
  planned?: PlannedTarget | null;
  exerciseId?: string;
};

/** One-exercise session. */
export function S(
  md: string,
  hm: string,
  specs: string[],
  o: SessOpts = {},
): CoachSession {
  const planned = o.planned === undefined ? P() : o.planned;
  return {
    id: `${md}${hm === "18:00" ? "" : `@${hm}`}`,
    startedAt: at(md, hm),
    endedAt: at(md, hm) + 3_600_000,
    sleepH: o.sleep === undefined ? 7.5 : o.sleep,
    stress: o.stress === undefined ? 3 : o.stress,
    carbsG: o.carbs === undefined ? 60 : o.carbs,
    caffeineMg: o.caffeine === undefined ? 150 : o.caffeine,
    exercises: [
      {
        exerciseId: o.exerciseId ?? "squat",
        planned,
        sets: specs.map((x, i) => set(x, i + 1)),
      },
    ],
  };
}

export function input(
  sessions: CoachSession[],
  p: Omit<Partial<CoachInput>, "exercises"> & {
    exercises?: CoachExercise[];
  } = {},
): CoachInput {
  const { exercises, ...rest } = p;
  const exs = exercises ?? Object.values(EX);
  const last = sessions[sessions.length - 1];
  return {
    asOf: last.startedAt + 3_600_000,
    currentSessionId: last.id,
    prefs: {},
    ...rest,
    exercises: new Map(exs.map((e) => [e.id, e])),
    sessions,
  };
}

import type { CoachResult, CoachSuggestion } from "../types";

export const ruleIds = (r: CoachResult): string[] =>
  r.suggestions.map((s) => s.ruleId);
export const find = (
  r: CoachResult,
  ruleId: string,
  exerciseId?: string,
): CoachSuggestion | undefined =>
  r.suggestions.find(
    (s) => s.ruleId === ruleId && (!exerciseId || s.exerciseId === exerciseId),
  );
export const planChanging = (r: CoachResult): CoachSuggestion[] =>
  r.suggestions.filter((s) => s.action.kind !== "text_only");

export type CaseFixture = {
  id: number;
  title: string;
  /** Named evaluation points ("at 11-11"): the input and the assertions. */
  points: {
    at: string;
    input: CoachInput;
    check: (r: import("../types").CoachResult) => void;
  }[];
};
