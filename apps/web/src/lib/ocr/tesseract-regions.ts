// Browser RegionEngine: tesseract.js workers (one per recognise mode, created
// on first use) behind the framework-free contract in @frog/core. Assets are
// self-hosted from /ocr/ like tesseract-engine.ts; the image is never stored.
import type { Bitmap, PageLine, RecognizeMode, RegionEngine } from "@frog/core";
import { createWorker, PSM, type Worker } from "tesseract.js";
import { OCR_BASE } from "./tesseract-engine";

export type UniversalEngine = {
  engine: RegionEngine;
  dispose(): Promise<void>;
};

export async function createUniversalEngine(): Promise<UniversalEngine> {
  const workers: Partial<Record<RecognizeMode, Worker>> = {};
  const canvas = document.createElement("canvas");
  const get = async (mode: RecognizeMode) => {
    const have = workers[mode];
    if (have) return have;
    const w = await createWorker("eng", 1, {
      workerPath: `${OCR_BASE}/worker.min.js`,
      corePath: `${OCR_BASE}/core`,
      langPath: `${OCR_BASE}/lang`,
      gzip: true,
      cacheMethod: "none",
    });
    // "page" keeps tesseract's default layout analysis.
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
  const engine: RegionEngine = async (bm: Bitmap, mode) => {
    const worker = await get(mode);
    canvas.width = bm.width;
    canvas.height = bm.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas unavailable.");
    ctx.putImageData(
      new ImageData(
        bm.data as unknown as Uint8ClampedArray<ArrayBuffer>,
        bm.width,
        bm.height,
      ),
      0,
      0,
    );
    const { data } = await worker.recognize(canvas, {}, { blocks: true });
    return (data.blocks ?? [])
      .flatMap((b) => b.paragraphs.flatMap((p) => p.lines))
      .map(
        (l): PageLine => ({
          text: l.text.trim(),
          conf: l.confidence / 100,
          box: { x0: l.bbox.x0, y0: l.bbox.y0, x1: l.bbox.x1, y1: l.bbox.y1 },
          words: l.words.map((w) => ({
            text: w.text,
            conf: w.confidence / 100,
            box: { x0: w.bbox.x0, y0: w.bbox.y0, x1: w.bbox.x1, y1: w.bbox.y1 },
          })),
        }),
      );
  };
  return {
    engine,
    dispose: async () => {
      for (const w of Object.values(workers)) await w?.terminate();
    },
  };
}
