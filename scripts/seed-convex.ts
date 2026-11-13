// Global seed rows (ownerId null) for a Convex deployment: the seed
// exercise library, the seed conditions (metrics) and the machine catalog.
//
//   bun scripts/seed-convex.ts --generate   # rebuild scripts/convex/global-seed.json
//   bun scripts/seed-convex.ts              # upsert it into the deployment
//
// --generate replays supabase/migrations (where those rows were defined)
// into PGlite and dumps the null-owner rows — so the Convex seed is derived
// from, and byte-for-byte consistent with, what Supabase had. The JSON is
// generated output; never hand-edit it. Upserting is idempotent on each
// row's uuid (admin:upsertGlobal), so re-running after a seed change
// updates rows in place. Target: see scripts/convex/admin-client.ts.
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { applyClassification } from "./classify-exercises/classify-lib";
import { CLASSIFICATION_PATH } from "./classify-exercises/paths";
import type { ClassificationFile } from "./classify-exercises/types";
import { adminClient } from "./convex/admin-client";
import { chunks, toConvex } from "./convex-rows-lib";

const ROOT = join(import.meta.dir, "..");
const SEED_FILE = join(ROOT, "scripts/convex/global-seed.json");
// Seed migrations stamp rows with now(); pin those to a fixed epoch so
// regenerating is deterministic (2026-07-12, the first seed migration).
const SEED_EPOCH = 1783814400000;
const SEED_TABLES = ["exercises", "metrics", "machine_catalog"] as const;
type Seed = Record<(typeof SEED_TABLES)[number], Record<string, unknown>[]>;

async function generate(): Promise<void> {
  const { replayMigrations } = await import("./convex/pg-replay");
  const replayStart = Date.now();
  const db = await replayMigrations(ROOT);
  const seed = {} as Seed;
  // The frozen-SQL replay cannot write new exercise fields (mechanic,
  // muscleTargets role/weight, ...), so the classification backfill (plan
  // §9.7, scripts/classify-exercises/) is merged over the dumped rows here.
  const classification = JSON.parse(
    readFileSync(CLASSIFICATION_PATH, "utf8"),
  ) as ClassificationFile;
  for (const t of SEED_TABLES) {
    const res = await db.query<Record<string, unknown>>(
      `select * from ${t} where owner_id is null order by id`,
    );
    seed[t] = res.rows.map((r) => {
      const row = toConvex(t, r);
      for (const k of ["createdAt", "updatedAt", "deletedAt"]) {
        if (typeof row[k] === "number" && row[k] >= replayStart) {
          row[k] = SEED_EPOCH;
        }
      }
      if (t === "exercises") {
        applyClassification(row, classification.byId[row.id as string]);
      }
      return row;
    });
  }
  await db.close();
  // One row per line: reviewable diffs without a 2 MB single line.
  const body = SEED_TABLES.map(
    (t) =>
      `  ${JSON.stringify(t)}: [\n${seed[t].map((r) => `    ${JSON.stringify(r)}`).join(",\n")}\n  ]`,
  ).join(",\n");
  writeFileSync(SEED_FILE, `{\n${body}\n}\n`);
  console.log(
    `wrote ${SEED_FILE}: ${SEED_TABLES.map((t) => `${t}=${seed[t].length}`).join(" ")}`,
  );
}

async function apply(): Promise<void> {
  const seed = JSON.parse(readFileSync(SEED_FILE, "utf8")) as Seed;
  const admin = adminClient();
  for (const t of SEED_TABLES) {
    let inserted = 0;
    let updated = 0;
    // exercises carry instructions arrays; 100 rows/mutation stays far
    // below Convex's per-mutation write limits.
    for (const batch of chunks(seed[t], 100)) {
      const res = await admin.mutation<{ inserted: number; updated: number }>(
        "admin:upsertGlobal",
        { table: t, rows: batch },
      );
      inserted += res.inserted;
      updated += res.updated;
    }
    console.log(`${t}: ${inserted} inserted, ${updated} updated`);
  }
}

if (process.argv.includes("--generate")) await generate();
else await apply();
