// Admin-authenticated Convex client for scripts (seed, import, e2e setup).
// Resolves the deployment from env, never from committed files:
//   CONVEX_URL + CONVEX_ADMIN_KEY            explicit (CI, self-hosted local)
//   CONVEX_SELF_HOSTED_URL + _ADMIN_KEY      what `convex dev` writes for a
//                                            self-hosted/local backend
//   CONVEX_DEPLOY_KEY + CONVEX_URL           a cloud deployment's deploy key
// The key is held in memory only and never printed.
import { ConvexHttpClient } from "convex/browser";
import type { FunctionReference } from "convex/server";

export type AdminTarget = { url: string; adminKey: string };

export function adminTarget(env = process.env): AdminTarget {
  const url =
    env.CONVEX_URL ?? env.CONVEX_SELF_HOSTED_URL ?? env.VITE_CONVEX_URL;
  const adminKey =
    env.CONVEX_ADMIN_KEY ??
    env.CONVEX_SELF_HOSTED_ADMIN_KEY ??
    env.CONVEX_DEPLOY_KEY;
  if (!url || !adminKey) {
    throw new Error(
      "CONVEX_TARGET_MISSING: set CONVEX_URL and CONVEX_ADMIN_KEY (or " +
        "CONVEX_SELF_HOSTED_URL/CONVEX_SELF_HOSTED_ADMIN_KEY, or " +
        "CONVEX_DEPLOY_KEY + CONVEX_URL) for the target deployment.",
    );
  }
  return { url, adminKey };
}

/** Client that can call internal functions (admin auth). */
export function adminClient(target = adminTarget()) {
  const client = new ConvexHttpClient(target.url);
  (client as unknown as { setAdminAuth(key: string): void }).setAdminAuth(
    target.adminKey,
  );
  return {
    client,
    /** Calls an internal or public mutation by "module:name". */
    mutation<T>(name: string, args: Record<string, unknown>): Promise<T> {
      return client.mutation(
        name as unknown as FunctionReference<"mutation">,
        args,
      ) as Promise<T>;
    },
    query<T>(name: string, args: Record<string, unknown>): Promise<T> {
      return client.query(
        name as unknown as FunctionReference<"query">,
        args,
      ) as Promise<T>;
    },
  };
}
