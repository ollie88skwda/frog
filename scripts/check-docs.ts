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

// CI guard: apps/web/public/llms.txt hand-summarizes docs/api.md's REST
// endpoints. Every inline-code column name docs/api.md calls out for an
// endpoint must also appear on that endpoint's llms.txt line, so the two
// can't drift. Only real columns count, so ordinary prose in backticks
// (`null`, `jsonb`, …) never trips the guard.
const api = readFileSync("docs/api.md", "utf8");
const llms = readFileSync("apps/web/public/llms.txt", "utf8");

const columns = new Set(
  [
    ...schema.matchAll(
      /\b(?:bigint|boolean|integer|jsonb|real|text|uuid)\(\s*"([a-z][a-z_]*)"/g,
    ),
  ].map((m) => m[1]),
);
if (columns.size === 0)
  throw new Error("no column definitions found — check script is broken");

const headings = [...api.matchAll(/^### `GET ([^`]+)`\n/gm)];
if (headings.length === 0)
  throw new Error(
    "no endpoint sections found in docs/api.md — check script is broken",
  );

const endpointSections = headings.map((h, i) => {
  const bodyStart = h.index + h[0].length;
  const nextHeadingStart = headings[i + 1]?.index ?? api.length;
  const nextH2 = api.slice(bodyStart, nextHeadingStart).search(/\n## /);
  const bodyEnd = nextH2 === -1 ? nextHeadingStart : bodyStart + nextH2;
  return [h[1], api.slice(bodyStart, bodyEnd)];
});

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

for (const [path, body] of endpointSections) {
  const fields = [
    ...new Set(
      [...body.matchAll(/`([a-z][a-z_]*)`/g)]
        .map((m) => m[1])
        .filter((f) => columns.has(f)),
    ),
  ];
  const entryRe = new RegExp(`\`GET ${escapeRe(path)}[\`?]`);
  const llmsLine = llms.split("\n").find((l) => entryRe.test(l));
  if (!llmsLine) {
    console.error(
      `apps/web/public/llms.txt is missing an entry for GET ${path}`,
    );
    process.exit(1);
  }
  const missingFields = fields.filter(
    (f) => !new RegExp(`\\b${f}\\b`).test(llmsLine),
  );
  if (missingFields.length > 0) {
    console.error(
      `apps/web/public/llms.txt's GET ${path} entry is missing fields docs/api.md documents: ${missingFields.join(", ")}`,
    );
    process.exit(1);
  }
}
console.log(
  `apps/web/public/llms.txt matches docs/api.md for all ${endpointSections.length} documented endpoints.`,
);
