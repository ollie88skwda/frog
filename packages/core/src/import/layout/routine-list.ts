// Layout parser: a routine screen that lists numbered exercise tiles
// ("1A", "2A", ... superset labels) with the exercise name beside each tile and
// optional "SETS n / REPS a-b" chips under the name (the old app Oliver is
// moving from, but any numbered-tile routine list reads the same way).
// Rows are located by their tiles, so names that wrap onto two or three lines
// stay with their tile, and a row cut off by the screen edge is reported as
// `partial` so a second, overlapping screenshot can complete it.
import { linesFromWords, median, readRegion, vote } from "./scan";
import type { PageScan, PageWord } from "./types";

export type ListRow = {
  /** Tile number as printed (the "12" of "12A"); sequence-corrected. */
  index: number;
  /** What the tile itself OCR'd to, for the review tooltip. */
  tileRaw: string;
  /** Tile number was inferred from neighbours rather than read. */
  indexInferred: boolean;
  name: string;
  nameConf: number;
  sets: number | null;
  reps: number | null;
  repsMax: number | null;
  /** The row touches the top/bottom edge of the visible list. */
  partial: boolean;
  /** Name ends in "…" (the app shortened it). */
  truncated: boolean;
};

export type RoutineListScan = {
  title: string | null;
  rows: ListRow[];
};

const TILE = /^[0-9a-z]{1,4}$/i;
const JUNK = /^[^a-z0-9(]{1,2}$/i;

export async function parseRoutineList(
  scan: PageScan,
): Promise<RoutineListScan | null> {
  const { width: W, height: H } = scan;
  const words = scan.lines.flatMap((l) => l.words);
  const top = 0.105 * H;
  const bottom = 0.855 * H;
  const tiles = words
    .filter(
      (w) =>
        w.box.x1 < 0.2 * W &&
        w.box.y0 > top &&
        w.box.y1 < bottom + 0.03 * H &&
        TILE.test(w.text) &&
        // a tile is a square-ish block of text
        w.box.x1 - w.box.x0 > 0.025 * W,
    )
    .sort((a, b) => a.box.y0 - b.box.y0);
  // Need a real run of tiles evenly spaced in y.
  if (tiles.length < 2) return null;
  const cy = tiles.map((t) => (t.box.y0 + t.box.y1) / 2);
  const gaps = cy.slice(1).map((c, i) => c - cy[i]);
  const pitch = median(gaps);
  if (pitch < 0.04 * H || pitch > 0.22 * H) return null;
  if (gaps.filter((g) => g < pitch * 0.4).length > 0) return null;

  const tileRight = Math.max(...tiles.map((t) => t.box.x1));
  const nameLeft = tileRight + 0.012 * W;
  const nameRight = 0.87 * W;

  // Tile numbers: read each tile on a clean crop at several scales, then
  // repair against the running sequence (a cut-off tile reads "155A").
  const reads: (number | null)[] = [];
  const raws: string[] = [];
  for (const t of tiles) {
    const rect = {
      x0: Math.max(0, t.box.x0 - 0.03 * W),
      x1: Math.min(0.2 * W, t.box.x1 + 0.03 * W),
      y0: t.box.y0 - 0.012 * H,
      y1: t.box.y1 + 0.012 * H,
    };
    const got: { value: string; conf: number }[] = [];
    for (const scale of [3, 4]) {
      const r = await readRegion(scan, rect, "line", {
        scale,
        invert: "auto",
        pad: 20,
      });
      const txt = (r[0]?.text ?? "").replace(/\s+/g, "").toUpperCase();
      if (txt) got.push({ value: txt, conf: r[0].conf });
    }
    const v = vote(got);
    const raw = v?.value ?? t.text;
    raws.push(raw);
    const m = /^(\d{1,2})[A-Z]?$/.exec(raw);
    reads.push(m ? Number(m[1]) : null);
  }
  const offsets = new Map<number, number>();
  reads.forEach((r, i) => {
    if (r != null && r >= 1 && r <= 60)
      offsets.set(r - i, (offsets.get(r - i) ?? 0) + 1);
  });
  const best = [...offsets.entries()].sort((a, b) => b[1] - a[1])[0];
  // Without any sensible read, number rows from 1 (flagged as inferred).
  const base = best ? best[0] : 1;

  const rows: ListRow[] = [];
  for (let i = 0; i < tiles.length; i++) {
    const start =
      i === 0 ? Math.max(top, cy[0] - pitch * 0.55) : (cy[i - 1] + cy[i]) / 2;
    const end =
      i === tiles.length - 1
        ? Math.min(bottom, cy[i] + pitch * 0.8)
        : (cy[i] + cy[i + 1]) / 2;
    const inBand: PageWord[] = words.filter((w) => {
      const c = (w.box.y0 + w.box.y1) / 2;
      return (
        c >= start &&
        c < end &&
        w.box.x0 >= nameLeft &&
        w.box.x1 <= nameRight &&
        !JUNK.test(w.text)
      );
    });
    const chipWords = inBand.filter((w) => /^(sets?|reps?)$/i.test(w.text));
    const chipTop = chipWords.length
      ? Math.min(...chipWords.map((w) => w.box.y0)) - 4
      : Number.POSITIVE_INFINITY;
    const nameWords = inBand.filter((w) => w.box.y0 < chipTop);
    let name = linesFromWords(nameWords)
      .map((l) => l.text)
      .join(" ");
    name = name
      .replace(/\s+/g, " ")
      .replace(/[.:*°’']+$/g, "")
      .trim();
    const truncated = /(\.{2,}|…)$/.test(name);
    const conf = nameWords.length
      ? nameWords.reduce((m, w) => m + w.conf, 0) / nameWords.length / 100
      : 0;
    // chips
    let sets: number | null = null;
    let reps: number | null = null;
    let repsMax: number | null = null;
    if (chipWords.length) {
      const rect = {
        x0: nameLeft,
        x1: nameRight,
        y0: Math.min(...chipWords.map((w) => w.box.y0)) - 10,
        y1: Math.max(...chipWords.map((w) => w.box.y1)) + 10,
      };
      const txts: string[] = [];
      for (const scale of [2, 3]) {
        const r = await readRegion(scan, rect, "line", {
          scale,
          binarize: false,
        });
        if (r[0]) txts.push(r[0].text);
      }
      txts.push(chipWords.map((w) => w.text).join(" "));
      const joined = txts.join(" | ");
      const s = vote(
        [...joined.matchAll(/sets?\s*[:=]?\s*(\d{1,2})\b/gi)].map((m) => ({
          value: Number(m[1]),
          conf: 1,
        })),
      );
      const rp = vote(
        [
          ...joined.matchAll(
            /reps?\s*[:=]?\s*(\d{1,3})(?:\s*[-–]\s*(\d{1,3}))?/gi,
          ),
        ].map((m) => ({ value: `${m[1]}-${m[2] ?? ""}`, conf: 1 })),
      );
      if (s) sets = s.value;
      if (rp) {
        const [a, b] = rp.value.split("-");
        reps = Number(a);
        repsMax = b ? Number(b) : null;
      }
    }
    const idx = base + i;
    rows.push({
      index: idx,
      tileRaw: raws[i],
      indexInferred: reads[i] !== idx,
      name,
      nameConf: conf,
      sets,
      reps,
      repsMax,
      partial:
        (i === 0 && tiles[0].box.y0 < top + 0.006 * H) ||
        (i === tiles.length - 1 &&
          Math.max(tiles[i].box.y1, ...nameWords.map((w) => w.box.y1)) >
            bottom - 0.006 * H),
      truncated,
    });
  }

  // Title: the top-most text line inside the header band, tile-free.
  const header = scan.lines
    .filter((l) => l.box.y0 > 0.04 * H && l.box.y1 < top + 0.02 * H)
    .map((l) =>
      l.words
        .filter(
          (w) =>
            w.box.x0 > 0.12 * W && w.box.x1 < 0.88 * W && !JUNK.test(w.text),
        )
        .map((w) => w.text)
        .join(" "),
    )
    .filter(Boolean);
  const title = header[0]?.trim() || null;
  return { title, rows: rows.filter((r) => r.name) };
}
