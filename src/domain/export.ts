import { kgToLb } from "./units";
import { epley } from "./e1rm";

export type ExportSession = {
  date: number;          // Unix ms
  title: string | null;
  exercise: string;
  setNo: number;
  weightKg: number | null;
  reps: number | null;
  rir: number | null;
};

export type ExportRow = {
  date: string;          // ISO 8601 date (YYYY-MM-DD)
  sessionTitle: string;
  exercise: string;
  setNo: number;
  weightKg: number | null;
  weightLb: number | null;
  reps: number | null;
  rir: number | null;
  e1rm: number | null;   // Epley estimated 1RM in kg, rounded to 1 decimal
};

export function buildExportRows(rows: ExportSession[]): ExportRow[] {
  return rows.map((s) => {
    const rawE1rm = s.weightKg != null && s.reps != null ? epley(s.weightKg, s.reps) : null;
    return {
      date: new Date(s.date).toISOString().slice(0, 10),
      sessionTitle: s.title ?? "",
      exercise: s.exercise,
      setNo: s.setNo,
      weightKg: s.weightKg,
      weightLb: s.weightKg != null ? Math.round(kgToLb(s.weightKg) * 10) / 10 : null,
      reps: s.reps,
      rir: s.rir,
      e1rm: rawE1rm != null ? Math.round(rawE1rm * 10) / 10 : null,
    };
  });
}

const CSV_COLS = [
  "date",
  "sessionTitle",
  "exercise",
  "setNo",
  "weightKg",
  "weightLb",
  "reps",
  "rir",
  "e1rm",
] as const;

function csvEsc(v: unknown): string {
  if (v === null || v === undefined) return "";
  const s = String(v);
  if (s.includes(",") || s.includes('"') || s.includes("\n")) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function toCSV(rows: ExportRow[]): string {
  const lines = [CSV_COLS.join(",")];
  for (const r of rows) {
    lines.push(CSV_COLS.map((col) => csvEsc(r[col])).join(","));
  }
  return lines.join("\n");
}

export function toJSON(rows: ExportRow[]): string {
  return JSON.stringify(rows, null, 2);
}
