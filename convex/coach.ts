// coach_events: append-only log of what the user did with a coach suggestion
// (redesign §9.3, F4). Suggestions are recomputed client-side, never stored.
// Writes are idempotent on the client id (insertRow upserts on id), so a
// retried optimistic write never duplicates a row (AGENTS.md optimistic rule).
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { fail, live, out, owned, requireUser } from "./lib";
import { insertRow } from "./rows";

const state = v.union(
  v.literal("accepted"),
  v.literal("adjusted"),
  v.literal("dismissed"),
  v.literal("applied"),
  v.literal("undone"),
);
const scope = v.union(
  v.literal("once"),
  v.literal("exercise_4w"),
  v.literal("rule"),
);

/** Key-order-independent JSON, so a stored payload compares to a retried one. */
function canonical(value: unknown): string {
  return JSON.stringify(value, (_key, v) =>
    v && typeof v === "object" && !Array.isArray(v)
      ? Object.fromEntries(
          Object.keys(v)
            .sort()
            .map((k) => [k, (v as Record<string, unknown>)[k]]),
        )
      : v,
  );
}

export const record = mutation({
  args: {
    id: v.string(),
    suggestionId: v.string(),
    ruleId: v.string(),
    exerciseId: v.union(v.string(), v.null()),
    sessionId: v.union(v.string(), v.null()),
    state,
    scope: v.union(scope, v.null()),
    payload: v.any(),
  },
  handler: async (ctx, args) => {
    const me = await requireUser(ctx);
    if (!args.suggestionId || !args.ruleId) {
      fail("coach_events: suggestionId and ruleId are required");
    }
    // Append-only: a retry of the same id with the SAME content is fine (the
    // upsert is a no-op rewrite); an existing id may not change any field.
    const prior = await owned(ctx, "coach_events", args.id, me);
    const payload = args.payload ?? null;
    if (
      prior &&
      (prior.ruleId !== args.ruleId ||
        prior.state !== args.state ||
        prior.suggestionId !== args.suggestionId ||
        prior.exerciseId !== args.exerciseId ||
        prior.sessionId !== args.sessionId ||
        prior.scope !== args.scope ||
        canonical(prior.payload ?? null) !== canonical(payload))
    ) {
      fail("coach_events is append-only: id already used by a different event");
    }
    return out(await insertRow(ctx, "coach_events", me, { ...args, payload }));
  },
});

/** Newest-first events, optionally one rule's. Feeds per-rule/per-exercise
 * suppression (dismiss scopes) and beta-rule instrumentation. */
export const list = query({
  args: {
    ruleId: v.optional(v.string()),
    since: v.optional(v.number()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, { ruleId, since, limit }) => {
    const me = await requireUser(ctx);
    const cap = Math.min(limit ?? 500, 1000);
    const q =
      ruleId !== undefined
        ? ctx.db
            .query("coach_events")
            .withIndex("by_owner_rule", (x) =>
              x.eq("ownerId", me).eq("ruleId", ruleId),
            )
        : ctx.db
            .query("coach_events")
            .withIndex("by_owner", (x) => x.eq("ownerId", me));
    const rows = [];
    for await (const r of q.order("desc")) {
      if (since !== undefined && r.createdAt < since) break;
      rows.push(r);
      if (rows.length >= cap) break;
    }
    return live(rows).map(out);
  },
});
