// ScreenshotParse -> ImportDraft (the shared review screen's input). OCR rows
// keep their own confidence; a parse that found no set rows falls back to the
// shared paste-text parser so layouts the screenshot parser doesn't know still
// get a second chance.
import { newId } from "../../domain/ids";
import { kgToLb, lbToKg } from "../../domain/units";
import {
  emptyDraft,
  exerciseConfidence,
  type ImportDraft,
  importDraftSet,
  isLowConfidence,
  type WeightUnit,
} from "../draft";
import { parseWorkoutText } from "../text";
import { parseScreenshotLines } from "./parse-screenshot";
import type { OcrLine, ScreenshotParse } from "./types";

export function screenshotToDraft(
  parse: ScreenshotParse,
  defaultUnit: WeightUnit = "kg",
): ImportDraft {
  const { session } = parse;
  const unit = parse.unit ?? defaultUnit;
  const draft = emptyDraft("text", unit, parse.unit !== null);
  if (!session.exercises.some((e) => e.sets.length > 0)) return draft;
  let startedAt: number | null = null;
  if (session.date) {
    const [y, m, d] = session.date.split("-").map(Number);
    startedAt = new Date(y, m - 1, d, 12).getTime();
  }
  const exercises = session.exercises.map((e) => {
    const sets = e.sets.map((s) =>
      importDraftSet({
        weight:
          s.unit && s.unit !== unit && s.weight !== null
            ? Math.round(
                (unit === "lb" ? kgToLb(s.weight) : lbToKg(s.weight)) * 10,
              ) / 10
            : s.weight,
        reps: s.reps,
        rir: s.rir,
        setType: s.warmup ? "warmup" : "normal",
        confidence: s.confidence,
        flags: isLowConfidence(s.confidence) ? ["Check this row"] : [],
        raw: s.raw,
      }),
    );
    return {
      id: newId(),
      rawName: e.rawName,
      sets,
      confidence: Math.min(e.nameConfidence, exerciseConfidence(sets)),
    };
  });
  const confidence = exercises.reduce((m, e) => Math.min(m, e.confidence), 1);
  draft.sessions.push({
    id: newId(),
    title: session.title,
    startedAt,
    hasTime: false,
    endedAt:
      startedAt !== null && session.durationMin
        ? startedAt + session.durationMin * 60_000
        : null,
    exercises,
    confidence,
    flags: startedAt === null ? ["No date found"] : [],
  });
  draft.unparsed = parse.unparsed;
  draft.notes.push("Read from a screenshot on this device. Check every row.");
  if (
    session.exercises.some((e) => e.sets.some((s) => s.unit && s.unit !== unit))
  )
    draft.notes.push(
      "Both kg and lb appeared; weights were converted to the majority unit.",
    );
  if (session.dateAmbiguous)
    draft.notes.push(
      "The date looked like 03/04/2026; month-first was assumed. Check the date.",
    );
  return draft;
}

/** OCR lines -> draft: screenshot parser first, shared text parser as fallback. */
export function ocrLinesToDraft(
  lines: OcrLine[],
  defaultUnit: WeightUnit = "kg",
): ImportDraft {
  const draft = screenshotToDraft(parseScreenshotLines(lines), defaultUnit);
  if (draft.sessions.length > 0) return draft;
  const fallback = parseWorkoutText(lines.map((l) => l.text).join("\n"), {
    defaultUnit,
    ocr: true,
  });
  fallback.sessions = fallback.sessions.filter((x) => x.exercises.length > 0);
  if (fallback.sessions.length + fallback.routines.length > 0) {
    fallback.notes.push(
      "Read from a screenshot on this device. Check every row.",
    );
  }
  return fallback;
}
