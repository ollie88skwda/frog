// E2E hygiene: hard-deletes throwaway e2e identities' data on a LOCAL Convex
// backend via internal admin functions (convex/admin.ts purgeTestUser).
//
// Why this exists (see AGENTS.md "E2E hygiene"): every e2e run signs in a
// fresh identity, and `createExercise()` goes through the app's normal create
// path — which (COMMUNITY_SHARING=true, packages/core/src/config.ts)
// publishes most custom exercises as GLOBAL ownerId-null rows. Nothing would
// ever clean those up, so the shared exercises table would grow run over run.
//
// This is a hard delete, not the app's soft-delete convention: test infra
// tearing down its own throwaway identities. purgeTestUser refuses any
// identity that isn't an `e2e-…` test sub, so it can never touch a real
// Clerk user (`user_…`).
import { adminClient } from "./convex/admin-client";

type Admin = ReturnType<typeof adminClient>;

/** Deletes every row (and stored file) one test identity owns or published. */
export async function purgeE2eUser(admin: Admin, sub: string) {
  for (;;) {
    const n = await admin.mutation<number>("admin:purgeTestUser", { sub });
    if (n === 0) return;
  }
}

/** Sweeps every e2e identity whose newest row is older than `olderThanMs`.
 * Age-gated rather than "everyone but me": two lanes can run e2e against the
 * same local backend at once, and an identity mid-run is not stale. Default
 * (2h) comfortably outlives a full local suite run. */
export async function purgeStaleE2eUsers(
  admin: Admin,
  olderThanMs = 2 * 60 * 60 * 1000,
): Promise<{ checked: number; purged: string[] }> {
  const cutoff = Date.now() - olderThanMs;
  const owners = await admin.mutation<Record<string, number>>(
    "admin:testOwners",
    {},
  );
  const purged: string[] = [];
  for (const [sub, newest] of Object.entries(owners)) {
    if (newest >= cutoff) continue;
    await purgeE2eUser(admin, sub);
    purged.push(sub);
  }
  return { checked: Object.keys(owners).length, purged };
}

// CLI — `bun scripts/e2e-cleanup.ts [maxAgeMinutes]` sweeps stale e2e
// identities on the local backend named by CONVEX_SELF_HOSTED_URL/_ADMIN_KEY
// (or CONVEX_URL/CONVEX_ADMIN_KEY).
if (import.meta.main) {
  const admin = adminClient();
  const host = new URL(admin.client.url).hostname;
  if (host !== "127.0.0.1" && host !== "localhost") {
    throw new Error(`E2E_CLEANUP_NOT_LOCAL: refusing to sweep ${host}`);
  }
  const maxAgeMinutes = Number(process.argv[2] ?? 120);
  const { checked, purged } = await purgeStaleE2eUsers(
    admin,
    maxAgeMinutes * 60 * 1000,
  );
  console.log(
    `Checked ${checked} e2e identit(ies), purged ${purged.length}: ${purged.join(", ")}`,
  );
}
