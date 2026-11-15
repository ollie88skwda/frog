// Strong app CSV importer (Hevy-parity plan §C). Tolerant of Strong's export
// variants: comma or semicolon delimiters, optional Weight Unit column
// (values otherwise assumed kg), optional RPE / Distance / Seconds columns.
// Same idempotency model as the Hevy importer (skip sessions whose
// started_at already exists) — no one-import-per-account cap or revert;
// idempotency + soft delete cover both (deliberate deviation, plan §
// "deliberate deviations").

import { rirFromRpe } from "../domain/e1rm";
import { lbToKg, miToM } from "../domain/units";
import { parseCsv } from "./hevy";
import type { ImportedSession, ImportedSet } from "./types";

/** "2026-01-14 09:30:00" (local) → ms epoch; null when unparseable. */
export function parseStrongDate(raw: string): number | null {
  const m = raw
    .trim()
    .match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?/);
  if (!m) return null;
  const [, y, mo, d, h, mi, s] = m;
  const t = new Date(
    Number(y),
    Number(mo) - 1,
    Number(d),
    Number(h),
    Number(mi),
    Number(s ?? "0"),
  ).getTime();
  return Number.isFinite(t) ? t : null;
}

/** Strong's Duration column: "1h 30m", "45m", "1h", "90s" → ms. */
export function parseStrongDuration(raw: string): number | null {
  const h = raw.match(/(\d+)\s*h/)?.[1];
  const m = raw.match(/(\d+)\s*m/)?.[1];
  const s = raw.match(/(\d+)\s*s/)?.[1];
  if (h == null && m == null && s == null) return null;
  return (Number(h ?? 0) * 3600 + Number(m ?? 0) * 60 + Number(s ?? 0)) * 1000;
}

function num(raw: string | undefined): number | null {
  if (raw == null) return null;
  const v = Number.parseFloat(raw.replace(",", "."));
  return Number.isFinite(v) ? v : null;
}

// Header lookup: case/spacing tolerant ("Weight Unit" ≡ "weight_unit").
function headerIndex(headers: string[]): Map<string, number> {
  const map = new Map<string, number>();
  headers.forEach((h, i) => {
    map.set(
      h
        .trim()
        .toLowerCase()
        .replace(/[\s_]+/g, " "),
      i,
    );
  });
  return map;
}

export function parseStrongCsv(text: string): ImportedSession[] {
  // Strong historically exported with semicolons in some locales; sniff the
  // header line and normalize to commas for the shared RFC-4180 parser.
  const firstLine = text.slice(0, text.indexOf("\n"));
  const useSemicolon =
    firstLine.includes(";") &&
    firstLine.split(";").length > firstLine.split(",").length;
  const rows = parseCsv(useSemicolon ? text.replaceAll(";", ",") : text);
  if (rows.length < 2) return [];

  const idx = headerIndex(rows[0]);
  const col = (row: string[], name: string): string | undefined => {
    const i = idx.get(name);
    return i === undefined ? undefined : row[i];
  };
  // Required columns — bail (empty result) when this isn't a Strong export.
  if (!idx.has("date") || !idx.has("exercise name")) return [];

  // Group rows by (date, workout name) → one session.
  const sessions = new Map<
    string,
    {
      startedAt: number;
      title: string | null;
      durationMs: number | null;
      exercises: Map<string, ImportedSet[]>;
      order: string[];
    }
  >();

  for (const row of rows.slice(1)) {
    if (row.every((c) => c.trim() === "")) continue;
    const startedAt = parseStrongDate(col(row, "date") ?? "");
    const exerciseName = (col(row, "exercise name") ?? "").trim();
    if (startedAt == null || !exerciseName) continue;

    const title = (col(row, "workout name") ?? "").trim() || null;
    const key = `${startedAt}|${title ?? ""}`;
    let session = sessions.get(key);
    if (!session) {
      session = {
        startedAt,
        title,
        durationMs: parseStrongDuration(col(row, "duration") ?? ""),
        exercises: new Map(),
        order: [],
      };
      sessions.set(key, session);
    }

    const unit = (col(row, "weight unit") ?? "kg").trim().toLowerCase();
    const weightRaw = num(col(row, "weight"));
    const weightKg =
      weightRaw == null
        ? null
        : unit.startsWith("lb")
          ? lbToKg(weightRaw)
          : weightRaw;

    const reps = num(col(row, "reps"));
    const rpe = num(col(row, "rpe"));
    const seconds = num(col(row, "seconds"));
    const distRaw = num(col(row, "distance"));
    const distUnit = (col(row, "distance unit") ?? "").trim().toLowerCase();
    const distanceM =
      distRaw == null
        ? null
        : distUnit.startsWith("mi")
          ? miToM(distRaw)
          : distUnit.startsWith("km")
            ? distRaw * 1000
            : distUnit.startsWith("m")
              ? distRaw
              : distRaw * 1000; // Strong defaults to km when unit is absent

    // Strong marks warm-ups in Set Order ("W") and notes failure via RPE 10.
    const setOrder = (col(row, "set order") ?? "").trim().toLowerCase();
    const setType = setOrder === "w" ? "warmup" : "normal";

    // Rows with no logged work at all (rest timers etc.) are skipped.
    if (
      weightKg == null &&
      reps == null &&
      seconds == null &&
      distanceM == null
    )
      continue;

    const set: ImportedSet = {
      weightKg,
      reps: reps == null ? null : Math.round(reps),
      rir: rpe == null ? null : rirFromRpe(rpe),
      note: (col(row, "notes") ?? "").trim() || null,
      setType,
      durationSec: seconds == null ? null : Math.round(seconds),
      distanceM,
    };

    const list = session.exercises.get(exerciseName);
    if (list) list.push(set);
    else {
      session.exercises.set(exerciseName, [set]);
      session.order.push(exerciseName);
    }
  }

  return [...sessions.values()]
    .sort((a, b) => a.startedAt - b.startedAt)
    .map((s) => ({
      title: s.title,
      startedAt: s.startedAt,
      endedAt: s.durationMs != null ? s.startedAt + s.durationMs : null,
      exercises: s.order.map((name) => ({
        name,
        sets: s.exercises.get(name) ?? [],
      })),
    }));
}
