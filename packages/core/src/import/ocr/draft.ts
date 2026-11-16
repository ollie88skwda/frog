// ScreenshotParse -> ImportDraft (the shared review screen's input). OCR rows
// keep their own confidence; a parse that found no exercises falls back to the
// shared paste-text parser so layouts the screenshot parser doesn't know still
// get a second chance.
import { newId } from "../../domain/ids";
import {
  emptyDraft,
  exerciseConfidence,
  type ImportDraft,
  importDraftSet,
  type WeightUnit,
} from "../draft";
import { parseWorkoutText } from "../text";
import { parseScreenshotLines } from "./parse-screenshot";
import {
  type OcrLine,
  SCREENSHOT_LOW_CONFIDENCE,
  type ScreenshotParse,
} from "./types";

export function screenshotToDraft(
  parse: ScreenshotParse,
  defaultUnit: WeightUnit = "kg",
): ImportDraft {
  const { session } = parse;
  const draft = emptyDraft(
    "text",
    parse.unit ?? defaultUnit,
    parse.unit !== null,
  );
  if (session.exercises.length === 0) return draft;
  let startedAt: number | null = null;
  if (session.date) {
    const [y, m, d] = session.date.split("-").map(Number);
    startedAt = new Date(y, m - 1, d, 12).getTime();
  }
  const exercises = session.exercises.map((e) => {
    const sets = e.sets.map((s) =>
      importDraftSet({
        weight: s.weight,
        reps: s.reps,
        rir: s.rir,
        setType: s.warmup ? "warmup" : "normal",
        confidence: s.confidence,
        flags:
          s.confidence < SCREENSHOT_LOW_CONFIDENCE ? ["Check this row"] : [],
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
  if (fallback.sessions.length + fallback.routines.length > 0) {
    fallback.notes.push(
      "Read from a screenshot on this device. Check every row.",
    );
  }
  return fallback;
}
