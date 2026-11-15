// image -> OCR lines -> parsed rows. The only entry point the import screen
// needs; it is itself lazy-loaded, and pulls tesseract.js in via dynamic import
// so the engine chunk is fetched only once a screenshot is actually chosen.
import { parseScreenshotLines, type ScreenshotParse } from "@frog/core";

export async function parseScreenshotImage(
  image: Blob,
  onProgress?: (fraction: number) => void,
): Promise<ScreenshotParse> {
  const { createTesseractEngine } = await import("./tesseract-engine");
  const engine = await createTesseractEngine(onProgress);
  try {
    return parseScreenshotLines(await engine.recognize(image));
  } finally {
    await engine.dispose();
  }
}
