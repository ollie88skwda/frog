import type { ExportSession } from "./export";
import { lbToKg } from "./units";

function norm(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function findCol(headers: string[], ...candidates: string[]): number {
  for (const c of candidates) {
    const idx = headers.findIndex((h) => norm(h) === norm(c));
    if (idx !== -1) return idx;
  }
  return -1;
}

function parseDate(s: string): number {
  if (!s) return 0;
  // "2024-01-15 10:30:00" or "2024-01-15T10:30:00" — space → T makes it parseable
  const d = new Date(s.replace(" ", "T"));
  if (!isNaN(d.getTime())) return d.getTime();
  // Fallback: date-only "2024-01-15"
  const d2 = new Date(s.slice(0, 10));
  return isNaN(d2.getTime()) ? 0 : d2.getTime();
}

function parseCSVLine(line: string): string[] {
  const fields: string[] = [];
  let cur = "";
  let inQuote = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuote) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"') { inQuote = false; }
      else { cur += ch; }
    } else {
      if (ch === '"') { inQuote = true; }
      else if (ch === ',') { fields.push(cur); cur = ""; }
      else { cur += ch; }
    }
  }
  fields.push(cur);
  return fields;
}

export type HevyCsvWarning = {
  row: number;
  message: string;
};

export type ParseHevyResult = {
  sessions: ExportSession[];
  warnings: HevyCsvWarning[];
};

/**
 * Parses a Hevy workout CSV export (classic and new format) into ExportSession rows.
 *
 * Classic format (≤2023):
 *   Date, Workout Name, Duration, Exercise Name, Set Order, Weight (lbs), Reps, …, RPE
 * New format (2024+):
 *   Title, Start Time, End Time, …, Exercise Title, …, Set Order, Weight, Reps, …, Set Type, Weight Unit, …
 *
 * Weight is always stored in kg on output; lbs are converted using KG_PER_LB.
 * RPE is converted to RIR approximation: RIR = round(10 − RPE), clamped ≥ 0.
 */
export function parseHevyCSV(text: string): ParseHevyResult {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) {
    return { sessions: [], warnings: [{ row: 0, message: "Empty or header-only CSV" }] };
  }

  const headers = parseCSVLine(lines[0]).map((h) => h.trim());
  const warnings: HevyCsvWarning[] = [];

  // Column detection — handles both classic and new format headers
  const dateCol       = findCol(headers, "Date", "Start Time");
  const titleCol      = findCol(headers, "Workout Name", "Title");
  const exCol         = findCol(headers, "Exercise Name", "Exercise Title");
  const setOrderCol   = findCol(headers, "Set Order");
  const weightCol     = findCol(headers, "Weight (lbs)", "Weight");
  const repsCol       = findCol(headers, "Reps");
  const rpeCol        = findCol(headers, "RPE");
  const weightUnitCol = findCol(headers, "Weight Unit");

  if (dateCol === -1)   warnings.push({ row: 0, message: "No date column found (expected 'Date' or 'Start Time')" });
  if (exCol === -1)     warnings.push({ row: 0, message: "No exercise column found (expected 'Exercise Name' or 'Exercise Title')" });
  if (weightCol === -1) warnings.push({ row: 0, message: "No weight column found" });
  if (repsCol === -1)   warnings.push({ row: 0, message: "No reps column found" });

  const sessions: ExportSession[] = [];

  for (let i = 1; i < lines.length; i++) {
    const fields = parseCSVLine(lines[i]);
    const get = (col: number) => (col !== -1 && col < fields.length ? fields[col].trim() : "");

    const rawExercise = get(exCol);
    if (!rawExercise) continue;

    const rawDate   = get(dateCol);
    const rawTitle  = get(titleCol);
    const rawOrder  = get(setOrderCol);
    const rawWeight = get(weightCol);
    const rawReps   = get(repsCol);
    const rawRpe    = get(rpeCol);
    const rawUnit   = get(weightUnitCol);

    const date = parseDate(rawDate);
    if (!date) {
      warnings.push({ row: i + 1, message: `Could not parse date: "${rawDate}"` });
      continue;
    }

    const weightRaw = rawWeight !== "" ? parseFloat(rawWeight) : NaN;
    const repsRaw   = rawReps   !== "" ? parseInt(rawReps, 10) : NaN;
    const rpeRaw    = rawRpe    !== "" ? parseFloat(rawRpe) : NaN;
    const setNo     = rawOrder  !== "" ? parseInt(rawOrder, 10) : 1;

    const weight = isNaN(weightRaw) ? null : weightRaw;
    const reps   = isNaN(repsRaw)   ? null : repsRaw;
    const rpe    = isNaN(rpeRaw)    ? null : rpeRaw;

    // Weight unit: explicit column wins; fall back to column header name
    const isKg = rawUnit
      ? rawUnit.toLowerCase() === "kg"
      : headers[weightCol]?.toLowerCase().includes("kg");
    const weightKg = weight != null ? (isKg ? weight : lbToKg(weight)) : null;

    // RIR approximation: RIR ≈ 10 − RPE, clamped ≥ 0
    const rir = rpe != null ? Math.max(0, Math.round(10 - rpe)) : null;

    sessions.push({
      date,
      title: rawTitle || null,
      exercise: rawExercise,
      setNo: isNaN(setNo) ? 1 : setNo,
      weightKg,
      reps,
      rir,
    });
  }

  return { sessions, warnings };
}
