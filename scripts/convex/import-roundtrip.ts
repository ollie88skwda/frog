// Round-trip check for scripts/import-from-supabase.ts against a LOCAL Convex
// backend, with no Docker: replays supabase/migrations into PGlite (the same
// schema local Supabase runs), loads import-fixture.sql on top, imports it,
// then reads rows back through admin access and compares them with EXPECTED:
// literal documents written by hand from import-fixture.sql + docs/schema.md
// (numbers as numbers, json as structure, file paths as storage ids), so a
// mapping bug can't pass by being on both sides of the comparison.
//
//   bun --env-file=<local backend env> scripts/convex/import-roundtrip.ts
//
// Also proves --dry-run writes nothing, re-runs are idempotent, and the
// imported rows are visible to their owner (and only them) through the
// public functions. Leaves no rows behind (purges the e2e-import-* owners).
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ConvexHttpClient } from "convex/browser";
import { convexHttpTransport } from "../../packages/core/src/repo/convex-http";
import { IMPORT_ORDER } from "../convex-rows-lib";
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

const A = "e2e-import-a";
const STORAGE_ID = Symbol("a Convex storage id, not the source path");
const A1 = "11111111-0000-4000-8000-0000000000";

// Per table: uuid → the fields that document must hold.
const EXPECTED: Record<string, Record<string, Row>> = {
  machines: {
    [`${A1}01`]: {
      ownerId: A,
      createdAt: 1783900000000,
      updatedAt: 1783900000000,
      deletedAt: null,
      name: "Leg Press",
      brand: "Hammer",
      photoPath: null,
      settings: [
        { label: "Seat", value: 4, photoPath: STORAGE_ID },
        { label: "Pad", value: null },
      ],
    },
  },
  exercises: {
    [`${A1}02`]: {
      ownerId: A,
      createdBy: null,
      name: "Import Press",
      isCustom: true,
      machineId: `${A1}01`,
      muscleTargets: [{ muscle: "quads", tier: "A", role: "primary" }],
      aliases: ["IP"],
    },
    [`${A1}03`]: {
      ownerId: null,
      createdBy: A,
      name: "Import Shared Lift",
      isCustom: true,
      machineId: null,
      muscleTargets: null,
      aliases: null,
    },
    // A row from the real seed migrations, not the fixture.
    "00000000-0000-4000-8000-000000000001": {
      ownerId: null,
      name: "Squat",
      isCustom: false,
    },
  },
  metrics: {
    [`${A1}04`]: {
      ownerId: A,
      name: "Water",
      type: "number",
      scope: "session",
      unit: "ml",
    },
    "00000000-0000-4000-8000-0000000000a1": {
      ownerId: null,
      name: "Sleep (h)",
    },
  },
  tracked_conditions: {
    [`${A1}05`]: { ownerId: A, metricId: `${A1}04`, tracked: true },
  },
  routine_folders: {
    [`${A1}06`]: { ownerId: A, name: "Legs", position: 0 },
  },
  routines: {
    [`${A1}07`]: {
      ownerId: A,
      name: "Leg Day",
      folderId: `${A1}06`,
      position: 0,
    },
  },
  routine_exercises: {
    [`${A1}08`]: {
      ownerId: A,
      routineId: `${A1}07`,
      exerciseId: `${A1}02`,
      orderIndex: 0,
      restSec: 120,
    },
  },
  routine_sets: {
    [`${A1}09`]: {
      ownerId: A,
      routineExerciseId: `${A1}08`,
      setNo: 0,
      targetWeightKg: 140.5,
      targetReps: 8,
      laterality: "unilateral",
    },
  },
  programs: {
    [`${A1}0a`]: {
      ownerId: A,
      source: "generated",
      folderId: `${A1}06`,
      active: true,
    },
  },
  sessions: {
    [`${A1}0b`]: {
      ownerId: A,
      startedAt: 1783900000010,
      endedAt: 1783903600000,
      title: "Imported legs",
      routineId: `${A1}07`,
      conditionValues: { "00000000-0000-4000-8000-000000000101": 7.5 },
      notes: "felt strong",
      deletedAt: null,
    },
    [`${A1}0c`]: {
      ownerId: A,
      endedAt: null,
      title: "Abandoned",
      conditionValues: null,
      deletedAt: 1783900000999,
    },
    "22222222-0000-4000-8000-000000000001": {
      ownerId: "e2e-import-b",
      startedAt: 1783900000021,
      title: "B session",
    },
  },
  session_exercises: {
    [`${A1}0d`]: {
      ownerId: A,
      sessionId: `${A1}0b`,
      exerciseId: `${A1}02`,
      orderIndex: 0,
      routineExerciseId: `${A1}08`,
    },
  },
  set_logs: {
    [`${A1}0e`]: {
      ownerId: A,
      sessionExerciseId: `${A1}0d`,
      setNo: 0,
      side: "left",
      weightKg: 70,
      reps: 10,
      rir: 2,
      completed: true,
    },
    [`${A1}0f`]: {
      ownerId: A,
      sessionExerciseId: `${A1}0d`,
      setNo: 0,
      side: "right",
      weightKg: 67.5,
      reps: 9,
      rir: null,
      completed: true,
    },
  },
  // The object is gone: the required path keeps its source value.
  session_media: {
    [`${A1}16`]: {
      ownerId: A,
      sessionId: `${A1}0b`,
      path: "e2e-import-a/deleted-photo.jpg",
      position: 2,
      mediaType: "photo",
      deletedAt: 1783900000998,
    },
  },
  measurements: {
    [`${A1}10`]: {
      ownerId: A,
      measuredOn: "2026-07-14",
      bodyweightKg: 82.3,
      waistCm: 84,
      photoPath: STORAGE_ID,
    },
  },
  exercise_prefs: {
    [`${A1}11`]: {
      ownerId: A,
      exerciseId: "00000000-0000-4000-8000-000000000001",
      weightUnit: "lb",
      generatorExcluded: true,
    },
  },
  exercise_favorites: {
    [`${A1}12`]: {
      ownerId: A,
      exerciseId: "00000000-0000-4000-8000-000000000001",
      favorite: true,
    },
  },
  user_prefs: {
    [`${A1}13`]: { ownerId: A, displayName: "Importer", bodyDiagram: "female" },
  },
  push_subscriptions: {
    [`${A1}14`]: {
      ownerId: A,
      endpoint: "https://push.example/import",
      keys: { p256dh: "a", auth: "b" },
    },
  },
  api_tokens: {
    [`${A1}15`]: {
      ownerId: A,
      name: "cli",
      tokenHash:
        "aa11bb22cc33dd44ee55ff6600778899aa11bb22cc33dd44ee55ff6600778899",
      lastUsedAt: null,
    },
  },
};

/** Strict structural match; an object's keys must match exactly below the
 * top level (object key order is not a data difference). */
function same(want: unknown, got: unknown): boolean {
  if (want === STORAGE_ID) return typeof got === "string" && !got.includes("/");
  if (Array.isArray(want)) {
    return (
      Array.isArray(got) &&
      want.length === got.length &&
      want.every((w, i) => same(w, got[i]))
    );
  }
  if (want && typeof want === "object") {
    if (!got || typeof got !== "object") return false;
    const keys = new Set([...Object.keys(want), ...Object.keys(got)]);
    return [...keys].every((k) => same((want as Row)[k], (got as Row)[k]));
  }
  return want === got;
}

const OWNERS = [A, "e2e-import-b"];
for (const o of OWNERS) await purgeE2eUser(admin, o);

// Stub of Supabase Storage's authenticated object endpoint, serving the
// fixture's files that still exist, so the blob-copy path runs for real.
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
        "/storage/v1/object/authenticated/progress-photos/e2e-import-a/2026-07-14.jpg" ||
      u.pathname ===
        "/storage/v1/object/authenticated/machine-photos/e2e-import-a/seat.jpg"
    ) {
      return new Response(PHOTO, { headers: { "content-type": "image/jpeg" } });
    }
    return new Response("not found", { status: 404 });
  },
});
process.env.SUPABASE_URL = `http://127.0.0.1:${stub.port}`;
process.env.SUPABASE_SERVICE_ROLE_KEY = "stub-service-key";

// 1. Dry run writes nothing.
const before = await admin.counts(IMPORT_ORDER);
const dry = await main({ source: source(), dryRun: true, quiet: true });
const afterDry = await admin.counts(IMPORT_ORDER);
check(
  JSON.stringify(before) === JSON.stringify(afterDry),
  "--dry-run leaves every Convex table untouched",
);
check(dry.sourceCounts.sessions === 3, "dry run read the fixture sessions");
check(dry.wouldCopy === 3, "dry run reports the three files it would copy");

// 2. Import + verify, twice (idempotent).
const first = await main({
  source: source(),
  verify: true,
  admin,
  quiet: true,
});
check(
  first.copiedFiles === 2 && first.droppedFiles === 1,
  "existing objects were copied; the missing workout photo was dropped, not fatal",
);
const once = await admin.counts(IMPORT_ORDER);
const second = await main({
  source: source(),
  verify: true,
  admin,
  quiet: true,
});
check(second.copiedFiles === 0, "re-run reuses the copied blob (no re-upload)");
const twice = await admin.counts(IMPORT_ORDER);
check(
  JSON.stringify(once) === JSON.stringify(twice),
  "re-running the import adds no rows",
);

// 3. Every expected document landed as written, and every source row (fixture
// and seed) exists under its source owner and timestamp.
const auth = await loadOrCreateTestAuth(
  process.env.FROG_TEST_KEY ?? join(ROOT, ".convex-test/key.json"),
);
async function asUser(sub: string) {
  const token = await auth.mint(sub);
  const c = new ConvexHttpClient(admin.client.url);
  c.setAuth(token);
  const files = convexHttpTransport({
    url: admin.client.url,
    getToken: async () => token,
  });
  return Object.assign(c, { file: files.file });
}
const a = await asUser(A);
const b = await asUser("e2e-import-b");

check(
  IMPORT_ORDER.every(
    (t) => t === "machine_catalog" || Object.keys(EXPECTED[t] ?? {}).length > 0,
  ),
  "the expected documents cover every user table",
);
for (const [t, docs] of Object.entries(EXPECTED)) {
  for (const [id, want] of Object.entries(docs)) {
    const got = await admin.query<Row | null>("admin:getRow", { table: t, id });
    const diff = Object.keys(want).filter((k) => !same(want[k], got?.[k]));
    check(
      !!got && diff.length === 0,
      `${t} ${id}: ${got ? (diff.length ? `differs in ${diff.join(", ")}: ${diff.map((k) => JSON.stringify(got[k])).join(", ")}` : "as expected") : "missing"}`,
    );
  }
}
for (const t of IMPORT_ORDER) {
  const src = (
    await db.query<Row>(`select * from public.${t} order by created_at, id`)
  ).rows;
  let wrong = 0;
  for (const raw of src) {
    const got = await admin.query<Row | null>("admin:getRow", {
      table: t,
      id: raw.id as string,
    });
    if (
      !got ||
      got.ownerId !== raw.owner_id ||
      got.createdAt !== Number(raw.created_at)
    ) {
      wrong++;
    }
  }
  check(wrong === 0, `${t}: all ${src.length} source rows present`);
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
const blob = await a.file(m[0]?.photoPath as string);
const bytes = blob ? new Uint8Array(await blob.arrayBuffer()) : null;
check(
  !!bytes &&
    bytes.length === PHOTO.length &&
    bytes.every((x, i) => x === PHOTO[i]),
  "owner A can read the copied photo, byte-identical",
);
check(
  (await b.file(m[0]?.photoPath as string)) === null,
  "owner B cannot read A's copied photo",
);
check(
  (await a.file("e2e-import-a/deleted-photo.jpg")) === null,
  "a workout photo whose object was gone resolves to no file",
);

for (const o of OWNERS) await purgeE2eUser(admin, o);
stub.stop();
await db.close();
if (failures) {
  console.error(`${failures} check(s) failed`);
  process.exit(1);
}
console.log("import round-trip: all checks passed");
