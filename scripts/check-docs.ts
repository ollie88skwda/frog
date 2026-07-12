// CI guard: docs/schema.md must mention every table defined in the Drizzle
// schema, so the AI-facing docs can't silently drift from the DDL.
import { readFileSync } from "node:fs";

const schema = readFileSync("packages/core/src/db/schema.ts", "utf8");
const docs = readFileSync("docs/schema.md", "utf8");

const tables = [...schema.matchAll(/pgTable\(\s*"([a-z_]+)"/g)].map(
  (m) => m[1],
);
if (tables.length === 0)
  throw new Error("no pgTable definitions found — check script is broken");

const missing = tables.filter((t) => !docs.includes(t));
if (missing.length > 0) {
  console.error(`docs/schema.md is missing tables: ${missing.join(", ")}`);
  process.exit(1);
}
console.log(`docs/schema.md covers all ${tables.length} tables.`);
