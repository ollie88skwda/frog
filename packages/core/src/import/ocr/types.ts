// On-device screenshot import, stage contract: image -> OCR text lines ->
// parsed rows with confidence. Everything here is framework-free; the actual
// OCR engine (tesseract.js, lazy chunk in apps/web) implements OcrEngine and
// never leaves the device. No AI/ML provider, no network (docs/DECISIONS.md).

export type OcrLine = {
  text: string;
  /** Engine confidence for the line, 0..1. */
  confidence: number;
};

/** `I` is the platform's image type (Blob/File in the browser, Buffer in node). */
export interface OcrEngine<I = unknown> {
  recognize(image: I): Promise<OcrLine[]>;
}

import type { WeightUnit } from "../draft";

export type ScreenshotApp =
  | "hevy"
  | "strong"
  | "fitbod"
  | "jefit"
  | "apple"
  | "generic";

export type ScreenshotSet = {
  reps: number | null;
  /** Weight as shown (unit in `unit`); null for bodyweight / unreadable. */
  weight: number | null;
  /** Unit printed on the row or its table header; null when none shown. */
  unit: WeightUnit | null;
  rir: number | null;
  warmup: boolean;
  /** 0..1: OCR confidence x how cleanly the row matched. Low => highlight. */
  confidence: number;
  /** The OCR line it came from, for the review screen. */
  raw: string;
};

export type ScreenshotExercise = {
  rawName: string;
  nameConfidence: number;
  sets: ScreenshotSet[];
};

export type ScreenshotSession = {
  title: string | null;
  /** ISO yyyy-mm-dd when a date was readable. */
  date: string | null;
  /** Numeric d/m/y with both parts <= 12: month-first was assumed. */
  dateAmbiguous: boolean;
  durationMin: number | null;
  exercises: ScreenshotExercise[];
};

export type ScreenshotParse = {
  app: ScreenshotApp;
  session: ScreenshotSession;
  /** Majority unit across rows; null when no row printed one. */
  unit: WeightUnit | null;
  /** Non-blank lines that yielded nothing, in source order. */
  unparsed: string[];
};
