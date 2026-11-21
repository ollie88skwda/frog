// Renders scripts/ocr/fixtures.ts to deterministic 390x844 @2x PNGs.
//   bun scripts/ocr/render-fixtures.ts
import { mkdirSync, writeFileSync } from "node:fs";
import { chromium } from "@playwright/test";
import { FIXTURES } from "./fixtures";

export const OUT = "packages/core/src/import/ocr/fixtures";
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
});
const ctx1 = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 1,
});
const first = await ctx.newPage();
const page1 = await ctx1.newPage();
for (const f of FIXTURES) {
  const page = f.lowres ? page1 : first;
  await page.setContent(f.html);
  const png = await page.screenshot({ type: "png" });
  writeFileSync(`${OUT}/${f.id}.png`, png);
  console.log(f.id, `${(png.length / 1024).toFixed(0)} kB`);
}
await browser.close();
