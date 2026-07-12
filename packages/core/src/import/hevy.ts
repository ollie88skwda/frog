import { lbToKg } from "../domain/units";
import type { ImportedSession, ImportedSet } from "./types";

// Hevy CSV export columns (confirmed against a real export):
// title, start_time ("19 Jun 2026, 16:42"), end_time, description,
// exercise_title, superset_id, exercise_notes, set_index, set_type,
// weight_lbs (or weight_kg depending on account units), reps,
// distance_miles, duration_seconds, rpe

const MONTHS: Record<string, number> = {
  jan: 0,
  feb: 1,
  mar: 2,
  apr: 3,
  may: 4,
  jun: 5,
  jul: 6,
  aug: 7,
  sep: 8,
  oct: 9,
  nov: 10,
  dec: 11,
};

/** "19 Jun 2026, 16:42" → local-time ms epoch (explicit month map, no Date.parse). */
export function parseHevyDate(raw: string): number | null {
  const m = raw
    .trim()
    .match(/^(\d{1,2})\s+([A-Za-z]{3})\w*\s+(\d{4}),?\s+(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const month = MONTHS[m[2].toLowerCase()];
  if (month === undefined) return null;
  return new Date(
    Number(m[3]),
    month,
    Number(m[1]),
    Number(m[4]),
    Number(m[5]),
  ).getTime();
}

/** Minimal RFC-4180 CSV parser (quoted fields, embedded commas/newlines/quotes). */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  const src = text.replace(/^﻿/, "");
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (inQuotes) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && src[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      if (row.length > 1 || row[0] !== "") rows.push(row);
      row = [];
    } else {
      field += c;
    }
  }
  row.push(field);
  if (row.length > 1 || row[0] !== "") rows.push(row);
  return rows;
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

/** Parse a Hevy CSV export into import-ready sessions (chronological order). */
export function parseHevyCsv(text: string): ImportedSession[] {
  const rows = parseCsv(text);
  if (rows.length < 2) return [];
  const header = rows[0].map((h) => h.trim().toLowerCase());
  const col = (name: string) => header.indexOf(name);
  const iTitle = col("title");
  const iStart = col("start_time");
  const iEnd = col("end_time");
  const iExercise = col("exercise_title");
  const iNotes = col("exercise_notes");
  const iSetIndex = col("set_index");
  const iSetType = col("set_type");
  const iWeightLbs = col("weight_lbs");
  const iWeightKg = col("weight_kg");
  const iReps = col("reps");
  const iRpe = col("rpe");
  if (iStart < 0 || iExercise < 0) {
    throw new Error(
      "not a Hevy export: missing start_time / exercise_title columns",
    );
  }

  type SetRow = ImportedSet & { setIndex: number };
  const sessions = new Map<
    string,
    {
      title: string | null;
      startedAt: number;
      endedAt: number | null;
      order: string[];
      byExercise: Map<string, SetRow[]>;
    }
  >();

  for (const r of rows.slice(1)) {
    const exercise = (r[iExercise] ?? "").trim();
    const startedAt = parseHevyDate(r[iStart] ?? "");
    if (!exercise || startedAt === null) continue;

    const rawLbs = iWeightLbs >= 0 ? (r[iWeightLbs] ?? "").trim() : "";
    const rawKg = iWeightKg >= 0 ? (r[iWeightKg] ?? "").trim() : "";
    const weightKg =
      rawKg !== ""
        ? Number.parseFloat(rawKg)
        : rawLbs !== ""
          ? lbToKg(Number.parseFloat(rawLbs))
          : null;
    const rawReps = (r[iReps] ?? "").trim();
    const reps = rawReps === "" ? null : Math.round(Number.parseFloat(rawReps));
    if (weightKg === null && reps === null) continue; // duration/distance-only rows

    const rawRpe = iRpe >= 0 ? (r[iRpe] ?? "").trim() : "";
    const setType = iSetType >= 0 ? (r[iSetType] ?? "").trim() : "";
    const rir =
      rawRpe !== ""
        ? clamp(Math.round(10 - Number.parseFloat(rawRpe)), 0, 10)
        : setType === "failure"
          ? 0
          : null;
    const note =
      iNotes >= 0 && (r[iNotes] ?? "").trim() !== "" ? r[iNotes].trim() : null;

    const key = `${startedAt}`;
    let session = sessions.get(key);
    if (!session) {
      const title = iTitle >= 0 ? (r[iTitle] ?? "").trim() : "";
      session = {
        title: title === "" ? null : title,
        startedAt,
        endedAt: iEnd >= 0 ? parseHevyDate(r[iEnd] ?? "") : null,
        order: [],
        byExercise: new Map(),
      };
      sessions.set(key, session);
    }
    let sets = session.byExercise.get(exercise);
    if (!sets) {
      sets = [];
      session.byExercise.set(exercise, sets);
      session.order.push(exercise);
    }
    sets.push({
      weightKg: weightKg !== null && Number.isNaN(weightKg) ? null : weightKg,
      reps: reps !== null && Number.isNaN(reps) ? null : reps,
      rir: rir !== null && Number.isNaN(rir) ? null : rir,
      note,
      setIndex: Number.parseInt(r[iSetIndex] ?? "0", 10) || 0,
    });
  }

  return [...sessions.values()]
    .sort((a, b) => a.startedAt - b.startedAt)
    .map((s) => ({
      title: s.title,
      startedAt: s.startedAt,
      endedAt: s.endedAt,
      exercises: s.order.map((name) => ({
        name,
        sets: (s.byExercise.get(name) ?? [])
          .sort((a, b) => a.setIndex - b.setIndex)
          .map(({ setIndex: _setIndex, ...set }) => set),
      })),
    }));
}
