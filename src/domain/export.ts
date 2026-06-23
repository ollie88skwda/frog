import { kgToLb } from "./units";
import { epley } from "./e1rm";
import type { ConditionMap } from "./conditions";

export type ExportSession = {
  date: number;          // Unix ms
  title: string | null;
  exercise: string;
  setNo: number;
  weightKg: number | null;
  reps: number | null;
  rir: number | null;
  conditionValues?: ConditionMap;   // session-level conditions (same for all sets in session)
  setMetricValues?: ConditionMap;   // per-set custom metric values
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
  conditions: ConditionMap; // merged session conditions + set metric values
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
      conditions: { ...(s.conditionValues ?? {}), ...(s.setMetricValues ?? {}) },
    };
  });
}

const FIXED_COLS = [
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

// Builds CSV with fixed columns first, then dynamic condition columns (alpha sorted).
export function toCSV(rows: ExportRow[]): string {
  const condKeys = [...new Set(rows.flatMap((r) => Object.keys(r.conditions)))].sort();
  const header = [...FIXED_COLS, ...condKeys].join(",");
  const lines = [header];
  for (const r of rows) {
    const fixed = FIXED_COLS.map((col) => csvEsc(r[col]));
    const conds = condKeys.map((k) => csvEsc(r.conditions[k] ?? ""));
    lines.push([...fixed, ...conds].join(","));
  }
  return lines.join("\n");
}

export function toJSON(rows: ExportRow[]): string {
  return JSON.stringify(rows, null, 2);
}
