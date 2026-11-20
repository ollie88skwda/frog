// biome-ignore-all lint/suspicious/noExplicitAny: tesseract.js is loaded dynamically from apps/web and has no types here
// Node OCR engine + PNG loader for the universal-import scripts and tests.
// Same RegionEngine contract the browser implements in
// apps/web/src/lib/ocr/universal-import.ts (one tesseract worker per mode).
import { readFileSync } from "node:fs";
import { PNG } from "pngjs";
import type { Bitmap } from "../../packages/core/src/import/layout/bitmap";
import type {
  PageLine,
  RecognizeMode,
  RegionEngine,
} from "../../packages/core/src/import/layout/types";

const WEB = new URL("../../apps/web/node_modules/", import.meta.url).pathname;

export function loadPng(path: string): Bitmap {
  const png = PNG.sync.read(readFileSync(path));
  return {
    width: png.width,
    height: png.height,
    data: new Uint8ClampedArray(png.data),
  };
}

const encode = (b: Bitmap) => {
  const p = new PNG({ width: b.width, height: b.height });
  p.data = Buffer.from(b.data);
  return PNG.sync.write(p);
};

export async function makeNodeEngine(): Promise<{
  engine: RegionEngine;
  terminate: () => Promise<void>;
}> {
  const { createWorker, PSM } = (await import(`${WEB}tesseract.js`)) as any;
  const workers: Partial<Record<RecognizeMode, any>> = {};
  const get = async (mode: RecognizeMode) => {
    const have = workers[mode];
    if (have) return have;
    const w = await createWorker("eng", 1, {
      langPath: `${WEB}@tesseract.js-data/eng/4.0.0_best_int`,
      gzip: true,
      cachePath: "/tmp/frog-ocr-cache",
    });
    // "page" keeps tesseract's default layout analysis (setting AUTO
    // explicitly changes its output on these screens).
    if (mode !== "page")
      await w.setParameters({
        tessedit_pageseg_mode:
          mode === "line"
            ? PSM.SINGLE_LINE
            : mode === "sparse"
              ? PSM.SPARSE_TEXT
              : PSM.SINGLE_CHAR,
        ...(mode === "digit" ? { tessedit_char_whitelist: "0123456789" } : {}),
      });
    workers[mode] = w;
    return w;
  };
  const engine: RegionEngine = async (bm, mode) => {
    const worker = await get(mode);
    const { data } = await worker.recognize(encode(bm), {}, { blocks: true });
    return (data.blocks ?? [])
      .flatMap((b: any) => b.paragraphs.flatMap((p: any) => p.lines))
      .map(
        (l: any): PageLine => ({
          text: l.text.trim(),
          conf: l.confidence / 100,
          box: { x0: l.bbox.x0, y0: l.bbox.y0, x1: l.bbox.x1, y1: l.bbox.y1 },
          words: l.words.map((w: any) => ({
            text: w.text,
            conf: w.confidence,
            box: { x0: w.bbox.x0, y0: w.bbox.y0, x1: w.bbox.x1, y1: w.bbox.y1 },
          })),
        }),
      );
  };
  return {
    engine,
    terminate: async () => {
      for (const w of Object.values(workers)) await w.terminate();
    },
  };
}
