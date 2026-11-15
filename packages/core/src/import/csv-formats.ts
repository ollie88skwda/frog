// File importers that produce an ImportDraft: Hevy, Strong (existing parsers),
// Fitbod, JEFIT, Frog's own sets.csv / JSON export, and a generic CSV with a
// column mapping. `parseImportFile` sniffs the format from the header row.

import { rirFromRpe } from "../domain/e1rm";
import { newId } from "../domain/ids";
import { lbToKg } from "../domain/units";
import type { ExportBundle } from "../repo/types";
import { parseLooseDate } from "./dates";
import {
  draftFromImported,
  emptyDraft,
  exerciseConfidence,
  type ImportDraft,
  type ImportDraftSession,
  type ImportSource,
  importDraftSet,
} from "./draft";
import { parseCsv, parseHevyCsv } from "./hevy";
import { parseStrongCsv } from "./strong";
import type { ImportedSession } from "./types";

const norm = (h: string) =>
  h
    .trim()
    .toLowerCase()
    .replace(/^﻿/, "")
    .replace(/[\s_]+/g, " ");

function num(raw: string | undefined): number | null {
  if (raw == null) return null;
  const s = raw.trim().replace(",", ".");
  if (s === "") return null;
  const v = Number.parseFloat(s);
  return Number.isFinite(v) ? v : null;
}

function sniffDelimiter(text: string): string {
  const first = text.slice(0, Math.max(0, text.indexOf("\n")) || text.length);
  const semi = first.split(";").length;
  const comma = first.split(",").length;
  const tab = first.split("\t").length;
  if (tab > comma && tab > semi) return "\t";
  return semi > comma ? ";" : ",";
}

function rowsOf(text: string): string[][] {
  const d = sniffDelimiter(text);
  if (d === ",") return parseCsv(text);
  // The shared RFC-4180 parser is comma-only; swapping delimiters is safe
  // unless a quoted field holds the delimiter, rare in these exports.
  return parseCsv(text.replaceAll(d, ","));
}

// ---------------------------------------------------------------- Fitbod

/** "2026-06-19 16:42:03 +0000" → { ms (true instant), day (as written) }. */
function parseFitbodDate(raw: string): { ms: number; day: string } | null {
  const m = raw
    .trim()
    .match(
      /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?(?:\s*(Z|[+-]\d{2}:?\d{2}))?/,
    );
  if (!m) return null;
  const [, y, mo, d, h, mi, s, tz] = m;
  const parts = [
    Number(y),
    Number(mo) - 1,
    Number(d),
    Number(h),
    Number(mi),
    Number(s ?? 0),
  ] as const;
  let ms: number;
  if (tz) {
    const off =
      tz === "Z"
        ? 0
        : (tz.startsWith("-") ? -1 : 1) *
          (Number(tz.slice(1, 3)) * 60 + Number(tz.slice(-2)));
    ms = Date.UTC(...parts) - off * 60_000;
  } else ms = new Date(...parts).getTime();
  return Number.isFinite(ms) ? { ms, day: `${y}-${mo}-${d}` } : null;
}

export function parseFitbodCsv(text: string): ImportedSession[] {
  const rows = rowsOf(text);
  if (rows.length < 2) return [];
  const header = rows[0].map(norm);
  const at = (re: RegExp) => header.findIndex((h) => re.test(h));
  const iDate = at(/^date$/);
  const iEx = at(/^exercise$/);
  const iReps = at(/^reps$/);
  const iW = at(/^weight\s*\((kg|lbs?)\)$/);
  const iDur = at(/^duration/);
  const iDist = at(/^distance/);
  const iWarm = at(/^iswarmup$/);
  const iNote = at(/^note/);
  if (iDate < 0 || iEx < 0) return [];
  const lb = iW >= 0 && /lb/.test(header[iW]);

  const byDay = new Map<
    string,
    {
      startedAt: number;
      order: string[];
      ex: Map<string, ImportedSession["exercises"][number]["sets"]>;
    }
  >();
  for (const r of rows.slice(1)) {
    const d = parseFitbodDate(r[iDate] ?? "");
    const name = (r[iEx] ?? "").trim();
    if (!d || !name) continue;
    let day = byDay.get(d.day);
    if (!day) {
      day = { startedAt: d.ms, order: [], ex: new Map() };
      byDay.set(d.day, day);
    }
    day.startedAt = Math.min(day.startedAt, d.ms);
    const w = iW >= 0 ? num(r[iW]) : null;
    const reps = iReps >= 0 ? num(r[iReps]) : null;
    const dur = iDur >= 0 ? num(r[iDur]) : null;
    const dist = iDist >= 0 ? num(r[iDist]) : null;
    if (reps == null && !w && !dur && !dist) continue;
    const warm = iWarm >= 0 && /^(true|1|yes)$/i.test((r[iWarm] ?? "").trim());
    const sets = day.ex.get(name) ?? [];
    if (!day.ex.has(name)) {
      day.ex.set(name, sets);
      day.order.push(name);
    }
    sets.push({
      weightKg: w ? (lb ? lbToKg(w) : w) : null,
      reps: reps == null ? null : Math.round(reps),
      rir: null,
      note: iNote >= 0 && (r[iNote] ?? "").trim() ? r[iNote].trim() : null,
      setType: warm ? "warmup" : "normal",
      durationSec: dur ? Math.round(dur) : null,
      distanceM: dist || null,
    });
  }
  return [...byDay.values()]
    .sort((a, b) => a.startedAt - b.startedAt)
    .map((d) => ({
      title: null,
      startedAt: d.startedAt,
      endedAt: null,
      exercises: d.order.map((name) => ({ name, sets: d.ex.get(name) ?? [] })),
    }));
}

// ---------------------------------------------------------- generic CSV

export type CsvField =
  | "date"
  | "exercise"
  | "weight"
  | "reps"
  | "rir"
  | "rpe"
  | "title"
  | "note"
  | "unit"
  | "setType";

/** field → column index (-1/absent = not mapped). */
export type CsvMapping = Partial<Record<CsvField, number>>;

export const CSV_FIELD_LABELS: Record<CsvField, string> = {
  date: "Date",
  exercise: "Exercise",
  weight: "Weight",
  reps: "Reps",
  rir: "RIR",
  rpe: "RPE",
  title: "Workout name",
  note: "Notes",
  unit: "Weight unit",
  setType: "Set type",
};

const ALIASES: Record<CsvField, RegExp> = {
  date: /^(date|start time|start date|started at|session started at|workout date|day|time|mydate|log date|logdate|performed)/,
  exercise:
    /^(exercise|exercise name|exercise title|movement|lift|name|ename|exercise_name)$/,
  weight:
    /^(weight|load|weight kg|weight lbs?|weight \((kg|lbs?)\)|weight\((kg|lbs?)\)|kg|lbs?|weight used)$/,
  reps: /^(reps|rep|repetitions|reps done|total reps)$/,
  rir: /^(rir|reps in reserve)$/,
  rpe: /^(rpe)$/,
  title: /^(workout|workout name|title|routine|session|session name|day name)$/,
  note: /^(note|notes|comment|comments)$/,
  unit: /^(unit|weight unit|units)$/,
  setType: /^(set type|type|setype)$/,
};

export function guessMapping(headers: string[]): CsvMapping {
  const h = headers.map(norm);
  const map: CsvMapping = {};
  for (const f of Object.keys(ALIASES) as CsvField[]) {
    const i = h.findIndex((x) => ALIASES[f].test(x));
    if (i >= 0) map[f] = i;
  }
  return map;
}

function parseEpoch(raw: string): number | null {
  if (!/^\d{10}(\d{3})?$/.test(raw.trim())) return null;
  const n = Number(raw.trim());
  return raw.trim().length === 10 ? n * 1000 : n;
}

export type GenericOptions = {
  mapping: CsvMapping;
  /** Unit of the weight column when it carries no unit of its own. */
  unit: "kg" | "lb";
  /** Resolve numeric dates like 03/04/2026. */
  dateOrder?: "dmy" | "mdy";
  source?: ImportSource;
  now?: number;
};

/** Sheet + mapping → draft. Rows that cannot be read are reported in `unparsed`. */
export function genericCsvToDraft(
  rows: string[][],
  opts: GenericOptions,
): ImportDraft {
  const { mapping: m } = opts;
  const draft = emptyDraft(opts.source ?? "generic-csv", opts.unit, false);
  const get = (r: string[], f: CsvField) => {
    const i = m[f];
    return i == null || i < 0 ? "" : (r[i] ?? "").trim();
  };
  if (m.date == null || m.exercise == null) return draft;
  let ambiguous = false;
  const sessions = new Map<string, ImportDraftSession>();
  const rowFlags = new Map<string, boolean>();
  for (const [n, r] of rows.slice(1).entries()) {
    if (r.every((c) => c.trim() === "")) continue;
    const dateRaw = get(r, "date");
    const name = get(r, "exercise");
    const epoch = parseEpoch(dateRaw);
    const ld =
      epoch == null
        ? parseLooseDate(dateRaw, { now: opts.now, order: opts.dateOrder })
        : null;
    const ms = epoch ?? ld?.ms ?? null;
    if (ms == null || !name) {
      draft.unparsed.push(`Row ${n + 2}: ${r.join(", ").slice(0, 80)}`);
      continue;
    }
    if (ld?.ambiguous) ambiguous = true;
    const hasTime = epoch != null || (ld?.hasTime ?? false);
    const title = get(r, "title") || null;
    const key = hasTime
      ? `${ms}|${title ?? ""}`
      : `${new Date(ms).toDateString()}|${title ?? ""}`;
    let s = sessions.get(key);
    if (!s) {
      s = {
        id: newId(),
        title,
        startedAt: ms,
        hasTime,
        endedAt: null,
        exercises: [],
        confidence: ld?.ambiguous ? 0.7 : 1,
        flags: ld?.ambiguous ? ["Day/month order guessed"] : [],
      };
      sessions.set(key, s);
    }
    // Per-row unit: column wins, then a unit in the weight header's own name.
    const unitCell = get(r, "unit").toLowerCase();
    const headerUnit = rows[0][m.weight ?? -1]?.toLowerCase() ?? "";
    const rowLb = unitCell
      ? unitCell.startsWith("lb")
      : /lb|pound/.test(headerUnit)
        ? true
        : /kg/.test(headerUnit)
          ? false
          : opts.unit === "lb";
    if (unitCell || /lb|kg/.test(headerUnit)) draft.unitDetected = true;
    const w = num(get(r, "weight"));
    const reps = num(get(r, "reps"));
    const rpe = num(get(r, "rpe"));
    const rirRaw = num(get(r, "rir"));
    const stype = get(r, "setType").toLowerCase();
    const rowUnit = rowLb ? "lb" : "kg";
    if (rowUnit !== draft.unit) rowFlags.set(rowUnit, true);
    const weight =
      w == null
        ? null
        : rowUnit === draft.unit
          ? w
          : rowUnit === "lb"
            ? Math.round(lbToKg(w) * 100) / 100
            : Math.round((w / 0.45359237) * 10) / 10;
    let ex = s.exercises.find((e) => e.rawName === name);
    if (!ex) {
      ex = { id: newId(), rawName: name, sets: [], confidence: 1 };
      s.exercises.push(ex);
    }
    ex.sets.push(
      importDraftSet({
        weight,
        reps: reps == null ? null : Math.round(reps),
        rir: rirRaw ?? (rpe == null ? null : rirFromRpe(rpe)),
        note: get(r, "note") || null,
        setType: /warm/.test(stype)
          ? "warmup"
          : /fail/.test(stype)
            ? "failure"
            : /drop/.test(stype)
              ? "drop"
              : "normal",
        confidence: w == null && reps == null ? 0.5 : 1,
        flags: w == null && reps == null ? ["No weight or reps"] : [],
      }),
    );
  }
  for (const s of sessions.values())
    for (const e of s.exercises) e.confidence = exerciseConfidence(e.sets);
  draft.sessions = [...sessions.values()].sort(
    (a, b) => (a.startedAt ?? 0) - (b.startedAt ?? 0),
  );
  if (ambiguous)
    draft.notes.push(
      "Some dates were like 03/04/2026; month-first was assumed. Check the dates below.",
    );
  if (rowFlags.size)
    draft.notes.push("Mixed kg and lb rows were converted to one unit.");
  return draft;
}

// ----------------------------------------------------------------- Frog

type Bundleish = Partial<ExportBundle>;

/** Frog's JSON export (Settings > Data > Export) → sessions. */
export function parseFrogJson(text: string): ImportedSession[] {
  const b = JSON.parse(text) as Bundleish;
  if (!Array.isArray(b.sessions) || !Array.isArray(b.setLogs))
    throw new Error("not a Frog export: missing sessions / setLogs");
  const exName = new Map((b.exercises ?? []).map((e) => [e.id, e.name]));
  const seById = new Map((b.sessionExercises ?? []).map((x) => [x.id, x]));
  const logs = new Map<string, NonNullable<Bundleish["setLogs"]>>();
  for (const l of b.setLogs) {
    if (l.deletedAt != null) continue;
    const list = logs.get(l.sessionExerciseId) ?? [];
    list.push(l);
    logs.set(l.sessionExerciseId, list);
  }
  const out: ImportedSession[] = [];
  for (const s of b.sessions) {
    if (s.deletedAt != null) continue;
    const ses = (b.sessionExercises ?? [])
      .filter((x) => x.sessionId === s.id && x.deletedAt == null)
      .sort((a, c) => a.orderIndex - c.orderIndex);
    void seById;
    out.push({
      title: s.title ?? null,
      startedAt: s.startedAt,
      endedAt: s.endedAt ?? null,
      exercises: ses.flatMap((se) => {
        const name = exName.get(se.exerciseId);
        const sets = (logs.get(se.id) ?? []).sort((a, c) => a.setNo - c.setNo);
        if (!name || sets.length === 0) return [];
        return [
          {
            name,
            sets: sets.map((l) => ({
              weightKg: l.weightKg ?? null,
              reps: l.reps ?? null,
              rir: l.rir ?? null,
              note: l.note ?? null,
              setType: l.setType,
              durationSec: l.durationSec ?? null,
              distanceM: l.distanceM ?? null,
            })),
          },
        ];
      }),
    });
  }
  return out.sort((a, c) => a.startedAt - c.startedAt);
}

/** Frog sets.csv (ISO start, weight_kg, one row per set; side rows stay separate sets). */
export function parseFrogCsv(text: string): ImportedSession[] {
  const rows = rowsOf(text);
  if (rows.length < 2) return [];
  const h = rows[0].map(norm);
  const c = (n: string) => h.indexOf(n);
  const [iT, iTitle, iEx, iNo, iType, iW, iR, iDur, iDist, iRir, iNote] = [
    "session started at",
    "session title",
    "exercise",
    "set no",
    "set type",
    "weight kg",
    "reps",
    "duration sec",
    "distance m",
    "rir",
    "note",
  ].map(c);
  if (iT < 0 || iEx < 0) return [];
  const sessions = new Map<
    number,
    {
      title: string | null;
      order: string[];
      ex: Map<
        string,
        {
          no: number;
          set: ImportedSession["exercises"][number]["sets"][number];
        }[]
      >;
    }
  >();
  for (const r of rows.slice(1)) {
    const t = Date.parse(r[iT] ?? "");
    const name = (r[iEx] ?? "").trim();
    if (!Number.isFinite(t) || !name) continue;
    let s = sessions.get(t);
    if (!s) {
      s = {
        title: iTitle >= 0 ? (r[iTitle] ?? "").trim() || null : null,
        order: [],
        ex: new Map(),
      };
      sessions.set(t, s);
    }
    const list = s.ex.get(name) ?? [];
    if (!s.ex.has(name)) {
      s.ex.set(name, list);
      s.order.push(name);
    }
    list.push({
      no: iNo >= 0 ? (num(r[iNo]) ?? 0) : list.length,
      set: {
        weightKg: iW >= 0 ? num(r[iW]) : null,
        reps: iR >= 0 ? num(r[iR]) : null,
        rir: iRir >= 0 ? num(r[iRir]) : null,
        note: iNote >= 0 ? (r[iNote] ?? "").trim() || null : null,
        setType: iType >= 0 ? (r[iType] ?? "").trim() || "normal" : "normal",
        durationSec: iDur >= 0 ? num(r[iDur]) : null,
        distanceM: iDist >= 0 ? num(r[iDist]) : null,
      },
    });
  }
  return [...sessions.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([t, s]) => ({
      title: s.title,
      startedAt: t,
      endedAt: null,
      exercises: s.order.map((name) => ({
        name,
        sets: (s.ex.get(name) ?? [])
          .sort((a, b) => a.no - b.no)
          .map((x) => x.set),
      })),
    }));
}

// --------------------------------------------------------------- detect

export type FileFormat =
  | "hevy-csv"
  | "strong-csv"
  | "fitbod-csv"
  | "jefit-csv"
  | "frog-csv"
  | "frog-json"
  | "generic-csv";

export function detectFormat(text: string): FileFormat {
  const t = text.replace(/^﻿/, "").trimStart();
  if (t.startsWith("{")) return "frog-json";
  const rows = rowsOf(t.slice(0, 4000));
  const h = (rows[0] ?? []).map(norm);
  const has = (s: string) => h.includes(s);
  if (has("start time") && has("exercise title")) return "hevy-csv";
  if (has("session started at") && has("weight kg")) return "frog-csv";
  if (
    has("date") &&
    has("exercise name") &&
    (has("set order") || has("workout name"))
  )
    return "strong-csv";
  if (
    has("date") &&
    has("exercise") &&
    h.some((x) => /^weight\s*\((kg|lbs?)\)$/.test(x)) &&
    (has("iswarmup") || has("multiplier"))
  )
    return "fitbod-csv";
  if (
    h.some((x) =>
      /^(ename|e id|mydate|belongsession|logtime|log time)$/.test(x),
    ) ||
    h.some((x) => x.includes("jefit"))
  )
    return "jefit-csv";
  return "generic-csv";
}

export type FileParseResult = {
  format: FileFormat;
  draft: ImportDraft;
  /** Present for generic/JEFIT so the UI can offer the column mapping step. */
  headers?: string[];
  rows?: string[][];
  mapping?: CsvMapping;
};

/** One entry point for every file: sniff → parse → ImportDraft. */
export function parseImportFile(
  text: string,
  opts: { defaultUnit?: "kg" | "lb"; now?: number } = {},
): FileParseResult {
  const format = detectFormat(text);
  const unit = opts.defaultUnit ?? "kg";
  switch (format) {
    case "hevy-csv":
      return {
        format,
        draft: draftFromImported("hevy-csv", parseHevyCsv(text)),
      };
    case "strong-csv":
      return {
        format,
        draft: draftFromImported("strong-csv", parseStrongCsv(text)),
      };
    case "fitbod-csv":
      return {
        format,
        draft: draftFromImported("fitbod-csv", parseFitbodCsv(text)),
      };
    case "frog-csv":
      return {
        format,
        draft: draftFromImported("frog-csv", parseFrogCsv(text)),
      };
    case "frog-json":
      return {
        format,
        draft: draftFromImported("frog-json", parseFrogJson(text)),
      };
    default: {
      const rows = rowsOf(text);
      const mapping = guessMapping(rows[0] ?? []);
      const draft = genericCsvToDraft(rows, {
        mapping,
        unit,
        now: opts.now,
        source: format === "jefit-csv" ? "jefit-csv" : "generic-csv",
      });
      return { format, draft, headers: rows[0] ?? [], rows, mapping };
    }
  }
}
