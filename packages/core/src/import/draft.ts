// ImportDraft: the one shape every import path produces and the one review
// screen consumes. frog-import-ocr plugs in by producing text for
// `parseWorkoutText` (text.ts) — or, for a custom layout parser, by returning
// an ImportDraft directly. Keep this model small.
//
//   source ──► ImportDraft ──► review screen (edit / match / dedupe) ──► confirm
//                                   │
//                  draftToImportedSessions()  → Repo.importSessions
//                  routines                   → Repo.createRoutine (review screen)
//
// Rules of the model:
// - Nothing here touches a repo or the network; drafts are plain JSON.
// - Weights live in `draft.unit` (kg|lb) so the review screen can flip a wrong
//   unit guess without re-parsing; they convert to canonical kg only at commit.
// - `confidence` is 0..1 per set / exercise / session. Below LOW_CONFIDENCE the
//   review screen highlights the row; `flags` are short human reasons for it.
// - `startedAt: null` means "date not found": the review screen makes the user
//   pick one before confirming. `hasTime: false` means the clock time is a
//   placeholder (noon) so duplicate detection compares calendar days.

import { newId } from "../domain/ids";
import { kgToLb, lbToKg } from "../domain/units";
import type { SetSide } from "../repo/types";
import { physicalSetCount } from "./set-nos";
import type { ImportedSession } from "./types";
import { isUnilateralName, pairUnilateralSets } from "./unilateral";

export type ImportSource =
  | "hevy-csv"
  | "strong-csv"
  | "fitbod-csv"
  | "jefit-csv"
  | "frog-csv"
  | "frog-json"
  | "generic-csv"
  | "text";

export type WeightUnit = "kg" | "lb";

export type ImportDraftSet = {
  id: string;
  /** In the draft's unit; null = bodyweight / not stated. */
  weight: number | null;
  reps: number | null;
  rir: number | null;
  durationSec?: number | null;
  distanceM?: number | null;
  side?: SetSide | null;
  setNo?: number | null;
  rirMin?: number | null;
  rirMax?: number | null;
  rpe?: number | null;
  /** 'normal' | 'warmup' | 'failure' | 'drop' (same strings as set_logs). */
  setType: string;
  note: string | null;
  confidence: number;
  flags: string[];
  /** The source text/row this set came from, for the review tooltip. */
  raw?: string;
};

export type ImportDraftExercise = {
  id: string;
  rawName: string;
  sets: ImportDraftSet[];
  confidence: number;
};

export type ImportDraftSession = {
  id: string;
  title: string | null;
  startedAt: number | null;
  hasTime: boolean;
  endedAt: number | null;
  exercises: ImportDraftExercise[];
  confidence: number;
  flags: string[];
};

export type ImportDraftRoutineExercise = {
  id: string;
  rawName: string;
  sets: number;
  reps: number | null;
  repsMax: number | null;
  weight: number | null;
  confidence: number;
};

export type ImportDraftRoutine = {
  id: string;
  name: string | null;
  exercises: ImportDraftRoutineExercise[];
};

export type ImportDraft = {
  source: ImportSource;
  /** Unit every `weight` in this draft is expressed in. */
  unit: WeightUnit;
  /** false = no unit was stated anywhere; `unit` is the user's default. */
  unitDetected: boolean;
  sessions: ImportDraftSession[];
  routines: ImportDraftRoutine[];
  /** Lines the parser could not use, shown so nothing is silently dropped. */
  unparsed: string[];
  /** Draft-level caveats ("order of day/month assumed"). */
  notes: string[];
};

/** Rows under this are highlighted in the review screen. */
export const LOW_CONFIDENCE = 0.75;
export const isLowConfidence = (c: number) => c < LOW_CONFIDENCE;

export const emptyDraft = (
  source: ImportSource,
  unit: WeightUnit = "kg",
  unitDetected = false,
): ImportDraft => ({
  source,
  unit,
  unitDetected,
  sessions: [],
  routines: [],
  unparsed: [],
  notes: [],
});

export function importDraftSet(
  p: Partial<ImportDraftSet> & Pick<ImportDraftSet, "weight" | "reps">,
): ImportDraftSet {
  return {
    id: newId(),
    rir: null,
    setType: "normal",
    note: null,
    confidence: 1,
    flags: [],
    ...p,
  };
}

/** Lowest set confidence in an exercise (a row is only as sure as its worst set). */
export function exerciseConfidence(sets: ImportDraftSet[], base = 1): number {
  return sets.reduce((m, s) => Math.min(m, s.confidence), base);
}

/** Wraps already-structured file rows (confidence 1, weights in kg). */
export function draftFromImported(
  source: ImportSource,
  sessions: ImportedSession[],
  opts: { hasTime?: boolean; unit?: WeightUnit; unitDetected?: boolean } = {},
): ImportDraft {
  const draft = emptyDraft(
    source,
    opts.unit ?? "kg",
    opts.unitDetected ?? true,
  );
  const toUnit = (kg: number | null) =>
    kg == null ? null : draft.unit === "lb" ? kgToLb(kg) : kg;
  draft.sessions = sessions.map((s) => ({
    id: newId(),
    title: s.title,
    startedAt: s.startedAt,
    hasTime: opts.hasTime ?? true,
    endedAt: s.endedAt,
    confidence: 1,
    flags: [],
    exercises: s.exercises.map((e) => ({
      id: newId(),
      rawName: e.name,
      confidence: 1,
      sets: e.sets.map((x) =>
        importDraftSet({
          weight: toUnit(x.weightKg),
          reps: x.reps,
          rir: x.rir,
          note: x.note,
          setType: x.setType ?? "normal",
          durationSec: x.durationSec ?? null,
          distanceM: x.distanceM ?? null,
          side: x.side ?? null,
          setNo: x.setNo ?? null,
          rirMin: x.rirMin ?? null,
          rirMax: x.rirMax ?? null,
          rpe: x.rpe ?? null,
        }),
      ),
    })),
  }));
  return draft;
}

const round = (n: number, dp = 2) => {
  const f = 10 ** dp;
  return Math.round(n * f) / f;
};

/** Display/commit weight in kg, rounded to 2 dp so lb round-trips look clean. */
export const weightToKg = (weight: number | null, unit: WeightUnit) =>
  weight == null ? null : round(unit === "lb" ? lbToKg(weight) : weight);

/** Review "Weights are in" toggle: relabels the numbers as typed, no conversion. */
export const setDraftUnit = (d: ImportDraft, unit: WeightUnit): ImportDraft =>
  unit === d.unit ? d : { ...d, unit };

export type DuplicateKind = "exact" | "same-day";

const dayKey = (ms: number) => {
  const d = new Date(ms);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
};

/**
 * Sessions already in history. "exact": same start instant (what the repo's
 * idempotent import skips). "same-day": the draft has no real clock time and a
 * session exists that calendar day (re-pasting a text log lands here).
 */
export function findDuplicateSessions(
  sessions: ImportDraftSession[],
  existing: { startedAt: number }[],
): Map<string, DuplicateKind> {
  const exact = new Set(existing.map((e) => e.startedAt));
  const days = new Set(existing.map((e) => dayKey(e.startedAt)));
  const out = new Map<string, DuplicateKind>();
  const seen = new Set<number>();
  for (const s of sessions) {
    if (s.startedAt == null) continue;
    if (exact.has(s.startedAt)) out.set(s.id, "exact");
    else if (!s.hasTime && days.has(dayKey(s.startedAt)))
      out.set(s.id, "same-day");
    else if (s.hasTime && seen.has(s.startedAt)) out.set(s.id, "exact");
    seen.add(s.startedAt);
  }
  return out;
}

/**
 * Review resolution → repo payload. `nameFor` maps a raw exercise name to the
 * name the repo should file it under (an existing exercise's name, or the
 * name to create); returning null drops that exercise. Sessions with a null
 * date are dropped (review blocks confirm until none remain). Sessions that
 * share a placeholder start are nudged a minute apart so the repo's
 * start-time idempotency key never collapses two different workouts.
 */
export function draftToImportedSessions(
  draft: ImportDraft,
  nameFor: (rawName: string) => string | null,
  include: (s: ImportDraftSession) => boolean = () => true,
): ImportedSession[] {
  const used = new Set<number>();
  const out: ImportedSession[] = [];
  for (const s of draft.sessions) {
    if (s.startedAt == null || !include(s)) continue;
    let startedAt = s.startedAt;
    if (!s.hasTime) while (used.has(startedAt)) startedAt += 60_000;
    used.add(startedAt);
    out.push({
      title: s.title,
      startedAt,
      endedAt: s.endedAt == null ? null : s.endedAt + (startedAt - s.startedAt),
      exercises: s.exercises.flatMap((e) => {
        const name = nameFor(e.rawName);
        if (!name) return [];
        const rows = e.sets.map((x) => ({
          weightKg: weightToKg(x.weight, draft.unit),
          reps: x.reps,
          rir: x.rir,
          note: x.note,
          setType: x.setType,
          durationSec: x.durationSec ?? null,
          distanceM: x.distanceM ?? null,
          side: x.side ?? null,
          setNo: x.setNo ?? null,
          rirMin: x.rirMin ?? null,
          rirMax: x.rirMax ?? null,
          rpe: x.rpe ?? null,
        }));
        return [
          {
            name,
            sets:
              isUnilateralName(e.rawName) || isUnilateralName(name)
                ? pairUnilateralSets(rows)
                : rows,
          },
        ];
      }),
    });
  }
  return out;
}

/** Counts for the review header. */
export function draftStats(d: ImportDraft) {
  let sets = 0;
  const names = new Set<string>();
  for (const s of d.sessions)
    for (const e of s.exercises) {
      sets += physicalSetCount(e.sets);
      names.add(e.rawName.toLowerCase());
    }
  for (const r of d.routines)
    for (const e of r.exercises) names.add(e.rawName.toLowerCase());
  return {
    sessions: d.sessions.length,
    routines: d.routines.length,
    sets,
    exercises: names.size,
  };
}
