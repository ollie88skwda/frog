// CI gate: initial JS (the eagerly-loaded index chunk) must stay <= 220 kB
// gzipped — lightweight & fast is a product requirement, not a preference.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { gzipSync } from "node:zlib";

const BUDGET_KB = 220;
const dir = "apps/web/dist/assets";

const entries = readdirSync(dir).filter(
  (f) => f.startsWith("index-") && f.endsWith(".js"),
);
if (entries.length === 0)
  throw new Error(`no index-*.js in ${dir} — run the build first`);

let total = 0;
for (const f of entries) {
  total += gzipSync(readFileSync(join(dir, f))).length;
}
const kb = total / 1024;
console.log(`initial JS: ${kb.toFixed(1)} kB gz (budget ${BUDGET_KB})`);
if (kb > BUDGET_KB) {
  console.error("bundle budget exceeded");
  process.exit(1);
}
