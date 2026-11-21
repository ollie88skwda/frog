// Accuracy scoring of a parse against fixture ground truth (used by the
// scripts/ocr harness and the unit tests).
import { sameExerciseName } from "../../domain/match-exercise";
import type { ScreenshotParse } from "./types";

export type Ratio = { ok: number; total: number };
export type Score = { names: Ratio; sets: Ratio; reps: Ratio; load: Ratio };

type Truth = {
  exercises: {
    name: string;
    sets: { reps: number; weight: number | null }[];
  }[];
};

// Names compare through the matcher's own normalization, ignoring a trailing
// "(Barbell)"-style qualifier either side so "Bench press" == "Bench Press (Barbell)".
const strip = (n: string) => n.replace(/\s*\(.*?\)\s*$/, "");

export function scoreParse(parse: ScreenshotParse, truth: Truth): Score {
  const s: Score = {
    names: { ok: 0, total: 0 },
    sets: { ok: 0, total: 0 },
    reps: { ok: 0, total: 0 },
    load: { ok: 0, total: 0 },
  };
  for (const t of truth.exercises) {
    const got = parse.session.exercises.find((e) =>
      sameExerciseName(strip(e.rawName), strip(t.name)),
    );
    s.names.total++;
    s.sets.total++;
    s.reps.total += t.sets.length;
    s.load.total += t.sets.length;
    if (!got) continue;
    s.names.ok++;
    if (got.sets.length === t.sets.length) s.sets.ok++;
    t.sets.forEach((ts, i) => {
      const gs = got.sets[i];
      if (!gs) return;
      if (gs.reps === ts.reps) s.reps.ok++;
      const w = gs.weight;
      if (
        ts.weight === null || ts.weight === 0
          ? w === null || w === 0
          : w !== null && Math.abs(w - ts.weight) < 0.01
      )
        s.load.ok++;
    });
  }
  return s;
}
