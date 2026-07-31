// Static brand OG image (og-image-p6, report §4/§6 step 7): 1200×630, Green
// ground, no per-route stats — Frog is a client-only SPA with no public read
// path for a session, so a link unfurl can only ever carry the brand.
//
// Mirrors scripts/gen-pwa-icons.ts's shape: chromium.launch() → drive a real
// page → screenshot/export. Unlike the icon generator (which manipulates raw
// SVG), the OG card needs the actual `paintBrandOg` painter + the real
// FrogMark component, so instead of page.setContent() this spins up apps/web
// through Vite's dev server and drives a tiny harness page
// (apps/web/og-harness.html + src/og-harness.tsx, not part of the shipped
// app — see that file's header comment) that calls the same painter the
// share cards use.
//
// Two modes:
//   bun scripts/gen-og-image.ts          — generate apps/web/public/og.png
//   bun scripts/gen-og-image.ts --check  — CI gate: no browser, just asserts
//     og.png exists/is small and index.html's meta hasn't drifted from
//     APP_NAME (the guard-print-the-replacement pattern gen-pwa-icons.ts
//     already uses for icon.svg's viewBox).
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { chromium } from "@playwright/test";
import { createServer } from "vite";
import { APP_NAME } from "../packages/core/src/config";

declare global {
  interface Window {
    __ogReady?: boolean;
    __ogError?: string;
  }
}

const indexPath = new URL("../apps/web/index.html", import.meta.url);
const ogPath = new URL("../apps/web/public/og.png", import.meta.url);
const MAX_BYTES = 1024 * 1024;

function assertMetaMatchesAppName() {
  const html = readFileSync(indexPath, "utf8");
  const siteName = /property="og:site_name" content="([^"]*)"/.exec(html)?.[1];
  const ogTitle = /property="og:title" content="([^"]*)"/.exec(html)?.[1];
  const twitterTitle = /name="twitter:title" content="([^"]*)"/.exec(html)?.[1];

  const problems: string[] = [];
  if (siteName !== APP_NAME) {
    problems.push(
      `og:site_name is "${siteName}" — should be exactly APP_NAME:\n` +
        `  <meta property="og:site_name" content="${APP_NAME}" />`,
    );
  }
  const titlePrefix = `${APP_NAME} — `;
  if (!ogTitle?.startsWith(titlePrefix)) {
    problems.push(
      `og:title "${ogTitle}" doesn't start with "${titlePrefix}" — e.g.:\n` +
        `  <meta property="og:title" content="${titlePrefix}a training lab notebook" />`,
    );
  }
  if (!twitterTitle?.startsWith(titlePrefix)) {
    problems.push(
      `twitter:title "${twitterTitle}" doesn't start with "${titlePrefix}" — e.g.:\n` +
        `  <meta name="twitter:title" content="${titlePrefix}a training lab notebook" />`,
    );
  }
  if (problems.length) {
    throw new Error(
      `apps/web/index.html's OG meta has drifted from APP_NAME ("${APP_NAME}"):\n\n` +
        problems.join("\n\n"),
    );
  }
}

function assertOgFile() {
  if (!existsSync(ogPath)) {
    throw new Error(
      "apps/web/public/og.png is missing — run `bun scripts/gen-og-image.ts`",
    );
  }
  const bytes = readFileSync(ogPath).length;
  if (bytes > MAX_BYTES) {
    throw new Error(
      `apps/web/public/og.png is ${(bytes / 1024).toFixed(0)} kB — over the 1 MB soft cap ` +
        `several platforms (WhatsApp) silently downgrade above`,
    );
  }
  console.log(`apps/web/public/og.png: ${(bytes / 1024).toFixed(0)} kB`);
}

if (process.argv.includes("--check")) {
  assertMetaMatchesAppName();
  assertOgFile();
  console.log("og-image check passed.");
  process.exit(0);
}

assertMetaMatchesAppName();

const server = await createServer({
  root: new URL("../apps/web/", import.meta.url).pathname,
  server: { port: 0 },
  logLevel: "error",
});
await server.listen();
const address = server.httpServer?.address();
if (!address || typeof address === "string") {
  throw new Error("Vite dev server didn't report a port");
}
const url = `http://localhost:${address.port}/og-harness.html`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
await page.goto(url);
await page.waitForFunction(
  () => window.__ogReady === true || window.__ogError != null,
  { timeout: 15_000 },
);
const error = await page.evaluate(() => window.__ogError);
if (error) throw new Error(`og-harness failed to paint: ${error}`);

const dataUrl = await page.evaluate(() => {
  const canvas = document.getElementById("og-canvas") as HTMLCanvasElement;
  return canvas.toDataURL("image/png");
});
const base64 = dataUrl.replace(/^data:image\/png;base64,/, "");
writeFileSync(ogPath, Buffer.from(base64, "base64"));

await browser.close();
await server.close();

assertOgFile();
console.log(`wrote ${ogPath.pathname}`);
