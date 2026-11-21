import { type Bitmap, type PrepOptions, prepRegion } from "./bitmap";
import type {
  Box,
  PageLine,
  PageScan,
  PageWord,
  RecognizeMode,
  RegionEngine,
} from "./types";

const iou = (a: Box, b: Box) => {
  const w = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0);
  const h = Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0);
  if (w <= 0 || h <= 0) return 0;
  const i = w * h;
  return (
    i / ((a.x1 - a.x0) * (a.y1 - a.y0) + (b.x1 - b.x0) * (b.y1 - b.y0) - i)
  );
};

/**
 * Tesseract reports the same word under overlapping blocks, sometimes at a
 * shifted x and cut short ("Deck/Machi" next to "Deck/Machine"). Keep one per
 * spot: the longer text when one is a prefix of the other, else the surer.
 */
export function dedupeWords(words: PageWord[]): PageWord[] {
  const sorted = [...words].sort(
    (a, b) => b.text.length - a.text.length || b.conf - a.conf,
  );
  const kept: PageWord[] = [];
  for (const w of sorted) {
    const dup = kept.some((k) => {
      if (iou(k.box, w.box) > 0.5) return true;
      const h = Math.min(k.box.y1 - k.box.y0, w.box.y1 - w.box.y0);
      const dy = Math.abs(
        (k.box.y0 + k.box.y1) / 2 - (w.box.y0 + w.box.y1) / 2,
      );
      const dx = Math.abs(k.box.x0 - w.box.x0);
      return (
        dy < h * 0.5 &&
        dx < 90 &&
        k.text.toLowerCase().startsWith(w.text.toLowerCase())
      );
    });
    if (!dup) kept.push(w);
  }
  return kept;
}

/** Words -> lines by vertical overlap, left to right inside a line. */
export function linesFromWords(words: PageWord[]): PageLine[] {
  const sorted = [...words].sort(
    (a, b) => (a.box.y0 + a.box.y1) / 2 - (b.box.y0 + b.box.y1) / 2,
  );
  const groups: PageWord[][] = [];
  for (const w of sorted) {
    const cy = (w.box.y0 + w.box.y1) / 2;
    const g = groups.find((grp) => {
      const f = grp[0];
      const h = Math.min(f.box.y1 - f.box.y0, w.box.y1 - w.box.y0);
      return Math.abs((f.box.y0 + f.box.y1) / 2 - cy) < h * 0.5;
    });
    if (g) g.push(w);
    else groups.push([w]);
  }
  return groups.map((g) => {
    g.sort((a, b) => a.box.x0 - b.box.x0);
    return {
      text: g.map((w) => w.text).join(" "),
      conf: g.reduce((m, w) => m + w.conf, 0) / g.length,
      words: g,
      box: {
        x0: Math.min(...g.map((w) => w.box.x0)),
        y0: Math.min(...g.map((w) => w.box.y0)),
        x1: Math.max(...g.map((w) => w.box.x1)),
        y1: Math.max(...g.map((w) => w.box.y1)),
      },
    };
  });
}

/** Whole-page OCR once, then expose it as a PageScan. */
export async function scanBitmap(
  bitmap: Bitmap,
  engine: RegionEngine,
): Promise<PageScan> {
  const raw = await engine(bitmap, "page");
  const words = dedupeWords(raw.flatMap((l) => l.words));
  return {
    width: bitmap.width,
    height: bitmap.height,
    bitmap,
    lines: linesFromWords(words),
    engine,
  };
}

export type RegionRead = { text: string; conf: number; box: Box };

/**
 * Re-read a page rectangle on a clean upscaled crop. Boxes come back in page
 * coordinates.
 */
export async function readRegion(
  scan: PageScan,
  rect: Box,
  mode: RecognizeMode,
  prep: PrepOptions = {},
): Promise<RegionRead[]> {
  const scale = prep.scale ?? 3;
  const pad = prep.pad ?? 12;
  const bm = prepRegion(scan.bitmap, rect, {
    binarize: true,
    ...prep,
    scale,
    pad,
  });
  const lines = await scan.engine(bm, mode);
  const x0 = Math.max(0, Math.floor(rect.x0));
  const y0 = Math.max(0, Math.floor(rect.y0));
  return lines
    .filter((l) => l.text.trim())
    .map((l) => ({
      text: l.text.trim(),
      conf: l.conf,
      box: {
        x0: (l.box.x0 - pad) / scale + x0,
        y0: (l.box.y0 - pad) / scale + y0,
        x1: (l.box.x1 - pad) / scale + x0,
        y1: (l.box.y1 - pad) / scale + y0,
      },
    }));
}

export const median = (xs: number[]) => {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
};

/** Most common value in a list of readings (ties: highest total confidence). */
export function vote<T extends string | number>(
  readings: { value: T; conf: number }[],
): { value: T; agree: number; conf: number } | null {
  if (readings.length === 0) return null;
  const tally = new Map<T, { n: number; conf: number }>();
  for (const r of readings) {
    const t = tally.get(r.value) ?? { n: 0, conf: 0 };
    t.n++;
    t.conf += r.conf;
    tally.set(r.value, t);
  }
  const [value, t] = [...tally.entries()].sort(
    (a, b) => b[1].n - a[1].n || b[1].conf - a[1].conf,
  )[0];
  return { value, agree: t.n / readings.length, conf: t.conf / t.n };
}
