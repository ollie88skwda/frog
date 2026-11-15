// E2E orchestrator: prepare the LOCAL Convex backend (test signing key,
// functions, global seed), mint a fresh test identity, build apps/web with
// VITE_E2E=1, then run Playwright. Afterwards purge the identity's data.
//
// Target: CONVEX_SELF_HOSTED_URL + CONVEX_SELF_HOSTED_ADMIN_KEY (what
// `convex dev` writes for a local backend), or CONVEX_URL + CONVEX_ADMIN_KEY.
// Refuses non-local backends (scripts/convex-test-env.ts).
import { spawnSync } from "node:child_process";
import { adminClient, adminTarget } from "./convex/admin-client";
import { prepareTestBackend, TEST_KEY_PATH } from "./convex-test-env";
import { purgeE2eUser, purgeStaleE2eUsers } from "./e2e-cleanup";

function sh(cmd: string, env?: Record<string, string>): number {
  const res = spawnSync(cmd, {
    shell: true,
    stdio: "inherit",
    env: { ...process.env, ...env },
  });
  return res.status ?? 1;
}

let auth: Awaited<ReturnType<typeof prepareTestBackend>>;
try {
  auth = await prepareTestBackend({ seed: !process.env.E2E_SKIP_SEED });
} catch (e) {
  console.error(
    `Could not prepare the local Convex backend: ${(e as Error).message}\n` +
      "Is a local backend running? Start one with `bunx convex dev` (local " +
      "deployment) and export its CONVEX_SELF_HOSTED_URL/_ADMIN_KEY, or set " +
      "CONVEX_URL/CONVEX_ADMIN_KEY.",
  );
  process.exit(1);
}

const { url } = adminTarget();
// Local backends serve HTTP actions on the next port.
const siteUrl =
  process.env.CONVEX_SITE_URL ??
  url.replace(/:(\d+)$/, (_, p) => `:${Number(p) + 1}`);
const admin = adminClient();

// Backstop for interrupted runs: sweep stale identities first. Best-effort.
try {
  const { purged } = await purgeStaleE2eUsers(admin);
  if (purged.length)
    console.log(`Swept ${purged.length} stale e2e identities.`);
} catch (e) {
  console.error(`Stale e2e sweep failed (continuing): ${(e as Error).message}`);
}

const sub = `e2e-${Date.now()}`;
const email = `${sub}@frog.test`;
// Long enough for a full local suite; the backend only accepts it while
// TEST_JWKS matches the local key.
const token = await auth.mint(sub, {
  exp: Math.floor(Date.now() / 1000) + 4 * 3600,
});

console.log(`Minted E2E identity ${sub}. Building apps/web (VITE_E2E=1)…`);
const buildStatus = sh("bun run --cwd apps/web build", {
  VITE_E2E: "1",
  VITE_CONVEX_URL: url,
});
if (buildStatus !== 0) {
  await cleanup();
  process.exit(buildStatus);
}

// Repo-local binary — `bun x` can resolve a global playwright that can't see
// workspace deps.
const testStatus = sh(
  `./node_modules/.bin/playwright test -c e2e/playwright.config.ts ${process.argv.slice(2).join(" ")}`,
  {
    E2E_EMAIL: email,
    E2E_TOKEN: token,
    E2E_TEST_KEY: TEST_KEY_PATH,
    E2E_CONVEX_SITE_URL: siteUrl,
  },
);

// Self-clean this run's identity immediately — the primary defense against
// shared-table growth (see e2e-cleanup.ts), pass or fail.
await cleanup();
process.exit(testStatus);

async function cleanup() {
  try {
    await purgeE2eUser(admin, sub);
  } catch (e) {
    console.error(
      `Post-run cleanup failed (non-fatal): ${(e as Error).message}`,
    );
  }
}
