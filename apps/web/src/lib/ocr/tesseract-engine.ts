// Browser OCR engine (tesseract.js, WASM) behind the framework-free OcrEngine
// contract. Lives only in a lazy chunk on the import screen. Worker, WASM core
// and English model are self-hosted from /ocr/ (copied by the frog-ocr-assets
// plugin in apps/web/vite.config.ts) — no CDN, nothing about the image leaves the device, and
// the image is never stored (tesseract's IndexedDB cache is disabled).
import type { OcrEngine, OcrLine } from "@frog/core";
import { createWorker, type Worker } from "tesseract.js";

export const OCR_BASE = "/ocr";

export type OcrProgress = (fraction: number) => void;

export async function createTesseractEngine(
  onProgress?: OcrProgress,
): Promise<OcrEngine<Blob | File> & { dispose(): Promise<void> }> {
  const worker: Worker = await createWorker("eng", 1, {
    workerPath: `${OCR_BASE}/worker.min.js`,
    corePath: `${OCR_BASE}/core`,
    langPath: `${OCR_BASE}/lang`,
    gzip: true,
    cacheMethod: "none",
    logger: (m) => {
      if (m.status === "recognizing text") onProgress?.(m.progress);
    },
  });
  return {
    async recognize(image) {
      const { data } = await worker.recognize(image, {}, { blocks: true });
      const lines: OcrLine[] = (data.blocks ?? [])
        .flatMap((b) => b.paragraphs.flatMap((p) => p.lines))
        .map((l) => ({ text: l.text.trim(), confidence: l.confidence / 100 }))
        .filter((l) => l.text);
      return lines;
    },
    dispose: async () => {
      await worker.terminate();
    },
  };
}
