// Rule-based parser: OCR text lines from a workout screenshot -> one session
// of exercises/sets with per-row confidence. Deterministic, no ML. Handles the
// row shapes of Hevy, Strong, Fitbod, JEFIT and Apple Fitness summaries plus
// a generic "NxM @ W" fallback, and repairs common OCR noise (O/0, l/1, Ib/lb,
// glued units, comma decimals). The editable review screen is the safety net.

import type { WeightUnit } from "../draft";
import type {
  OcrLine,
  ScreenshotApp,
  ScreenshotExercise,
  ScreenshotParse,
  ScreenshotSet,
} from "./types";

const NUM = "(\\d+(?:[.,]\\d+)?)";
const UNIT = "(kg|lbs?|lb)";

function num(s: string): number {
  return Number.parseFloat(s.replace(",", "."));
}
function unitOf(s: string | undefined): WeightUnit | null {
  if (!s) return null;
  return s.toLowerCase().startsWith("k") ? "kg" : "lb";
}

/** True when a fix was applied (the row gets a confidence haircut). */
export function normalize(line: string): { text: string; fixed: boolean } {
  let fixed = false;
  let t = line
    .replace(/[×✕✖*]/g, "x")
    .replace(/[–—]/g, "-")
    .replace(/[“”"‘’`|]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  // digit-like tokens: O->0, l/I->1, S->5, B->8 (only if a real digit is present)
  t = t
    .split(" ")
    .map((tok) => {
      if (
        /^[0-9OolIS.,]+$/.test(tok) &&
        /\d/.test(tok) &&
        /[OolIS]/.test(tok)
      ) {
        fixed = true;
        return tok
          .replace(/[Oo]/g, "0")
          .replace(/[lI]/g, "1")
          .replace(/S/g, "5");
      }
      return tok;
    })
    .join(" ");
  const before = t;
  t = t
    .replace(/(\d)\s*(?:Ib|IB|1b|lb|LB)s?(?=x|X|\s|$|\d)/g, "$1 lb")
    .replace(/(\d)\s*kq\b/gi, "$1 kg")
    .replace(/(\d)\s*b(?=\s*x\s*\d)/g, "$1 lb")
    .replace(/(\d)\s*(kg|lbs?)(?=x|\b)/gi, "$1 $2 ")
    .replace(/(\d)\s*[xX]\s*(?=\d)/g, "$1 x ")
    .replace(/(kg|lbs?)\s*x\s*/gi, (m) => m.replace(/\s*x\s*/i, " x "))
    .replace(/\s+/g, " ")
    .trim();
  if (t !== before && /\b(Ib|kq)\b|\dIb|\dkq/.test(before)) fixed = true;
  return { text: t, fixed };
}

type RawSet = {
  label: string | null;
  weight: number | null;
  unit: WeightUnit | null;
  reps: number | null;
  rir: number | null;
  count: number; // how many identical sets (NxM summary lines)
  clean: number; // 0..1 parse cleanliness
};

const RIR_RE = /(?:@|\bRPE\b|\bRIR\b)\s*(\d+(?:\.\d+)?)\s*(?:RIR)?\s*$/i;

function rirOf(text: string): { rest: string; rir: number | null } {
  const m = /\b(?:RIR)\s*(\d)\b|\b(\d)\s*RIR\b/i.exec(text);
  if (m) {
    return {
      rest: text.replace(m[0], "").trim(),
      rir: Number.parseInt(m[1] ?? m[2], 10),
    };
  }
  const r = RIR_RE.exec(text);
  if (r && /x/i.test(text.slice(0, r.index))) {
    const v = Number.parseFloat(r[1]);
    // Strong/Hevy show RPE as "@ 8"; RIR = 10 - RPE.
    if (v >= 5 && v <= 10) {
      return { rest: text.slice(0, r.index).trim(), rir: Math.round(10 - v) };
    }
  }
  return { rest: text, rir: null };
}

type TableMode = { unit: WeightUnit | null; previous: boolean } | null;

function parseTableHeader(text: string): TableMode {
  const up = text.toUpperCase();
  if (/\d/.test(up)) return null;
  if (!/\bSET\b/.test(up) || !/\bREPS?\b/.test(up)) return null;
  if (!/\b(KG|LBS?|WEIGHT|PREVIOUS|LES|IBS)\b|\+KG/.test(up)) return null;
  const unit = /\bKG\b|\+KG/.test(up)
    ? "kg"
    : /\b(LBS?|LES|IBS)\b/.test(up)
      ? "lb"
      : null;
  return { unit, previous: /\bPREV/.test(up) };
}

export function parseSetLine(
  text: string,
  table: TableMode,
  bareOk = false,
): RawSet | null {
  const { rest, rir } = rirOf(text);
  let m: RegExpExecArray | null;

  // "3 sets x 8 reps @ 100 lb" / "3 x 8 @ 100kg" / "3x8"
  m = new RegExp(
    `^(?:set\\s*)?${"(\\d+)"} ?(?:sets?)? ?x ${"(\\d+)"}(?: ?reps?)?(?: ?(?:@|at|x|-|with) ?${NUM} ?${UNIT})?$`,
    "i",
  ).exec(rest);
  if (m && (bareOk || /sets?\b/i.test(rest) || m[3])) {
    return {
      label: null,
      count: Number.parseInt(m[1], 10),
      reps: Number.parseInt(m[2], 10),
      weight: m[3] ? num(m[3]) : null,
      unit: unitOf(m[4]),
      rir,
      clean: 1,
    };
  }

  // "[Set] 1: 100 kg x 8 [reps]" / "W 60 lb x 8" / "100 kg x 8" / "Set 1 8 reps x 100 lb"
  m = new RegExp(
    `^(?:(?:set ?)?([0-9wWdDfF]{1,2})[ :.-]*)?${NUM} ?${UNIT} ?x ${"(\\d+)"}(?: ?reps?)?$`,
    "i",
  ).exec(rest);
  if (m) {
    return {
      label: m[1] ?? null,
      weight: num(m[2]),
      unit: unitOf(m[3]),
      reps: Number.parseInt(m[4], 10),
      rir,
      count: 1,
      clean: 1,
    };
  }
  // Fitbod: "Set 1 8 reps 100 lb" / "8 reps x 100 lb" / "8 reps"
  m = new RegExp(
    `^(?:(?:set ?)?(\\d{1,2})[ :.-]*)?${"(\\d+)"} ?reps?(?: ?x? ?${NUM} ?${UNIT})?$`,
    "i",
  ).exec(rest);
  if (m) {
    return {
      label: m[1] ?? null,
      reps: Number.parseInt(m[2], 10),
      weight: m[3] ? num(m[3]) : null,
      unit: unitOf(m[4]),
      rir,
      count: 1,
      clean: m[3] ? 1 : 0.85,
    };
  }
  // "Set 1: 8 x 100 lb"  (reps first)
  m = new RegExp(
    `^(?:(?:set ?)?(\\d{1,2})[ :.-]*)?${"(\\d+)"} x ${NUM} ?${UNIT}$`,
    "i",
  ).exec(rest);
  if (m) {
    return {
      label: m[1] ?? null,
      reps: Number.parseInt(m[2], 10),
      weight: num(m[3]),
      unit: unitOf(m[4]),
      rir,
      count: 1,
      clean: 0.9,
    };
  }

  // Table rows under a "SET KG REPS" header: "1 100 8", "W 60 8", "2 - 12"
  if (table) {
    let body = rest;
    if (table.previous) {
      body = body.replace(
        new RegExp(`${NUM} ?(?:${UNIT})? ?x ${"(\\d+)"}`, "i"),
        " ",
      );
      body = body.replace(/\s+-\s+/, " ");
    }
    body = body.replace(/\s+/g, " ").trim();
    // OCR often misreads the set index ("2" -> "pA"); keep the row, dock it.
    let guessed = false;
    if (/^[A-Za-z]{2} /.test(body) && !/^[wWdDfF] /.test(body)) {
      body = `0 ${body.slice(3)}`;
      guessed = true;
    }
    m = new RegExp(
      `^([0-9wWdDfF]{1,2}) ${NUM}? ?(?:${UNIT} )?-? ?${"(\\d+)"}$`,
      "i",
    ).exec(body);
    if (m) {
      return {
        label: guessed ? null : m[1],
        weight: m[2] ? num(m[2]) : null,
        unit: table.unit ?? unitOf(m[3]),
        reps: Number.parseInt(m[4], 10),
        rir,
        count: 1,
        clean: (m[2] ? 0.95 : 0.8) * (guessed ? 0.75 : 1),
      };
    }
  }
  return null;
}

function parseInlineExercise(
  text: string,
): { name: string; set: RawSet } | null {
  const m =
    /^(.*?[A-Za-z)])\s*[:\-,]?\s+(\d+ ?(?:sets? ?)?x ?\d+(?: ?reps?)?(?:\s*(?:@|at|x|-|with)\s*\d+(?:[.,]\d+)? ?(?:kg|lbs?))?(?:\s*(?:@|RPE|RIR)\s*\d+)?)$/i.exec(
      text,
    );
  if (!m) return null;
  const set = parseSetLine(m[2], null, true);
  const name = cleanName(m[1]);
  return set && name ? { name, set } : null;
}

const MONTHS = [
  "jan",
  "feb",
  "mar",
  "apr",
  "may",
  "jun",
  "jul",
  "aug",
  "sep",
  "oct",
  "nov",
  "dec",
];

function iso(y: number, mo: number, d: number): string | null {
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || y < 2000 || y > 2100) return null;
  return `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

export type ParsedDate = { date: string; ambiguous: boolean };

export function parseDate(text: string): ParsedDate | null {
  const sure = (date: string | null) =>
    date ? { date, ambiguous: false } : null;
  let m = /\b(20\d\d)-(\d{1,2})-(\d{1,2})\b/.exec(text);
  if (m) return sure(iso(+m[1], +m[2], +m[3]));
  m = /\b([A-Za-z]{3})[a-z]*\.? (\d{1,2})(?:st|nd|rd|th)?,? (20\d\d)\b/.exec(
    text,
  );
  if (m) {
    const mo = MONTHS.indexOf(m[1].toLowerCase());
    if (mo >= 0) return sure(iso(+m[3], mo + 1, +m[2]));
  }
  m = /\b(\d{1,2})(?:st|nd|rd|th)? ([A-Za-z]{3})[a-z]*\.?,? (20\d\d)\b/.exec(
    text,
  );
  if (m) {
    const mo = MONTHS.indexOf(m[2].toLowerCase());
    if (mo >= 0) return sure(iso(+m[3], mo + 1, +m[1]));
  }
  m = /\b(\d{1,2})\/(\d{1,2})\/(20\d\d)\b/.exec(text);
  if (m) {
    const a = +m[1];
    const b = +m[2];
    // month-first unless the first number can only be a day
    const date = a > 12 ? iso(+m[3], b, a) : iso(+m[3], a, b);
    return date ? { date, ambiguous: a <= 12 && b <= 12 && a !== b } : null;
  }
  return null;
}

export function parseDurationMin(text: string): number | null {
  let m = /\b(\d{1,2})\s*h(?:r|our)?s?\s*(\d{1,2})\s*m(?:in)?/i.exec(text);
  if (m) return +m[1] * 60 + +m[2];
  m = /\b(\d{1,2})\s*h(?:r|our)?s?\b/i.exec(text);
  if (m) return +m[1] * 60;
  m = /\b(\d{1,3})\s*(?:min|mins|minutes|m)\b/i.exec(text);
  if (m) return +m[1];
  m = /^(\d{1,2}):(\d{2}):(\d{2})$/.exec(text.trim());
  if (m) return +m[1] * 60 + +m[2];
  m = /\b(?:duration|time)\b\D*(\d{1,2}):(\d{2})(?::(\d{2}))?/i.exec(text);
  if (m) return m[3] ? +m[1] * 60 + +m[2] : +m[1];
  return null;
}

// Lines that carry no exercise name.
const NOISE_RE =
  /^(notes?|volume|sets?|reps?|time|duration|finish|edit|share|done|save|add (set|exercise)|rest( timer)?|previous|workout (summary|complete)|summary|history|routine|\d+ ?(min|mins|cal|kcal|bpm)|total .*|active calories.*|total calories.*|avg.*|average.*|heart rate.*|prs?|best set.*|1rm.*|%?\d+%?)$/i;

function isNoise(text: string): boolean {
  const letters = text.replace(/[^A-Za-z]/g, "");
  if (letters.length < 3) return true;
  if (NOISE_RE.test(text)) return true;
  if (letters.length / text.replace(/\s/g, "").length < 0.6) return true;
  return false;
}

function detectApp(norm: string[]): ScreenshotApp {
  const all = norm.join("\n");
  if (
    /active calories|traditional strength|functional strength|workout summary|move ring/i.test(
      all,
    ) &&
    !/\d ?(kg|lb).* x \d/i.test(all)
  )
    return "apple";
  if (/\bPREVIOUS\b/i.test(all) && /\bSET\b/i.test(all)) return "strong";
  if (/\bSET\b.*\b(KG|LBS)\b.*\bREPS\b/i.test(all)) return "hevy";
  if (/\d+ reps?\b/i.test(all) && /\bset \d/i.test(all)) return "fitbod";
  if (/\bset \d+:.*x \d+/i.test(all) || /jefit/i.test(all)) return "jefit";
  return "generic";
}

function cleanName(text: string): string {
  return text
    .replace(/^[\s\d]{1,3}[.)]\s+/, "")
    .replace(/^[^A-Za-z(]+/, "")
    .replace(/[^A-Za-z0-9)\]]+$/, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function parseScreenshotLines(lines: OcrLine[]): ScreenshotParse {
  const norm = lines
    .filter((l) => l.text.trim())
    .map((l) => ({ ...normalize(l.text), conf: clamp(l.confidence) }));
  const app = detectApp(norm.map((n) => n.text));

  const exercises: ScreenshotExercise[] = [];
  const unparsed: string[] = [];
  const preface: { text: string; conf: number }[] = [];
  let date: string | null = null;
  let dateAmbiguous = false;
  let durationMin: number | null = null;
  let table: TableMode = null;
  let title: string | null = null;
  let current: ScreenshotExercise | null = null;
  const units: WeightUnit[] = [];

  for (const n of norm) {
    const { text } = n;
    const header = parseTableHeader(text);
    if (header) {
      table = header;
      continue;
    }
    const d = parseDate(text);
    if (d && !date) {
      date = d.date;
      dateAmbiguous = d.ambiguous;
      const dur = parseDurationMin(text);
      if (dur !== null && durationMin === null) durationMin = dur;
      // "Gym 11/12/2026": whatever lettered text is left is the title.
      const left = cleanName(
        text
          .replace(
            /\b20\d\d-\d{1,2}-\d{1,2}\b|\b\d{1,2}\/\d{1,2}\/20\d\d\b/g,
            " ",
          )
          .replace(
            /\b[A-Za-z]{3,9}\.? \d{1,2}(?:st|nd|rd|th)?,? 20\d\d\b|\b\d{1,2} [A-Za-z]{3,9},? 20\d\d\b/g,
            " ",
          )
          .replace(
            /\b(mon|tues?|wed(nes)?|thu(rs)?|fri|sat(ur)?|sun)(day)?,?\b/gi,
            " ",
          )
          .replace(/[\d:]+\s*(h|hr|hours?|m|min|mins)\b/gi, " "),
      );
      if (left.replace(/[^A-Za-z]/g, "").length >= 3)
        preface.push({ text: left, conf: n.conf });
      continue;
    }
    // "Bench press 3x8 @ 100kg": a whole exercise on one line.
    const inline = parseInlineExercise(text);
    if (inline) {
      current = null;
      if (exercises.length === 0 && title === null && preface.length > 0) {
        title = cleanName(preface[0].text);
      }
      preface.length = 0;
      const confidence = round(n.conf * (n.fixed ? 0.85 : 1));
      if (inline.set.unit) units.push(inline.set.unit);
      exercises.push({
        rawName: inline.name,
        nameConfidence: n.conf,
        sets: Array.from({ length: Math.min(inline.set.count, 30) }, () => ({
          reps: inline.set.reps,
          weight: inline.set.weight,
          unit: inline.set.unit,
          rir: inline.set.rir,
          warmup: false,
          confidence,
          raw: text,
        })),
      });
      continue;
    }
    const set = parseSetLine(text, table);
    if (set) {
      if (!current) {
        // set rows before any exercise name: use the last preface line
        const cand = preface.pop();
        if (cand) {
          if (exercises.length === 0 && preface.length > 0) {
            title = cleanName(preface[0].text);
            preface.length = 0;
          }
          current = {
            rawName: cleanName(cand.text),
            nameConfidence: cand.conf,
            sets: [],
          };
          exercises.push(current);
        } else {
          unparsed.push(text);
          continue;
        }
      }
      const implausible =
        (set.reps !== null && set.reps > 60) ||
        (set.weight !== null && set.weight > 700);
      const confidence = round(
        n.conf * set.clean * (n.fixed ? 0.85 : 1) * (implausible ? 0.5 : 1),
      );
      const unit = set.unit ?? table?.unit ?? null;
      if (unit) units.push(unit);
      const base: ScreenshotSet = {
        reps: set.reps,
        weight: set.weight,
        unit,
        rir: set.rir,
        warmup: set.label ? /^w/i.test(set.label) : false,
        confidence,
        raw: text,
      };
      for (let i = 0; i < Math.min(set.count, 30); i++)
        current.sets.push({ ...base });
      continue;
    }
    const dur = parseDurationMin(text);
    if (
      dur !== null &&
      durationMin === null &&
      !/[A-Za-z]{4,}.*\d+ ?x ?\d+/.test(text)
    ) {
      durationMin = dur;
      continue;
    }
    if (isNoise(text)) {
      unparsed.push(text);
      continue;
    }
    // A lettered line: an exercise name (or the title) awaiting its set rows.
    current = null;
    preface.push({ text, conf: n.conf });
  }

  // Trailing names never followed by a readable set row are surfaced as empty
  // exercises so the user sees them and can fill the sets in on review.
  for (const p of preface) {
    exercises.push({
      rawName: cleanName(p.text),
      nameConfidence: p.conf * 0.5,
      sets: [],
    });
  }

  for (const e of exercises) {
    const letters = e.rawName.replace(/[^A-Za-z]/g, "").length;
    e.nameConfidence = round(e.nameConfidence * Math.min(1, letters / 4));
  }

  return {
    app,
    session: {
      title: title || null,
      date,
      dateAmbiguous,
      durationMin,
      exercises: app === "apple" ? [] : exercises.filter((e) => e.rawName),
    },
    unit: majority(units),
    unparsed,
  };
}

function majority(units: WeightUnit[]): WeightUnit | null {
  if (units.length === 0) return null;
  const kg = units.filter((u) => u === "kg").length;
  return kg >= units.length - kg ? "kg" : "lb";
}
function clamp(n: number): number {
  return Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0;
}
function round(n: number): number {
  return Math.round(n * 100) / 100;
}
