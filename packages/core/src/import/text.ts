// Rule-based parser for workout text pasted from any app (or copied from a
// screenshot with iPhone Live Text, or produced by frog-import-ocr). No AI: it
// recognises line shapes only —
//   date line      "Wed, Nov 12, 2026" / "12 Nov 2026, 16:42" / "2026-11-12"
//   exercise line  a lettered line followed by set lines
//   set line       "1  100 kg x 8" · "Set 2: 225 lb × 5 @ RPE 8" · "8 reps @ 60kg"
//                  · "BW x 12" · "W 40 x 10" (warm-up) · "3x8 @ 80kg" (N sets)
//   summary line   "Duration 0:45:12" (Apple Fitness) → session end time
// Lines it cannot place go to `unparsed`; guessed parts lower `confidence`.
// OCR callers: pass text through `cleanOcrLine` first (fixes l/I/O digit
// confusions inside number runs) — see ocr-hint at the bottom.

import { rirFromRpe } from "../domain/e1rm";
import { newId } from "../domain/ids";
import { sameExerciseName } from "../domain/match-exercise";
import { kgToLb, lbToKg } from "../domain/units";
import { parseRoutineText } from "../generator/parse-routine";
import { MONTH_WORD, parseLooseDate } from "./dates";
import {
  emptyDraft,
  exerciseConfidence,
  type ImportDraft,
  type ImportDraftExercise,
  type ImportDraftSession,
  importDraftSet,
  type WeightUnit,
} from "./draft";

export type ParseTextOptions = {
  /** The user's own unit, used when the text states none. */
  defaultUnit?: WeightUnit;
  now?: number;
  /** Date order for all-numeric dates in the text. */
  dateOrder?: "dmy" | "mdy";
  /** Text came from OCR: repair l/I/O digit confusions before parsing. */
  ocr?: boolean;
};

const UNIT = "(kgs?|kilos?|lbs?|pounds?)";
const NUM = "(\\d+(?:[.,]\\d+)?)";
const X = "[x×✕*]";
const NOISE =
  /^(notes?|volume|total( volume)?|duration|sets?|reps?|weight|prev(ious)?|rest|timer|finish|edit|add sets?|add exercises?|workout|summary|history|kg|lbs?|rpe|rir|1rm|best|personal records?|done|complete|completed|share|routine|exercises?|set\s+(previous\s+)?(kg|lbs?)\s+reps|set\s+weight\s+reps|(set\s+)?(previous\s+)?(kg|lbs?)?\s*reps?\s*(rpe)?|#|•)$/i;
const SUMMARY_KV =
  /^(duration|time|total time|workout time|active calories|total calories|calories|avg(erage)? heart rate|distance|volume|total volume|sets|total sets|reps|total reps|\d+\s*(sets?|exercises?)(\s*[·•,]\s*.*)?)\b/i;
const APPLE_TYPES =
  /^(traditional|functional)?\s*strength training$|^(high intensity interval training|hiit|core training|cross training|mixed cardio|elliptical|rowing|running|walking|cycling|swimming|yoga|pilates|hiking|stair stepper|outdoor run|indoor run|outdoor walk)$/i;

function toNum(s: string): number {
  return Number.parseFloat(s.replace(",", "."));
}
const unitOf = (s: string | undefined): WeightUnit | null =>
  s ? (/^(lb|pound)/i.test(s) ? "lb" : "kg") : null;

type RawSet = {
  weight: number | null;
  unit: WeightUnit | null;
  reps: number | null;
  rir: number | null;
  setType: string;
  count: number;
  confidence: number;
  flags: string[];
  /** a "3x8" prescription rather than a logged set line */
  prescription: boolean;
};

/** Repairs common OCR confusions inside what is clearly a number run. */
export function cleanOcrLine(line: string): string {
  return line
    .replace(/[|¦]/g, "1")
    .replace(/(?<=\d)[oO](?=\d|\s|$)|(?<=^|\s)[oO](?=\d)/g, "0")
    .replace(/(?<=\d)[lI](?=\d)/g, "1")
    .replace(/(?<=\d)\s*[xX](?=\s*\d)/g, " x")
    .replace(/(?<=\d)\s*(?:k9|kq)\b/gi, " kg")
    .replace(/(?<=\d)\s*(?:1bs?|Ibs?)\b/g, " lb");
}

function extractRpe(s: string): { rest: string; rir: number | null } {
  let rir: number | null = null;
  let rest = s;
  const rir1 = /\b(?:@\s*)?rir\s*[:=]?\s*(\d(?:\.\d)?)\b/i.exec(rest);
  const rpe =
    /(?:@\s*)?\brpe\s*[:=]?\s*(\d(?:\.\d)?)\b/i.exec(rest) ??
    /@\s*(\d(?:\.\d)?)\s*$/.exec(rest);
  if (rir1) {
    rir = Math.round(toNum(rir1[1]));
    rest = rest.replace(rir1[0], " ");
  } else if (rpe) {
    const v = toNum(rpe[1]);
    if (v >= 5 && v <= 10) rir = Math.round(rirFromRpe(v));
    rest = rest.replace(rpe[0], " ");
  }
  return { rest, rir };
}

/** One line → a set, or null when it does not look like one. */
export function parseSetLine(raw: string): RawSet | null {
  let line = raw.trim().replace(/[–—]/g, "-");
  if (!line || line.length > 90) return null;
  let setType = "normal";
  let indexed = false;
  // leading set index: "1", "Set 1", "1.", "1)", "#1" ; warm-up marker "W"
  const lead = /^(?:set\s*)?#?(\d{1,2})\s*[:.)-]?\s+(?=\S)/i.exec(line);
  const wlead = /^(?:w|warm[- ]?up)\s*[:.)-]?\s+(?=\d|bw|bodyweight)/i.exec(
    line,
  );
  if (wlead) {
    setType = "warmup";
    line = line.slice(wlead[0].length);
  } else if (
    lead &&
    /\d/.test(line.slice(lead[0].length)) &&
    !new RegExp(`^${X}`).test(line.slice(lead[0].length))
  ) {
    // avoid eating the "3" of "3 x 8" as an index
    const after = line.slice(lead[0].length);
    if (
      !new RegExp(`^\\d+\\s*${X}\\s*\\d+\\s*(?:@|$)`).test(line) ||
      new RegExp(`^${NUM}\\s*${UNIT}?\\s*${X}`).test(after)
    ) {
      line = after;
      indexed = true;
    }
  }
  const { rest, rir } = extractRpe(line);
  line = rest.replace(/\s+/g, " ").trim();
  if (/\bto failure\b|\bfailure\b/i.test(line))
    setType = setType === "warmup" ? setType : "failure";

  let m: RegExpExecArray | null;
  // weight unit × reps: "100 kg x 8", "225lbs × 5", "100x8" (no unit)
  m = new RegExp(
    `^${NUM}\\s*${UNIT}?\\s*${X}\\s*(\\d{1,3})(?:\\s*reps?)?\\s*(?:[-,;].*)?$`,
    "i",
  ).exec(line);
  const smallBare =
    m != null &&
    unitOf(m[2]) === null &&
    Number.isInteger(toNum(m[1])) &&
    toNum(m[1]) <= 12;
  if (m && (!smallBare || indexed)) {
    const unit = unitOf(m[2]);
    const weight = toNum(m[1]);
    const reps = Number(m[3]);
    const f: string[] = [];
    let c = unit ? 1 : smallBare ? 0.7 : 0.85;
    if (!unit) f.push("Unit not stated");
    if (reps > 60) {
      c = 0.5;
      f.push("Unusual rep count");
    }
    if (weight > 700 || (unit === null && weight > 0 && weight < 1)) {
      c = Math.min(c, 0.5);
      f.push("Unusual weight");
    }
    return {
      weight,
      unit,
      reps,
      rir,
      setType,
      count: 1,
      confidence: c,
      flags: f,
      prescription: false,
    };
  }
  // reps × weight unit: "8 x 100 kg" (unit required to avoid ambiguity with N x M)
  m = new RegExp(`^(\\d{1,3})\\s*${X}\\s*${NUM}\\s*${UNIT}\\b`, "i").exec(line);
  if (m)
    return {
      weight: toNum(m[2]),
      unit: unitOf(m[3]),
      reps: Number(m[1]),
      rir,
      setType,
      count: 1,
      confidence: 0.9,
      flags: ["Reps and weight order inferred"],
      prescription: false,
    };
  // "8 reps @ 100 kg" / "8 reps 100kg" / "100 kg 8 reps" / "100 kg for 8"
  m = new RegExp(
    `^(\\d{1,3})\\s*reps?\\s*(?:@|at|with|-|,)?\\s*${NUM}\\s*${UNIT}\\b`,
    "i",
  ).exec(line);
  if (m)
    return {
      weight: toNum(m[2]),
      unit: unitOf(m[3]),
      reps: Number(m[1]),
      rir,
      setType,
      count: 1,
      confidence: 1,
      flags: [],
      prescription: false,
    };
  m = new RegExp(
    `^${NUM}\\s*${UNIT}\\s*(?:x|×|for|-|,|/|\\s)\\s*(\\d{1,3})\\s*(?:reps?)?\\s*$`,
    "i",
  ).exec(line);
  if (m)
    return {
      weight: toNum(m[1]),
      unit: unitOf(m[2]),
      reps: Number(m[3]),
      rir,
      setType,
      count: 1,
      confidence: 0.95,
      flags: [],
      prescription: false,
    };
  // table row with columns "1  100  8" (index already stripped) → weight reps
  m = /^(\d+(?:[.,]\d+)?)\s+(\d{1,3})$/.exec(line);
  if (m && lead)
    return {
      weight: toNum(m[1]),
      unit: null,
      reps: Number(m[2]),
      rir,
      setType,
      count: 1,
      confidence: 0.7,
      flags: ["Columns assumed weight then reps", "Unit not stated"],
      prescription: false,
    };
  // bodyweight: "BW x 12", "12 reps", "bodyweight × 12"
  m = new RegExp(
    `^(?:bw|bodyweight|body weight)\\s*${X}?\\s*(\\d{1,3})\\b`,
    "i",
  ).exec(line);
  if (m)
    return {
      weight: null,
      unit: null,
      reps: Number(m[1]),
      rir,
      setType,
      count: 1,
      confidence: 0.95,
      flags: [],
      prescription: false,
    };
  m = /^(\d{1,3})\s*reps?$/i.exec(line);
  if (m)
    return {
      weight: null,
      unit: null,
      reps: Number(m[1]),
      rir,
      setType,
      count: 1,
      confidence: 0.85,
      flags: [],
      prescription: false,
    };
  if (lead) {
    m = /^(\d{1,3})$/.exec(line);
    if (m)
      return {
        weight: null,
        unit: null,
        reps: Number(m[1]),
        rir,
        setType,
        count: 1,
        confidence: 0.6,
        flags: ["Only reps found"],
        prescription: false,
      };
  }
  // N sets × M reps [@ weight]: "3x8", "4 sets x 6 reps @ 80kg" (routine / grouped)
  m = new RegExp(
    `^(\\d{1,2})\\s*(?:sets?\\s*)?${X}\\s*(\\d{1,3})(?:\\s*-\\s*\\d{1,3})?(?:\\s*reps?)?(?:\\s*(?:@|at|with)\\s*${NUM}\\s*${UNIT}?)?\\s*$`,
    "i",
  ).exec(line);
  if (m) {
    const count = Number(m[1]);
    if (count >= 1 && count <= 12)
      return {
        weight: m[3] ? toNum(m[3]) : null,
        unit: unitOf(m[4]),
        reps: Number(m[2]),
        rir,
        setType,
        count,
        confidence: 0.7,
        flags: ["Sets grouped on one line"],
        prescription: true,
      };
  }
  return null;
}

const WEEKDAYS =
  /\b(mon|tue|tues|wed|thu|thur|thurs|fri|sat|sun)[a-z]*\b\.?,?/gi;
const DAY_MONTH = new RegExp(
  `\\d{1,2}(?:st|nd|rd|th)?\\s+${MONTH_WORD},?(?:\\s+\\d{4})?`,
  "gi",
);
const MONTH_DAY = new RegExp(
  `\\b${MONTH_WORD}\\s+\\d{1,2}(?:st|nd|rd|th)?,?(?:\\s+\\d{4})?`,
  "gi",
);
/** The words left on a date line once the date, time and weekday are removed. */
function dateLineTitle(line: string): string | null {
  const t = line
    .replace(/\d{4}-\d{2}-\d{2}|\d{1,2}[/.]\d{1,2}[/.]\d{2,4}/g, " ")
    .replace(DAY_MONTH, " ")
    .replace(MONTH_DAY, " ")
    .replace(/\d{1,2}:\d{2}(?::\d{2})?\s*(?:am|pm)?/gi, " ")
    .replace(WEEKDAYS, " ")
    .replace(/\b(at|on)\b/gi, " ")
    .replace(/[\s·•,|\-–—:]+/g, " ")
    .trim();
  return /[a-z]{2}/i.test(t) ? t : null;
}

function isNoise(line: string): boolean {
  return (
    NOISE.test(line.trim()) ||
    /^[\d\s.,:%+\-–—/|]+$/.test(line) ||
    /^(set|prev|kg|lbs?|reps?|rpe)(\s+(set|prev|previous|kg|lbs?|reps?|rpe))+$/i.test(
      line.trim(),
    )
  );
}

const APPLE_HINT =
  /active calories|traditional strength training|functional strength training|\bapple fitness\b|\bmove ring\b/i;

/** "0:45:12" / "45:12" / "1h 05m" / "45 min" → ms */
function parseDurationMs(s: string): number | null {
  let m = /(\d+):(\d{2}):(\d{2})/.exec(s);
  if (m) return (Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3])) * 1000;
  m = /(\d+)\s*h(?:ours?|r)?\s*(?:(\d+)\s*m(?:in)?)?/i.exec(s);
  if (m) return (Number(m[1]) * 60 + Number(m[2] ?? 0)) * 60_000;
  m = /(\d+)\s*(?:m|min|mins|minutes)\b/i.exec(s);
  if (m) return Number(m[1]) * 60_000;
  m = /^(\d{1,3}):(\d{2})$/.exec(s.trim());
  if (m) return (Number(m[1]) * 60 + Number(m[2])) * 1000;
  return null;
}

type Work = {
  session: ImportDraftSession;
  exercise: ImportDraftExercise | null;
  prescriptionOnly: boolean;
  unitsSeen: WeightUnit[];
};

export function parseWorkoutText(
  text: string,
  opts: ParseTextOptions = {},
): ImportDraft {
  const apple = APPLE_HINT.test(text);
  const lines = text
    .replace(/\r/g, "")
    .split("\n")
    .map((l) => (opts.ocr ? cleanOcrLine(l) : l))
    .map((l) => l.trim().replace(/^[-*•·]\s+/, ""))
    .filter(Boolean);

  const mk = (): Work => ({
    session: {
      id: newId(),
      title: null,
      startedAt: null,
      hasTime: false,
      endedAt: null,
      exercises: [],
      confidence: 1,
      flags: [],
    },
    exercise: null,
    prescriptionOnly: true,
    unitsSeen: [],
  });
  const done: Work[] = [];
  let cur = mk();
  let pending: string | null = null;
  const unparsed: string[] = [];
  const notes: string[] = [];
  let anyDate = false;
  let ambiguousDates = false;
  const rawSets = new Map<string, RawSet>();

  const flush = () => {
    if (
      cur.session.exercises.length ||
      cur.session.startedAt != null ||
      cur.session.title
    )
      done.push(cur);
    cur = mk();
  };

  for (const line of lines) {
    const set = parseSetLine(line);
    if (set) {
      if (!cur.exercise) {
        if (!pending) {
          unparsed.push(line);
          continue;
        }
        // the first lettered line before sets is the title only when another
        // lettered line sits between it and these sets; handled at name time
        cur.exercise = {
          id: newId(),
          rawName: pending,
          sets: [],
          confidence: 1,
        };
        cur.session.exercises.push(cur.exercise);
        pending = null;
      }
      if (set.unit) cur.unitsSeen.push(set.unit);
      if (!set.prescription) cur.prescriptionOnly = false;
      for (let i = 0; i < set.count; i++) {
        const s = importDraftSet({
          weight: set.weight,
          reps: set.reps,
          rir: set.rir,
          setType: set.setType,
          confidence: set.confidence,
          flags: [...set.flags],
          raw: line,
        });
        rawSets.set(s.id, set);
        cur.exercise.sets.push(s);
      }
      continue;
    }

    // "bench 100kg x 5" / "Incline DB 3x10 @ 30 kg": name and set on one line
    const inl = /^([A-Za-z][A-Za-z0-9 '()/&.-]*?)\s*[:\-–]?\s+(\d.*)$/.exec(
      line,
    );
    const inlSet = inl ? parseSetLine(inl[2]) : null;
    if (inl && inlSet && !parseLooseDate(line, { now: opts.now })) {
      const nm = inl[1].trim();
      if (!cur.exercise || !sameExerciseName(cur.exercise.rawName, nm)) {
        cur.exercise = { id: newId(), rawName: nm, sets: [], confidence: 1 };
        cur.session.exercises.push(cur.exercise);
      }
      pending = null;
      if (inlSet.unit) cur.unitsSeen.push(inlSet.unit);
      if (!inlSet.prescription) cur.prescriptionOnly = false;
      for (let i = 0; i < inlSet.count; i++) {
        const s = importDraftSet({
          weight: inlSet.weight,
          reps: inlSet.reps,
          rir: inlSet.rir,
          setType: inlSet.setType,
          confidence: inlSet.confidence,
          flags: [...inlSet.flags],
          raw: line,
        });
        rawSets.set(s.id, inlSet);
        cur.exercise.sets.push(s);
      }
      continue;
    }

    // Dates (must carry a month name, ISO or d/m/y; never a bare "3 8")
    const hasLetters = /[a-z]/i.test(line);
    const ld =
      line.length < 60
        ? parseLooseDate(line, { now: opts.now, order: opts.dateOrder })
        : null;
    if (ld && !/\d\s*(kg|lbs?)/i.test(line)) {
      if (cur.session.exercises.length || cur.session.startedAt != null) {
        const carryTitle = pending;
        flush();
        pending = null;
        if (carryTitle) cur.session.title = carryTitle;
      } else if (pending && !cur.session.title) {
        cur.session.title = pending;
        pending = null;
      }
      const rest = dateLineTitle(line);
      if (rest && !cur.session.title) cur.session.title = rest;
      cur.session.startedAt = ld.ms;
      cur.session.hasTime = ld.hasTime;
      if (ld.ambiguous) {
        ambiguousDates = true;
        cur.session.confidence = 0.7;
        cur.session.flags.push("Day/month order guessed");
      }
      if (!ld.hasYear) cur.session.flags.push("Year assumed");
      anyDate = true;
      // a date line may also carry the title: "Push Day · Nov 12"
      continue;
    }

    // Duration / summary key-values
    const dur =
      /^(?:duration|total time|workout time|time)\s*[:-]?\s*(.+)$/i.exec(line);
    if (dur) {
      const ms = parseDurationMs(dur[1]);
      if (ms && cur.session.startedAt != null)
        cur.session.endedAt = cur.session.startedAt + ms;
      else if (ms) cur.session.flags.push(`Duration ${dur[1]}`);
      continue;
    }
    if (SUMMARY_KV.test(line) && !hasLetters === false && /\d/.test(line))
      continue;
    if (isNoise(line)) continue;

    if (APPLE_TYPES.test(line) && apple) {
      cur.session.title = line;
      continue;
    }

    if (hasLetters) {
      // A lettered line is either the session title (first one, with another
      // name line or a date still to come) or an exercise name. Keep the
      // earlier candidate as title when two name lines arrive back to back.
      if (pending) {
        if (
          !cur.exercise &&
          !cur.session.title &&
          cur.session.exercises.length === 0
        )
          cur.session.title = pending;
        else unparsed.push(pending);
      }
      pending = line.replace(/^\d+[.)]\s*/, "").replace(/\s*[:：]\s*$/, "");
      cur.exercise = null;
      continue;
    }
    unparsed.push(line);
  }
  if (pending) {
    if (!cur.session.title && cur.session.exercises.length === 0)
      cur.session.title = pending;
    else unparsed.push(pending);
  }
  flush();

  // ---- units: draft unit = majority stated, else user's default
  const all = done.flatMap((w) => w.unitsSeen);
  const kgN = all.filter((u) => u === "kg").length;
  const lbN = all.length - kgN;
  const detected = all.length > 0;
  const unit: WeightUnit = detected
    ? lbN > kgN
      ? "lb"
      : "kg"
    : (opts.defaultUnit ?? "kg");
  const draft = emptyDraft("text", unit, detected);
  if (
    !detected &&
    done.some((w) =>
      w.session.exercises.some((e) => e.sets.some((s) => s.weight != null)),
    )
  )
    notes.push(
      `No kg or lb found, so weights are read as ${unit}. Change the unit below if that is wrong.`,
    );
  if (kgN && lbN)
    notes.push(
      "Both kg and lb appeared; weights were converted to the majority unit.",
    );
  if (ambiguousDates)
    notes.push(
      "Some dates looked like 03/04/2026; month-first was assumed. Check the dates.",
    );

  for (const w of done) {
    for (const e of w.session.exercises) {
      for (const s of e.sets) {
        const r = rawSets.get(s.id);
        if (r?.unit && r.unit !== unit && s.weight != null)
          s.weight =
            Math.round(
              (unit === "lb" ? kgToLb(r.weight ?? 0) : lbToKg(r.weight ?? 0)) *
                10,
            ) / 10;
      }
      e.confidence = exerciseConfidence(e.sets);
    }
    w.session.confidence = Math.min(
      w.session.confidence,
      ...w.session.exercises.map((e) => e.confidence),
      w.session.startedAt == null ? 0.6 : 1,
    );
    if (w.session.startedAt == null) w.session.flags.push("No date found");
    if (apple && w.session.exercises.length === 0) {
      w.session.confidence = Math.min(w.session.confidence, 0.5);
      w.session.flags.push(
        "Apple Fitness summaries have no exercise names, so this imports as a session without sets",
      );
    }
  }

  const sessions = done.map((w) => w.session);
  // ---- routine fallback: no dates anywhere and only "3x8" style prescriptions
  const routineLike =
    !anyDate &&
    done.length > 0 &&
    done.every((w) => w.prescriptionOnly && w.session.exercises.length > 0);
  if (routineLike) {
    const parsed = parseRoutineText(text);
    draft.routines.push({
      id: newId(),
      name: parsed.name ?? sessions[0]?.title ?? null,
      exercises: sessions.flatMap((s) =>
        s.exercises.map((e) => ({
          id: newId(),
          rawName: e.rawName,
          sets: e.sets.length,
          reps: e.sets[0]?.reps ?? null,
          repsMax:
            parsed.exercises.find((p) => p.rawName === e.rawName)?.repsMax ??
            null,
          weight: e.sets[0]?.weight ?? null,
          confidence: 1,
        })),
      ),
    });
  } else {
    draft.sessions = sessions;
  }
  draft.unparsed = unparsed;
  draft.notes = notes;
  return draft;
}
