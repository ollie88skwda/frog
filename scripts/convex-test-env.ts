// Prepares a LOCAL Convex backend for integration/e2e tests:
//  1. loads (or creates) the throwaway test signing key at FROG_TEST_KEY
//     (default .convex-test/key.json, gitignored, 0600);
//  2. sets TEST_JWKS on the deployment so convex/auth.config.ts accepts
//     tokens signed with it;
//  3. pushes the functions (`convex dev --once`) and seeds the global rows.
//
//   bun scripts/convex-test-env.ts
//
// Target: CONVEX_SELF_HOSTED_URL + CONVEX_SELF_HOSTED_ADMIN_KEY (or an
// --env-file passed through CONVEX_ENV_FILE). Refuses anything that isn't
// a 127.0.0.1/localhost URL — TEST_JWKS must never reach a shared
// deployment, since anyone holding the key could mint identities there.
import { spawnSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { adminTarget } from "./convex/admin-client";
import { loadOrCreateTestAuth } from "./convex-test-auth";

const ROOT = join(import.meta.dir, "..");
export const TEST_KEY_PATH =
  process.env.FROG_TEST_KEY ?? join(ROOT, ".convex-test/key.json");

function convex(args: string[]) {
  const envFile = process.env.CONVEX_ENV_FILE;
  const res = spawnSync(
    "node",
    [
      join(ROOT, "node_modules/convex/bin/main.js"),
      ...args,
      ...(envFile ? ["--env-file", envFile] : []),
    ],
    { cwd: ROOT, stdio: ["ignore", "inherit", "inherit"], env: process.env },
  );
  if (res.status !== 0) {
    throw new Error(
      `CONVEX_CLI_FAILED: convex ${args[0]} exited ${res.status}. Next: run ` +
        `\`node node_modules/convex/bin/main.js ${args[0]}\` against the same ` +
        "target and read its output.",
    );
  }
}

export async function prepareTestBackend(opts: { seed?: boolean } = {}) {
  const { url } = adminTarget();
  const host = new URL(url).hostname;
  if (host !== "127.0.0.1" && host !== "localhost") {
    throw new Error(
      `TEST_BACKEND_NOT_LOCAL: refusing to set TEST_JWKS on ${host}. Test ` +
        "identities may only be enabled on a local backend.",
    );
  }
  mkdirSync(dirname(TEST_KEY_PATH), { recursive: true });
  const auth = await loadOrCreateTestAuth(TEST_KEY_PATH);
  convex(["env", "set", "TEST_JWKS", auth.jwks]);
  if (!process.env.SKIP_CONVEX_ENV_CLERK) {
    convex([
      "env",
      "set",
      "CLERK_JWT_ISSUER_DOMAIN",
      process.env.CLERK_JWT_ISSUER_DOMAIN ??
        "https://top-parakeet-48.clerk.accounts.dev",
    ]);
  }
  convex(["dev", "--once", "--tail-logs", "disable"]);
  if (opts.seed !== false) {
    const res = spawnSync("bun", [join(ROOT, "scripts/seed-convex.ts")], {
      cwd: ROOT,
      stdio: ["ignore", "inherit", "inherit"],
      env: process.env,
    });
    if (res.status !== 0) throw new Error("SEED_FAILED: seed-convex.ts");
  }
  return auth;
}

if (import.meta.main) {
  await prepareTestBackend();
  console.log(`test backend ready; key at ${TEST_KEY_PATH}`);
}
