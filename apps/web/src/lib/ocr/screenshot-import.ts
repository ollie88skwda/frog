// image -> OCR lines -> ImportDraft. The only entry point the import screen
// needs; it is itself lazy-loaded, and pulls tesseract.js in via dynamic import
// so the engine chunk is fetched only once a screenshot is actually chosen.
// Runs entirely on this device; the image is never uploaded or stored.
import { type ImportDraft, ocrLinesToDraft, type WeightUnit } from "@frog/core";

export async function screenshotToImportDraft(
  image: Blob,
  defaultUnit: WeightUnit,
  onProgress?: (fraction: number) => void,
): Promise<ImportDraft> {
  const { createTesseractEngine } = await import("./tesseract-engine");
  const engine = await createTesseractEngine(onProgress);
  try {
    return ocrLinesToDraft(await engine.recognize(image), defaultUnit);
  } finally {
    await engine.dispose();
  }
}
