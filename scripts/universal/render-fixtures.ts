// Renders scripts/universal/fixtures.ts to 1170x2532 PNGs (committed).
//   bun scripts/universal/render-fixtures.ts
import { mkdirSync, writeFileSync } from "node:fs";
import { chromium } from "@playwright/test";
import { SHOTS } from "./fixtures";

export const OUT = "packages/core/src/import/layout/fixtures";
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 3,
});
const page = await ctx.newPage();
for (const s of SHOTS) {
  await page.setContent(s.html);
  const png = await page.screenshot({ type: "png" });
  writeFileSync(`${OUT}/${s.id}.png`, png);
  console.log(s.id, `${(png.length / 1024).toFixed(0)} kB`);
}
await browser.close();
