// Screenshots (any number, any order) -> one ImportDraft. Each image is read
// into an ImageRead by the geometry parsers (routine list, share table) or,
// when neither recognises the layout, by the older line parser as text lines.
// Reads of the same screen scrolled to different positions are stitched here
// by row number, so overlapping rows are never doubled and a row cut off at
// an edge is taken from the shot that shows it whole.
import { newId } from "../../domain/ids";
import { kgToLb, lbToKg } from "../../domain/units";
import {
  emptyDraft,
  exerciseConfidence,
  type ImportDraft,
  type ImportDraftExercise,
  type ImportDraftSet,
  importDraftSet,
  isLowConfidence,
  type WeightUnit,
} from "../draft";
import { ocrLinesToDraft } from "../ocr/draft";
import { type ListRow, parseRoutineList } from "./routine-list";
import { parseShareTable, type TableRow } from "./share-table";
import type { PageScan } from "./types";

export type ImageRead =
  | { kind: "routine-list"; title: string | null; rows: ListRow[] }
  | { kind: "share-table"; title: string | null; rows: TableRow[] }
  | { kind: "text"; lines: { text: string; confidence: number }[] };

/** Recognise the layout of one scanned screenshot. */
export async function readScan(scan: PageScan): Promise<ImageRead> {
  const table = await parseShareTable(scan);
  if (table) return { kind: "share-table", ...table };
  const list = await parseRoutineList(scan);
  if (list && list.rows.length >= 2) return { kind: "routine-list", ...list };
  return {
    kind: "text",
    lines: scan.lines.map((l) => ({ text: l.text, confidence: l.conf })),
  };
}

const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

/** Stitch scrolled shots of one list: by row number, whole rows beat cut-off ones. */
export function stitchRows<
  R extends { index: number; partial: boolean; name: string },
>(reads: R[][], quality: (r: R) => number): { rows: R[]; gaps: number[] } {
  const byIndex = new Map<number, R>();
  for (const rows of reads)
    for (const r of rows) {
      const cur = byIndex.get(r.index);
      if (
        !cur ||
        (cur.partial && !r.partial) ||
        (cur.partial === r.partial && quality(r) > quality(cur))
      )
        byIndex.set(r.index, r);
    }
  const rows = [...byIndex.values()].sort((a, b) => a.index - b.index);
  const gaps: number[] = [];
  for (let i = 1; i < rows.length; i++)
    for (let n = rows[i - 1].index + 1; n < rows[i].index; n++) gaps.push(n);
  return { rows, gaps };
}

/** Complete a name the app shortened with "..." from a longer known name. */
export function completeName(name: string, known: string[]): string | null {
  // Compare with spaces removed: the cut can land mid-word ("(55De...").
  const compact = (x: string) => norm(x).replace(/ /g, "");
  const stem = compact(name.replace(/(\.{2,}|…)$/, ""));
  if (stem.length < 4) return null;
  const hits = known.filter((k) => compact(k).startsWith(stem));
  if (hits.length === 1) return hits[0];
  // The app also drops a word in the middle ("Cable"), so fall back to
  // token containment of the stem inside one known name.
  const tokens = norm(name.replace(/(\.{2,}|…)$/, "")).split(" ");
  const loose = known.filter((k) => {
    const nk = norm(k).split(" ");
    return tokens.every((t, i) =>
      i === tokens.length - 1
        ? nk.some((w) => w.startsWith(t))
        : nk.includes(t),
    );
  });
  return loose.length === 1 ? loose[0] : null;
}

export type UniversalOptions = { defaultUnit?: WeightUnit };

export function readsToDraft(
  reads: ImageRead[],
  opts: UniversalOptions = {},
): ImportDraft {
  const unit0 = opts.defaultUnit ?? "kg";
  const lists = reads.filter((r) => r.kind === "routine-list");
  const tables = reads.filter((r) => r.kind === "share-table");
  const routine = stitchRows(
    lists.map((l) => l.rows),
    (r) => r.nameConf,
  );
  const table = stitchRows(
    tables.map((t) => t.rows),
    (r) => r.setAgreement,
  );
  const tableUnit: WeightUnit | null = (() => {
    const us = table.rows.map((r) => r.unit).filter(Boolean);
    const lb = us.filter((u) => u === "lb").length;
    return us.length === 0 ? null : lb >= us.length - lb ? "lb" : "kg";
  })();
  const unit = tableUnit ?? unit0;
  const draft = emptyDraft("text", unit, tableUnit !== null);
  const title =
    lists.find((l) => l.title)?.title ??
    tables.find((t) => t.title && t.title !== "Share")?.title ??
    null;
  const routineNames = routine.rows.map((r) => r.name);

  if (routine.rows.length > 0) {
    const exercises = routine.rows.map((r) => {
      const hasChips = r.sets != null || r.reps != null;
      const flags: string[] = [];
      if (r.indexInferred) flags.push("Row number guessed");
      if (r.partial) flags.push("Row was cut off");
      const conf = Math.min(r.nameConf || 0.5, r.partial ? 0.6 : 1);
      void flags;
      return {
        id: newId(),
        rawName: r.name,
        sets: r.sets ?? 1,
        reps: r.reps,
        repsMax: r.repsMax,
        weight: null,
        // No SETS chip shown: the 1 is a default, not read.
        confidence: hasChips ? conf : Math.min(conf, 0.99),
      };
    });
    draft.routines.push({ id: newId(), name: title, exercises });
    if (routine.gaps.length)
      draft.notes.push(
        `Rows ${routine.gaps.join(", ")} of the routine were not in any screenshot. Add another screenshot that shows them.`,
      );
    draft.notes.push(
      "The routine screen only shows sets and reps when the app displays them; exercises without them import as 1 set, no rep target.",
    );
  }

  if (table.rows.length > 0) {
    const exercises: ImportDraftExercise[] = [];
    for (const r of table.rows) {
      let name = r.name;
      const flags = [...r.flags];
      let nameConf = r.nameConf;
      if (r.truncated) {
        const full = completeName(r.name, routineNames);
        if (full) {
          name = full;
          nameConf = Math.max(nameConf, 0.9);
          const i = flags.indexOf("Name was shortened by the app");
          if (i >= 0) flags.splice(i, 1);
        } else {
          name = r.name.replace(/(\.{2,}|…)$/, "").trim();
          nameConf = Math.min(nameConf, 0.6);
        }
      }
      const base = Math.min(1, Math.max(0.2, r.setAgreement || 0.3));
      const rowConf = Math.min(base, nameConf);
      const sets: ImportDraftSet[] = [];
      if (r.weight != null || r.reps != null) {
        const w =
          r.unit && r.unit !== unit && r.weight != null
            ? Math.round(
                (unit === "lb" ? kgToLb(r.weight) : lbToKg(r.weight)) * 10,
              ) / 10
            : r.weight;
        const make = (
          side: "left" | "right" | null,
          setNo: number,
          extra: string[],
          c: number,
        ) =>
          importDraftSet({
            weight: w,
            reps: r.reps,
            rir: r.badge,
            side,
            setNo,
            confidence: c,
            flags: [...flags, ...extra],
            raw: r.raw,
          });
        const count = r.count ?? 1;
        if (count === 2) {
          sets.push(make("left", 0, [], rowConf));
          sets.push(
            make(
              "right",
              0,
              [
                "The table shows one weight × reps for both sides; check the right side",
              ],
              Math.min(rowConf, 0.7),
            ),
          );
        } else {
          for (let n = 0; n < Math.max(1, count); n++)
            sets.push(make(null, n, [], rowConf));
        }
      } else {
        sets.push(
          importDraftSet({
            weight: null,
            reps: null,
            confidence: 0.3,
            flags: r.flags.length ? r.flags : ["No set found for this row"],
            raw: r.raw,
          }),
        );
      }
      exercises.push({
        id: newId(),
        rawName: name,
        sets,
        confidence: Math.min(nameConf, exerciseConfidence(sets)),
      });
    }
    draft.sessions.push({
      id: newId(),
      title,
      startedAt: null,
      hasTime: false,
      endedAt: null,
      exercises,
      confidence: exercises.reduce((m, e) => Math.min(m, e.confidence), 1),
      flags: ["No date found"],
    });
    draft.notes.push(
      "The number in the coloured badge was read as reps in reserve (RIR). Check that it means that in your old app.",
    );
    if (table.rows.some((r) => r.count === 2))
      draft.notes.push(
        "A set count of 2 was read as a left/right pair (a one-sided exercise). The table prints one weight and reps for it.",
      );
    if (table.gaps.length)
      draft.notes.push(
        `Rows ${table.gaps.join(", ")} of the table were not readable.`,
      );
    const last = table.rows.at(-1);
    if (last?.partial)
      draft.notes.push(
        "The last row is cut off at the bottom of the screenshot; scroll and add another one.",
      );
  }
  void isLowConfidence;

  // Screens neither layout parser knows: stitch their text lines (dropping the
  // lines two overlapping scrolls share) and run the older line parser.
  const texts = reads.filter((r) => r.kind === "text");
  if (texts.length > 0) {
    const lines = stitchTextLines(texts.map((t) => t.lines));
    const td = ocrLinesToDraft(
      lines.map((l) => ({ text: l.text, confidence: l.confidence })),
      unit,
    );
    if (draft.sessions.length + draft.routines.length === 0) return td;
    draft.sessions.push(...td.sessions);
    draft.routines.push(...td.routines);
    draft.unparsed.push(...td.unparsed);
    draft.notes.push(...td.notes);
  }
  return draft;
}

type TextLine = { text: string; confidence: number };

/** Join per-screenshot line lists; the longest tail/head overlap is one copy. */
export function stitchTextLines(shots: TextLine[][]): TextLine[] {
  const key = (l: TextLine) => norm(l.text);
  let out: TextLine[] = [];
  for (const shot of shots) {
    let best = 0;
    const max = Math.min(out.length, shot.length, 30);
    for (let n = max; n >= 1; n--) {
      let same = true;
      for (let i = 0; i < n; i++)
        if (key(out[out.length - n + i]) !== key(shot[i])) {
          same = false;
          break;
        }
      if (same) {
        best = n;
        break;
      }
    }
    out = out.concat(shot.slice(best));
  }
  return out;
}
