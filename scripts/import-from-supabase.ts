// One-time Supabase → Convex data import (docs/DECISIONS.md 2026-11-01).
//
//   bun scripts/import-from-supabase.ts --dry-run          # read + map + report, write nothing
//   bun scripts/import-from-supabase.ts                    # import
//   bun scripts/import-from-supabase.ts --verify           # import, then compare counts per table
//
// Source (Postgres, read-only): SUPABASE_DB_URL — a postgres:// URL. Local
// Supabase is postgresql://postgres:postgres@127.0.0.1:54322/postgres. Only
// `select`s are issued; nothing on the source is modified.
// Storage (optional): SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY copy the four
// private buckets' objects (machine-photos, exercise-media, session-media,
// progress-photos) into Convex storage and rewrite the *_path columns to the
// new storage ids. Without them, path columns are imported as null and the
// run reports how many file references were dropped.
// Target (Convex): see scripts/convex/admin-client.ts (CONVEX_URL +
// CONVEX_ADMIN_KEY, CONVEX_SELF_HOSTED_*, or CONVEX_DEPLOY_KEY).
//
// Every write is an idempotent upsert on the row's uuid (admin:importRows)
// and every copied blob is keyed by its source path (files.importKey), so
// an interrupted import is safe to re-run from the start. Global rows
// (owner_id null: seed exercises/metrics/catalog and community-published
// exercises) are imported too — they're the same uuids the seed uses.
import { SQL } from "bun";
import { adminClient } from "./convex/admin-client";
import { chunks, IMPORT_ORDER, TABLES, toConvex } from "./convex-rows-lib";

type Row = Record<string, unknown>;

// Postgres table → [convex field, bucket] for columns holding a storage path.
const FILE_COLUMNS: Record<string, [string, string][]> = {
  machines: [["photoPath", "machine-photos"]],
  exercises: [["mediaPath", "exercise-media"]],
  measurements: [["photoPath", "progress-photos"]],
  session_media: [["path", "session-media"]],
};
// machines.settings[].photoPath (per-setting photos) live in machine-photos.
const SETTING_PHOTO_BUCKET = "machine-photos";

const BATCH = 100;

function arg(name: string) {
  return process.argv.includes(name);
}

function redactUrl(u: string): string {
  try {
    const url = new URL(u);
    if (url.password) url.password = "***";
    return url.toString();
  } catch {
    return "<unparseable url>";
  }
}

/** Read-only row source: Bun's Postgres client in the CLI, PGlite in tests. */
export type Source = {
  label: string;
  /** Every row of public.<table>, in a stable order. */
  rows: (table: string) => Promise<Row[]>;
  close: () => Promise<void>;
};

export function postgresSource(dbUrl: string): Source {
  const pg = new SQL(dbUrl);
  return {
    label: redactUrl(dbUrl),
    rows: async (table) =>
      (await pg.unsafe(
        `select * from public.${table} order by created_at, id`,
      )) as Row[],
    close: () => pg.close(),
  };
}

export async function main(
  opts: {
    source?: Source;
    dryRun?: boolean;
    verify?: boolean;
    admin?: ReturnType<typeof adminClient>;
    quiet?: boolean;
  } = {},
) {
  const dryRun = opts.dryRun ?? arg("--dry-run");
  const verify = opts.verify ?? arg("--verify");
  const log = opts.quiet ? () => {} : console.log;
  let source = opts.source;
  if (!source) {
    const dbUrl = process.env.SUPABASE_DB_URL;
    if (!dbUrl) {
      throw new Error(
        "IMPORT_SOURCE_MISSING: set SUPABASE_DB_URL (local: " +
          "postgresql://postgres:postgres@127.0.0.1:54322/postgres).",
      );
    }
    source = postgresSource(dbUrl);
  }
  const storage =
    process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY
      ? {
          url: process.env.SUPABASE_URL.replace(/\/+$/, ""),
          key: process.env.SUPABASE_SERVICE_ROLE_KEY,
        }
      : null;
  const admin = dryRun ? null : (opts.admin ?? adminClient());
  log(
    `${dryRun ? "[dry run] " : ""}source ${source.label} → ${
      admin ? admin.client.url : "(no writes)"
    }; storage copy ${storage ? "on" : "off"}`,
  );

  const sourceCounts: Record<string, number> = {};
  let droppedFiles = 0;
  let copiedFiles = 0;
  let wouldCopy = 0;
  const copyCache = new Map<string, string | null>();

  /** Source path → Convex storage id (copying the blob once). */
  async function copyFile(
    bucket: string,
    path: string,
    ownerId: string | null,
  ): Promise<string | null> {
    const key = `${bucket}/${path}`;
    if (copyCache.has(key)) return copyCache.get(key) ?? null;
    if (dryRun && storage && ownerId) {
      wouldCopy++;
      copyCache.set(key, null);
      return null;
    }
    if (!storage || !admin || !ownerId) {
      droppedFiles++;
      copyCache.set(key, null);
      return null;
    }
    const prior = await admin.mutation<string | null>("admin:fileByImportKey", {
      importKey: key,
    });
    if (prior) {
      copyCache.set(key, prior);
      return prior;
    }
    const res = await fetch(
      `${storage.url}/storage/v1/object/authenticated/${bucket}/${path
        .split("/")
        .map(encodeURIComponent)
        .join("/")}`,
      { headers: { authorization: `Bearer ${storage.key}` } },
    );
    if (!res.ok) {
      console.warn(`  ! ${key}: download failed (${res.status}); dropping`);
      droppedFiles++;
      copyCache.set(key, null);
      return null;
    }
    const blob = await res.blob();
    const uploadUrl = await admin.mutation<string>(
      "admin:generateUploadUrl",
      {},
    );
    const up = await fetch(uploadUrl, {
      method: "POST",
      headers: {
        "Content-Type":
          res.headers.get("content-type") ?? "application/octet-stream",
      },
      body: blob,
    });
    if (!up.ok) {
      throw new Error(
        `IMPORT_UPLOAD_FAILED: ${key} → Convex upload ${up.status}: ${await up.text()}. ` +
          "Safe to re-run: earlier blobs are reused via files.importKey.",
      );
    }
    const { storageId } = (await up.json()) as { storageId: string };
    await admin.mutation("admin:claimFile", {
      storageId,
      ownerId,
      importKey: key,
    });
    copiedFiles++;
    copyCache.set(key, storageId);
    return storageId;
  }

  async function mapFiles(table: string, row: Row): Promise<Row> {
    const owner = (row.ownerId as string | null) ?? null;
    for (const [field, bucket] of FILE_COLUMNS[table] ?? []) {
      const path = row[field];
      if (typeof path === "string" && path) {
        row[field] = await copyFile(bucket, path, owner);
      }
    }
    if (table === "machines" && Array.isArray(row.settings)) {
      row.settings = await Promise.all(
        (row.settings as Row[]).map(async (s) =>
          typeof s?.photoPath === "string" && s.photoPath
            ? {
                ...s,
                photoPath: await copyFile(
                  SETTING_PHOTO_BUCKET,
                  s.photoPath,
                  owner,
                ),
              }
            : s,
        ),
      );
    }
    return row;
  }

  try {
    for (const table of IMPORT_ORDER) {
      if (!TABLES[table]) throw new Error(`no column metadata for ${table}`);
      // Stable order; soft-deleted rows are imported too (history, ids
      // never reused).
      const rows = await source.rows(table);
      sourceCounts[table] = rows.length;
      let inserted = 0;
      let updated = 0;
      for (const batch of chunks(rows, BATCH)) {
        const docs: Row[] = [];
        for (const r of batch)
          docs.push(await mapFiles(table, toConvex(table, r)));
        if (!admin) continue;
        const res = await admin.mutation<{ inserted: number; updated: number }>(
          "admin:importRows",
          { table, rows: docs },
        );
        inserted += res.inserted;
        updated += res.updated;
      }
      log(
        dryRun
          ? `  ${table}: ${rows.length} rows mapped`
          : `  ${table}: ${rows.length} rows (${inserted} inserted, ${updated} updated)`,
      );
    }
  } finally {
    await source.close();
  }

  log(
    dryRun && storage
      ? `files: ${wouldCopy} would be copied`
      : `files: ${copiedFiles} copied, ${droppedFiles} reference(s) ${
          storage ? "unreadable (dropped)" : "dropped (storage copy off)"
        }`,
  );

  if (verify && admin) {
    const target = await admin.mutation<Record<string, number>>(
      "admin:counts",
      {
        tables: [...IMPORT_ORDER],
      },
    );
    const short = IMPORT_ORDER.filter(
      (t) => (target[t] ?? 0) < sourceCounts[t],
    );
    for (const t of IMPORT_ORDER) {
      log(`  verify ${t}: source ${sourceCounts[t]}, convex ${target[t]}`);
    }
    if (short.length) {
      throw new Error(
        `IMPORT_VERIFY_FAILED: Convex has fewer rows than the source in ${short.join(", ")}. ` +
          "Re-run the import (idempotent) and check its log for skipped batches.",
      );
    }
    log("verify: every table has at least the source row count");
  }
  return { sourceCounts, copiedFiles, droppedFiles, wouldCopy };
}

if (import.meta.main) await main();
