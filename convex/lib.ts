// Shared server helpers: identity, uuid lookups, ownership checks, output
// shaping. Every public Convex function in this directory starts from
// `requireUser` — this is the replacement for Postgres RLS, and it must stay
// at least as strict (docs/DECISIONS.md 2026-11-01):
//
//   read:  ownerId === caller   [+ ownerId === null ONLY for the global
//                                 tables: exercises, metrics, machine_catalog]
//   write: ownerId === caller, always. Global rows are written only by
//          internal functions (seed/import) and the `exercises:publish`
//          mutation (the old publish_exercise RPC's one sanctioned path).
//
// A write against a row the caller can't write is a silent no-op, matching
// the old RLS behaviour the app's fork gate was designed around (AGENTS.md:
// an RLS-blocked UPDATE resolved with zero rows). Inserts that reference a
// parent the caller doesn't own throw instead — stricter than RLS was.
import { ConvexError } from "convex/values";
import type { DataModel, Doc, TableNames } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";

type Ctx = QueryCtx | MutationCtx;

/** Tables carrying the uuid `id` field (all except `files`). */
export type UidTable = Exclude<TableNames, "files">;

export const GLOBAL_READABLE = new Set<UidTable>([
  "exercises",
  "metrics",
  "machine_catalog",
]);

export function fail(message: string): never {
  throw new ConvexError(message);
}

/** The caller's Clerk user id (JWT `sub`). Throws when signed out. */
export async function requireUser(ctx: { auth: Ctx["auth"] }): Promise<string> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity?.subject) fail("Not signed in");
  return identity.subject;
}

export async function byUid<T extends UidTable>(
  ctx: Ctx,
  table: T,
  id: string,
): Promise<Doc<T> | null> {
  return (await ctx.db
    .query(table)
    // biome-ignore lint/suspicious/noExplicitAny: every UidTable has by_uid
    .withIndex("by_uid" as any, (q: any) => q.eq("id", id))
    .unique()) as Doc<T> | null;
}

/** Row owned by `owner` (any deletion state), else null. */
export async function owned<T extends UidTable>(
  ctx: Ctx,
  table: T,
  id: string,
  owner: string,
): Promise<Doc<T> | null> {
  const row = await byUid(ctx, table, id);
  // biome-ignore lint/suspicious/noExplicitAny: ownerId exists on every UidTable
  return row && (row as any).ownerId === owner ? row : null;
}

/** Like `owned` but throws — for parents a new row hangs off. */
export async function ownedOrThrow<T extends UidTable>(
  ctx: Ctx,
  table: T,
  id: string,
  owner: string,
): Promise<Doc<T>> {
  const row = await owned(ctx, table, id, owner);
  if (!row) fail(`${table} ${id} not found`);
  return row;
}

/** Readable for `owner`: own rows, plus global rows on GLOBAL_READABLE. */
export async function readable<T extends UidTable>(
  ctx: Ctx,
  table: T,
  id: string,
  owner: string,
): Promise<Doc<T> | null> {
  const row = await byUid(ctx, table, id);
  if (!row) return null;
  // biome-ignore lint/suspicious/noExplicitAny: ownerId exists on every UidTable
  const rowOwner = (row as any).ownerId as string | null;
  if (rowOwner === owner) return row;
  if (rowOwner === null && GLOBAL_READABLE.has(table)) return row;
  return null;
}

/** All of an owner's rows in a table, oldest first (by createdAt). */
export async function ownerRows<T extends UidTable>(
  ctx: Ctx,
  table: T,
  owner: string | null,
): Promise<Doc<T>[]> {
  return (await ctx.db
    .query(table)
    // biome-ignore lint/suspicious/noExplicitAny: every UidTable has by_owner
    .withIndex("by_owner" as any, (q: any) => q.eq("ownerId", owner))
    .collect()) as Doc<T>[];
}

export const live = <T extends { deletedAt: number | null }>(rows: T[]) =>
  rows.filter((r) => r.deletedAt == null);

/** Strips Convex system fields and internal columns from a row. */
export function out<T extends Record<string, unknown>>(
  doc: T,
): Omit<T, "_id" | "_creationTime" | "nameLower"> {
  const { _id, _creationTime, nameLower, ...rest } = doc as Record<
    string,
    unknown
  >;
  return rest as Omit<T, "_id" | "_creationTime" | "nameLower">;
}

export function outAll<T extends Record<string, unknown>>(docs: T[]) {
  return docs.map(out);
}

/** Copies only the keys present in `patch` (undefined → skipped). */
export function pick<T extends Record<string, unknown>>(patch: T): Partial<T> {
  const r: Record<string, unknown> = {};
  for (const [k, val] of Object.entries(patch)) {
    if (val !== undefined) r[k] = val;
  }
  return r as Partial<T>;
}

/** `[]` → null, like the old repo's `x?.length ? x : null`. */
export const arr = <T>(x: T[] | null | undefined): T[] | null =>
  x?.length ? x : null;

export type { DataModel };
