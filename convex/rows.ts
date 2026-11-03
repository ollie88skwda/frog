// Generic owner-scoped row access — the PostgREST + RLS replacement for
// plain CRUD. Every entry point resolves the caller from the Clerk identity
// and enforces, per docs/DECISIONS.md 2026-11-01:
//
// - reads see the caller's rows, plus global (ownerId null) rows only on
//   exercises / metrics / machine_catalog;
// - inserts are always stamped ownerId = caller (a client-supplied ownerId
//   is ignored), parents named by a foreign key must be the caller's own
//   (or a readable global row for exercise/metric references), and storage
//   ids must have been uploaded by the caller (tables.ts FKS / FILE_FIELDS);
// - updates touch only the caller's rows; id/owner/provenance columns are
//   immutable; a filter that matches nothing the caller owns is a no-op.
//
// The multi-row operations (cascading deletes, routine graph replacement,
// publish, imports) live in their own modules and reuse these helpers.
import { v } from "convex/values";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { mutation, query } from "./_generated/server";
import { tableValidator } from "./data";
import { ownsFile } from "./files";
import {
  byUid,
  fail,
  GLOBAL_READABLE,
  out,
  readable,
  requireUser,
  type UidTable,
} from "./lib";
import { FILE_FIELDS, FKS, IMMUTABLE, UNIQUES, withDefaults } from "./tables";

type Row = Record<string, unknown>;
type Where = Record<string, unknown>;

// Equality filter → index for the large child tables, so a lookup by parent
// doesn't scan the owner's whole history. Results are still owner-filtered.
const PARENT_INDEX: Partial<Record<UidTable, [string, string]>> = {
  session_exercises: ["sessionId", "by_session"],
  set_logs: ["sessionExerciseId", "by_session_exercise"],
  routine_exercises: ["routineId", "by_routine"],
  routine_sets: ["routineExerciseId", "by_routine_exercise"],
  session_media: ["sessionId", "by_session"],
};

function matches(row: Row, where: Where | undefined): boolean {
  if (!where) return true;
  for (const [k, want] of Object.entries(where)) {
    const got = row[k] ?? null;
    if (Array.isArray(want)) {
      if (!want.includes(got)) return false;
    } else if (got !== want) {
      return false;
    }
  }
  return true;
}

/** The caller's rows matching an equality filter (array value = IN). */
export async function findOwned(
  ctx: QueryCtx | MutationCtx,
  table: UidTable,
  owner: string,
  where?: Where,
): Promise<Row[]> {
  const id = where?.id;
  if (typeof id === "string" || Array.isArray(id)) {
    const rows: Row[] = [];
    for (const one of typeof id === "string" ? [id] : new Set<string>(id)) {
      const row = (await byUid(ctx, table, one)) as Row | null;
      if (row?.ownerId === owner && matches(row, where)) rows.push(row);
    }
    return rows;
  }
  const parent = PARENT_INDEX[table];
  if (parent && where) {
    const want = where[parent[0]];
    const keys =
      typeof want === "string"
        ? [want]
        : Array.isArray(want)
          ? (want as string[])
          : null;
    if (keys) {
      const rows: Row[] = [];
      for (const key of keys) {
        const batch = await ctx.db
          .query(table)
          // biome-ignore lint/suspicious/noExplicitAny: index chosen per table
          .withIndex(parent[1] as any, (q: any) => q.eq(parent[0], key))
          .collect();
        for (const r of batch as Row[]) {
          if (r.ownerId === owner && matches(r, where)) rows.push(r);
        }
      }
      return rows;
    }
  }
  const rows = (await ctx.db
    .query(table)
    // biome-ignore lint/suspicious/noExplicitAny: every UidTable has by_owner
    .withIndex("by_owner" as any, (q: any) => q.eq("ownerId", owner))
    .collect()) as Row[];
  return rows.filter((r) => matches(r, where));
}

async function checkRefs(
  ctx: MutationCtx,
  table: UidTable,
  owner: string,
  row: Row,
): Promise<void> {
  for (const [field, rule] of Object.entries(FKS[table] ?? {})) {
    const ref = row[field];
    if (ref == null) continue;
    if (typeof ref !== "string") fail(`${table}.${field} must be a string`);
    const target =
      rule.mode === "readable"
        ? await readable(ctx, rule.table, ref, owner)
        : await byUid(ctx, rule.table, ref);
    if (
      !target ||
      (rule.mode === "owned" && (target as Row).ownerId !== owner)
    ) {
      fail(`${table}.${field}: ${rule.table} ${ref} not found`);
    }
  }
  for (const field of FILE_FIELDS[table] ?? []) {
    const ref = row[field];
    if (ref == null) continue;
    if (typeof ref !== "string" || !(await ownsFile(ctx, ref, owner))) {
      fail(`${table}.${field}: file not found`);
    }
  }
}

async function checkUnique(
  ctx: MutationCtx,
  table: UidTable,
  owner: string,
  row: Row,
  selfId: string,
): Promise<void> {
  for (const u of UNIQUES[table] ?? []) {
    const hits = (await ctx.db
      .query(table)
      // biome-ignore lint/suspicious/noExplicitAny: index chosen per table
      .withIndex(u.index as any, (q: any) => {
        let r = u.owner ? q.eq("ownerId", owner) : q;
        for (const f of u.fields) r = r.eq(f, row[f]);
        return r;
      })
      .collect()) as Row[];
    if (hits.some((h) => h.id !== selfId)) {
      fail(`${table}: duplicate ${u.fields.join(", ") || "row"}`);
    }
  }
}

/**
 * Inserts (or, when a row with this id already exists and is the caller's,
 * overwrites — the retry-idempotency rule Repo.logSet depends on) one row.
 * Returns the stored row.
 */
export async function insertRow(
  ctx: MutationCtx,
  table: UidTable,
  owner: string,
  input: Row,
): Promise<Row> {
  const { ownerId: _ignored, createdBy: _cb, nameLower: _nl, ...rest } = input;
  if (typeof rest.id !== "string" || rest.id === "") fail("id is required");
  const now = Date.now();
  const existing = (await byUid(ctx, table, rest.id)) as Row | null;
  if (existing && existing.ownerId !== owner) fail(`${table}: id conflict`);
  const full = withDefaults(table, rest, now);
  full.ownerId = owner;
  if (table === "exercises") full.createdBy = null;
  if (table === "machine_catalog") full.createdBy = null;
  await checkRefs(ctx, table, owner, full);
  await checkUnique(ctx, table, owner, full, rest.id);
  if (existing) {
    await ctx.db.replace(
      existing._id as never,
      { ...full, createdAt: existing.createdAt } as never,
    );
    return { ...full, createdAt: existing.createdAt };
  }
  await ctx.db.insert(table, full as never);
  return full;
}

/** Applies `patch` to the caller's rows matching `where`; returns them. */
export async function updateRows(
  ctx: MutationCtx,
  table: UidTable,
  owner: string,
  where: Where,
  patch: Row,
): Promise<Row[]> {
  const clean: Row = {};
  for (const [k, val] of Object.entries(patch)) {
    if (val === undefined || IMMUTABLE.has(k)) continue;
    clean[k] = val;
  }
  if (Object.keys(clean).length === 0) return [];
  const targets = await findOwned(ctx, table, owner, where);
  const result: Row[] = [];
  for (const row of targets) {
    const next: Row = { ...row, ...clean };
    if (table === "exercises" && "name" in clean) {
      next.nameLower = String(clean.name).trim().toLowerCase();
    }
    await checkRefs(ctx, table, owner, clean);
    await checkUnique(ctx, table, owner, next, row.id as string);
    const delta: Row = { ...clean };
    if (table === "exercises" && "name" in clean)
      delta.nameLower = next.nameLower;
    await ctx.db.patch(row._id as never, delta as never);
    result.push(next);
  }
  return result;
}

/** Soft-deletes the caller's rows matching `where`. */
export async function softDelete(
  ctx: MutationCtx,
  table: UidTable,
  owner: string,
  where: Where,
  now = Date.now(),
): Promise<Row[]> {
  return updateRows(ctx, table, owner, where, {
    deletedAt: now,
    updatedAt: now,
  });
}

// ── Public functions ──────────────────────────────────────────────────────

/** One readable row by uuid (own, or global on the global tables). */
export const get = query({
  args: { table: tableValidator, id: v.string() },
  handler: async (ctx, { table, id }) => {
    const me = await requireUser(ctx);
    const row = await readable(ctx, table as UidTable, id, me);
    return row ? out(row as Row) : null;
  },
});

/**
 * Equality-filtered read of the caller's rows (plus global rows with
 * `global: true` on the global tables). For small tables and test
 * assertions — large reads go through data:page.
 */
export const find = query({
  args: {
    table: tableValidator,
    where: v.optional(v.any()),
    global: v.optional(v.boolean()),
  },
  handler: async (ctx, { table, where, global }) => {
    const me = await requireUser(ctx);
    const t = table as UidTable;
    const mine = await findOwned(ctx, t, me, where as Where | undefined);
    let rows = mine;
    if (global && GLOBAL_READABLE.has(t)) {
      const globals = (await ctx.db
        .query(t)
        // biome-ignore lint/suspicious/noExplicitAny: every UidTable has by_owner
        .withIndex("by_owner" as any, (q: any) => q.eq("ownerId", null))
        .collect()) as Row[];
      rows = [...mine, ...globals.filter((r) => matches(r, where as Where))];
    }
    return rows.map(out);
  },
});

export const insert = mutation({
  args: { table: tableValidator, rows: v.array(v.any()) },
  handler: async (ctx, { table, rows }) => {
    const me = await requireUser(ctx);
    const stored: Row[] = [];
    for (const r of rows as Row[]) {
      stored.push(out(await insertRow(ctx, table as UidTable, me, r)));
    }
    return stored;
  },
});

export const update = mutation({
  args: { table: tableValidator, where: v.any(), patch: v.any() },
  handler: async (ctx, { table, where, patch }) => {
    const me = await requireUser(ctx);
    if (!where || typeof where !== "object") fail("where is required");
    const rows = await updateRows(
      ctx,
      table as UidTable,
      me,
      where as Where,
      patch as Row,
    );
    return rows.map(out);
  },
});
