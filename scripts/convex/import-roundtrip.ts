// Round-trip check for scripts/import-from-supabase.ts against a LOCAL Convex
// backend, with no Docker: replays supabase/migrations into PGlite (the same
// schema local Supabase runs), loads import-fixture.sql on top, imports it,
// then reads every row back through admin access and compares it field by
// field with the source (after the documented snake→camel mapping).
//
//   bun --env-file=<local backend env> scripts/convex/import-roundtrip.ts
//
// Also proves --dry-run writes nothing, re-runs are idempotent, and the
// imported rows are visible to their owner (and only them) through the
// public functions. Leaves no rows behind (purges the e2e-import-* owners).
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ConvexHttpClient } from "convex/browser";
import { IMPORT_ORDER, toConvex } from "../convex-rows-lib";
import { loadOrCreateTestAuth } from "../convex-test-auth";
import { purgeE2eUser } from "../e2e-cleanup";
import { main, type Source } from "../import-from-supabase";
import { adminClient } from "./admin-client";
import { replayMigrations } from "./pg-replay";

const ROOT = join(import.meta.dir, "../..");
type Row = Record<string, unknown>;

const admin = adminClient();
const host = new URL(admin.client.url).hostname;
if (host !== "127.0.0.1" && host !== "localhost") {
  throw new Error(`IMPORT_ROUNDTRIP_NOT_LOCAL: refusing ${host}`);
}

const db = await replayMigrations(ROOT);
await db.exec(
  readFileSync(join(import.meta.dir, "import-fixture.sql"), "utf8"),
);
const source = (): Source => ({
  label: "pglite (migrations + import-fixture.sql)",
  rows: async (t) =>
    (await db.query<Row>(`select * from public.${t} order by created_at, id`))
      .rows,
  close: async () => {},
});

let failures = 0;
const check = (ok: boolean, msg: string) => {
  console.log(`${ok ? "ok  " : "FAIL"} ${msg}`);
  if (!ok) failures++;
};

/** JSON with object keys sorted: jsonb and Convex each store object keys in
 * their own canonical order, which is not a data difference. */
function canon(x: unknown): string {
  return JSON.stringify(x ?? null, (_k, v) =>
    v && typeof v === "object" && !Array.isArray(v)
      ? Object.fromEntries(
          Object.keys(v)
            .sort()
            .map((k) => [k, (v as Row)[k]]),
        )
      : v,
  );
}

const OWNERS = ["e2e-import-a", "e2e-import-b"];
for (const o of OWNERS) await purgeE2eUser(admin, o);

// Stub of Supabase Storage's authenticated object endpoint, serving the one
// file the fixture references, so the blob-copy path runs for real.
const PHOTO = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 0xff, 0xd9]);
const stub = Bun.serve({
  port: 0,
  fetch(req) {
    const u = new URL(req.url);
    if (req.headers.get("authorization") !== "Bearer stub-service-key") {
      return new Response("unauthorized", { status: 401 });
    }
    if (
      u.pathname ===
      "/storage/v1/object/authenticated/progress-photos/e2e-import-a/2026-07-14.jpg"
    ) {
      return new Response(PHOTO, { headers: { "content-type": "image/jpeg" } });
    }
    return new Response("not found", { status: 404 });
  },
});
process.env.SUPABASE_URL = `http://127.0.0.1:${stub.port}`;
process.env.SUPABASE_SERVICE_ROLE_KEY = "stub-service-key";

// 1. Dry run writes nothing.
const before = await admin.mutation<Record<string, number>>("admin:counts", {
  tables: [...IMPORT_ORDER],
});
const dry = await main({ source: source(), dryRun: true, quiet: true });
const afterDry = await admin.mutation<Record<string, number>>("admin:counts", {
  tables: [...IMPORT_ORDER],
});
check(
  JSON.stringify(before) === JSON.stringify(afterDry),
  "--dry-run leaves every Convex table untouched",
);
check(dry.sourceCounts.sessions === 3, "dry run read the fixture sessions");
check(dry.wouldCopy === 1, "dry run reports the one file it would copy");

// 2. Import + verify, twice (idempotent).
const first = await main({
  source: source(),
  verify: true,
  admin,
  quiet: true,
});
check(
  first.copiedFiles === 1 && first.droppedFiles === 0,
  "the referenced progress photo was copied into Convex storage",
);
const once = await admin.mutation<Record<string, number>>("admin:counts", {
  tables: [...IMPORT_ORDER],
});
const second = await main({
  source: source(),
  verify: true,
  admin,
  quiet: true,
});
check(second.copiedFiles === 0, "re-run reuses the copied blob (no re-upload)");
const twice = await admin.mutation<Record<string, number>>("admin:counts", {
  tables: [...IMPORT_ORDER],
});
check(
  JSON.stringify(once) === JSON.stringify(twice),
  "re-running the import adds no rows",
);

// 3. Field-by-field comparison for every fixture row (both owners) and every
// global row.
const auth = await loadOrCreateTestAuth(
  process.env.FROG_TEST_KEY ?? join(ROOT, ".convex-test/key.json"),
);
async function asUser(sub: string) {
  const c = new ConvexHttpClient(admin.client.url);
  c.setAuth(await auth.mint(sub));
  return c;
}
const a = await asUser("e2e-import-a");
const b = await asUser("e2e-import-b");

for (const t of IMPORT_ORDER) {
  const src = (
    await db.query<Row>(`select * from public.${t} order by created_at, id`)
  ).rows;
  let compared = 0;
  let mismatched = 0;
  for (const raw of src) {
    const want = toConvex(t, raw);
    // File paths become Convex storage ids (checked separately below).
    if (t === "measurements") want.photoPath = "<storage id>";
    const got = await admin.query<Row | null>("admin:getRow", {
      table: t,
      id: want.id,
    });
    compared++;
    if (t === "measurements" && got) {
      check(
        typeof got.photoPath === "string" &&
          got.photoPath !== "e2e-import-a/2026-07-14.jpg",
        "measurements.photo_path rewritten to a storage id",
      );
      want.photoPath = got.photoPath;
    }
    const diff = Object.keys(want).filter(
      (k) => canon(want[k]) !== canon(got?.[k]),
    );
    if (!got || diff.length) {
      mismatched++;
      if (mismatched <= 3) {
        console.log(
          `     ${t} ${want.id}: ${got ? `differs in ${diff.join(", ")}` : "missing"}`,
        );
        for (const k of diff.slice(0, 3)) {
          console.log(
            `       ${k}: source ${JSON.stringify(want[k])} convex ${JSON.stringify(got?.[k])}`,
          );
        }
      }
    }
  }
  check(mismatched === 0, `${t}: ${compared} rows identical after import`);
}

// 4. Ownership survives: A sees its rows through public functions, B doesn't.
const aSessions = (await a.query(
  "rows:find" as never,
  {
    table: "sessions",
  } as never,
)) as Row[];
const bSessions = (await b.query(
  "rows:find" as never,
  {
    table: "sessions",
  } as never,
)) as Row[];
check(
  aSessions.length === 2 && bSessions.length === 1,
  "imported sessions stay with their owners (A=2 incl. soft-deleted, B=1)",
);
check(
  !bSessions.some((s) => String(s.id).startsWith("11111111")),
  "B cannot read A's imported rows",
);
const detail = (await a.query(
  "sessions:detail" as never,
  {
    sessionId: "11111111-0000-4000-8000-00000000000b",
  } as never,
)) as { sets: Row[] }[];
check(
  detail[0]?.sets.length === 2,
  "imported unilateral pair renders as one block with two rows",
);

const m = (await a.query(
  "rows:find" as never,
  {
    table: "measurements",
  } as never,
)) as Row[];
const url = (await a.query(
  "files:url" as never,
  {
    storageId: m[0]?.photoPath,
  } as never,
)) as string | null;
const bytes = url
  ? new Uint8Array(await (await fetch(url)).arrayBuffer())
  : null;
check(
  !!bytes &&
    bytes.length === PHOTO.length &&
    bytes.every((x, i) => x === PHOTO[i]),
  "owner A can read the copied photo, byte-identical",
);
check(
  (await b.query(
    "files:url" as never,
    {
      storageId: m[0]?.photoPath,
    } as never,
  )) === null,
  "owner B cannot resolve A's copied photo",
);

for (const o of OWNERS) await purgeE2eUser(admin, o);
stub.stop();
await db.close();
if (failures) {
  console.error(`${failures} check(s) failed`);
  process.exit(1);
}
console.log("import round-trip: all checks passed");
