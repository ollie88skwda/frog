// CI gate: the eagerly-loaded JS (what the browser downloads before first
// paint) must stay <= 220 kB gzipped — lightweight & fast is a product
// requirement, not a preference.
//
// The budget survived the Radix Themes migration (2026-07-15) unchanged: the
// <Theme> component adds ~13 kB gz, but that was absorbed — CVA was dropped and
// non-critical routes stay lazy — so the honest eager total is still under 220.
//
// This measures the eager set HONESTLY, from dist/index.html: the entry
// <script> plus every <link rel="modulepreload"> (Rollup emits one per static
// import of the entry). That is exactly the set the browser fetches up front.
// The previous version summed files matching `index-*.js`, which both
// over-counted (a lazily-loaded chunk Rollup happened to name `index-*` was
// included) and could under-count (a preloaded sibling chunk with another name
// would be missed). Do NOT "fix" a budget overage by renaming or vendor-
// splitting chunks: this reads index.html, so only genuinely deferring bytes to
// a dynamic import (lazy route) reduces the number.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { gzipSync } from "node:zlib";

const BUDGET_KB = 220;
const distDir = "apps/web/dist";
const assetsDir = join(distDir, "assets");

const html = readFileSync(join(distDir, "index.html"), "utf8");

// Entry script + static-import preloads = the eager set. Match src/href on
// <script type="module"> and <link rel="modulepreload">, normalise to a path
// under assets/.
const eager = new Set<string>();
const tagRe = /<(?:script[^>]*\bsrc|link[^>]*\bhref)=["']([^"']+\.js)["']/g;
for (const m of html.matchAll(tagRe)) {
  eager.add(m[1].replace(/^\/?/, "").replace(/^assets\//, ""));
}
if (eager.size === 0)
  throw new Error(
    `no eager <script>/<link modulepreload> in ${distDir}/index.html — run the build first`,
  );

let total = 0;
const rows: string[] = [];
for (const name of eager) {
  const bytes = gzipSync(readFileSync(join(assetsDir, name))).length;
  total += bytes;
  rows.push(`  ${(bytes / 1024).toFixed(1).padStart(6)} kB gz  ${name}`);
}
const kb = total / 1024;
console.log(rows.join("\n"));
console.log(
  `initial JS: ${kb.toFixed(1)} kB gz across ${eager.size} eager chunk(s) (budget ${BUDGET_KB})`,
);
if (kb > BUDGET_KB) {
  console.error("bundle budget exceeded");
  process.exit(1);
}

// Security gate: the Playwright auth bridge (window.__frog, VITE_E2E=1 builds)
// must never ship — in production it would expose a Supabase-native sign-in
// path that bypasses Clerk. A stray VITE_E2E=1 in an env file is enough to
// leak it, so check every emitted chunk for the marker.
//
// Matches the property-access shape (`.__frog`), not a bare substring: the
// /changelog lazy chunk embeds docs/DECISIONS.md's own text verbatim (2026-08-04
// changelog page), which permanently quotes "__frog" in prose (the 2026-07-28
// rename entry) with no preceding dot — a bare `.includes("__frog")` false-
// positives on that forever, since the entry can't be edited away. The actual
// leak (confirmed against a VITE_E2E=1 build) always emits `window.__frog=`,
// so the dot is the reliable discriminator.
const FROG_MARKER_RE = /\.__frog\b/;
for (const f of readdirSync(assetsDir).filter((n) => n.endsWith(".js"))) {
  if (FROG_MARKER_RE.test(readFileSync(join(assetsDir, f), "utf8"))) {
    console.error(
      `E2E test-hook marker "__frog" found in ${f} — was the build run with VITE_E2E=1?`,
    );
    process.exit(1);
  }
}
