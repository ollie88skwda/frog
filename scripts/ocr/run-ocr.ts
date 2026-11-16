// Runs tesseract.js (node) over the committed fixture PNGs, writes the raw
// OCR lines to packages/core/src/import/ocr/fixtures/ocr-lines.json (so unit
// tests exercise the parser on real OCR noise without loading the engine),
// and prints/writes per-app accuracy against ground truth.
//   bun scripts/ocr/run-ocr.ts [--report <path>]
import { readFileSync, writeFileSync } from "node:fs";
import { scoreParse } from "../../packages/core/src/import/ocr/accuracy";
import { parseScreenshotLines } from "../../packages/core/src/import/ocr/parse-screenshot";
import { FIXTURES } from "./fixtures";

const DIR = "packages/core/src/import/ocr/fixtures";
const { createWorker } = await import(
  "../../apps/web/node_modules/tesseract.js"
);
const worker = await createWorker("eng", 1, {
  langPath: "apps/web/node_modules/@tesseract.js-data/eng/4.0.0_best_int",
  gzip: true,
  cachePath: "/tmp/frog-ocr-cache",
});
const lines: Record<string, { text: string; confidence: number }[]> = {};
const rows: string[] = [];
const per: Record<string, ReturnType<typeof scoreParse>[]> = {};
for (const f of FIXTURES) {
  const { data } = await worker.recognize(
    readFileSync(`${DIR}/${f.id}.png`),
    {},
    { blocks: true },
  );
  const ls = (data.blocks ?? [])
    .flatMap((b) => b.paragraphs.flatMap((p) => p.lines))
    .map((l) => ({ text: l.text.trim(), confidence: l.confidence / 100 }))
    .filter((l) => l.text);
  lines[f.id] = ls;
  const s = scoreParse(parseScreenshotLines(ls), f.truth);
  per[f.app] = [...(per[f.app] ?? []), s];
  rows.push(
    `${f.id}: names ${pct(s.names)} sets ${pct(s.sets)} reps ${pct(s.reps)} load ${pct(s.load)}`,
  );
}
await worker.terminate();
writeFileSync(`${DIR}/ocr-lines.json`, `${JSON.stringify(lines, null, 1)}\n`);
console.log(rows.join("\n"));
function pct(r: { ok: number; total: number }) {
  return r.total === 0
    ? "n/a"
    : `${Math.round((100 * r.ok) / r.total)}% (${r.ok}/${r.total})`;
}
const arg = process.argv.indexOf("--report");
if (arg > 0) {
  const sum = (xs: { ok: number; total: number }[]) => ({
    ok: xs.reduce((a, x) => a + x.ok, 0),
    total: xs.reduce((a, x) => a + x.total, 0),
  });
  let md =
    "| App fixtures | Exercise names | Set count | Reps | Load |\n|---|---|---|---|---|\n";
  for (const [app, ss] of Object.entries(per)) {
    md += `| ${app} (${ss.length}) | ${pct(sum(ss.map((s) => s.names)))} | ${pct(sum(ss.map((s) => s.sets)))} | ${pct(sum(ss.map((s) => s.reps)))} | ${pct(sum(ss.map((s) => s.load)))} |\n`;
  }
  writeFileSync(process.argv[arg + 1], md);
  console.log(md);
}
