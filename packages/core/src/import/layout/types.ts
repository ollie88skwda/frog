// Geometry-aware screenshot scans. The older line parser (../ocr) only sees
// text; app layouts like a routine list or a share table need *where* things
// sit (columns, wrapped names, row bands) and need to re-read one small cell
// on a clean upscaled crop, because whole-page OCR drops digits on phone
// screenshots. Framework-free: the browser supplies a canvas-backed engine,
// node scripts supply pngjs, tests supply fakes.
import type { Bitmap } from "./bitmap";

export type Box = { x0: number; y0: number; x1: number; y1: number };

export type PageWord = { text: string; conf: number; box: Box };
export type PageLine = {
  text: string;
  /** 0..1 */
  conf: number;
  box: Box;
  words: PageWord[];
};

/**
 * "page": whole screenshot, automatic layout. "line"/"sparse": one text line /
 * scattered text. "digit": a single character restricted to 0-9.
 * Returned boxes are relative to the bitmap passed in.
 */
export type RecognizeMode = "page" | "line" | "sparse" | "digit";
export type RegionEngine = (
  bitmap: Bitmap,
  mode: RecognizeMode,
) => Promise<PageLine[]>;

export type PageScan = {
  width: number;
  height: number;
  bitmap: Bitmap;
  /** Whole-page OCR, duplicates already removed. */
  lines: PageLine[];
  engine: RegionEngine;
};

export type SetRead = { weight: number | null; reps: number | null };
