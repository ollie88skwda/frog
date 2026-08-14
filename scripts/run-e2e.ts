// E2E orchestrator: verify local Supabase is up, seed a fresh user, build
// apps/web with VITE_E2E=1 + local env, then run Playwright.
import { execSync, spawnSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";
import { purgeE2eUser } from "./e2e-cleanup";

function sh(cmd: string, env?: Record<string, string>): number {
  const res = spawnSync(cmd, {
    shell: true,
    stdio: "inherit",
    env: { ...process.env, ...env },
  });
  return res.status ?? 1;
}

let seeded: {
  id: string;
  email: string;
  password: string;
  url: string;
  anonKey: string;
};
try {
  const out = execSync("bun scripts/seed-e2e.ts", { encoding: "utf8" });
  seeded = JSON.parse(out.trim().split("\n").at(-1) ?? "");
} catch {
  console.error(
    "Could not seed an E2E user — is local Supabase running? Try `supabase start`.",
  );
  process.exit(1);
}

console.log(`Seeded E2E user ${seeded.email}. Building apps/web (VITE_E2E=1)…`);
const buildStatus = sh("bun run --cwd apps/web build", {
  VITE_E2E: "1",
  VITE_SUPABASE_URL: seeded.url,
  VITE_SUPABASE_ANON_KEY: seeded.anonKey,
});
if (buildStatus !== 0) {
  await cleanupSeededUser();
  process.exit(buildStatus);
}

// Repo-local binary — `bun x` can resolve a global playwright that can't see
// workspace deps.
const testStatus = sh(
  "./node_modules/.bin/playwright test -c e2e/playwright.config.ts",
  {
    E2E_EMAIL: seeded.email,
    E2E_PASSWORD: seeded.password,
    E2E_SUPABASE_URL: seeded.url,
  },
);

// Self-clean this run's own account immediately — the primary defense
// against exercises-table growth (see e2e-cleanup.ts): every run's data is
// gone before the process exits, pass or fail, rather than waiting for a
// future run's stale-account sweep to catch it. Runs after the suite
// regardless of outcome so a failing run doesn't leave debris behind either.
await cleanupSeededUser();
process.exit(testStatus);

async function cleanupSeededUser() {
  try {
    // Purging needs the service role (bypasses RLS) — re-derive it the same
    // way seed-e2e.ts does, via `supabase status`; the anon key this script
    // already has can't delete other users' rows.
    const raw = execSync("supabase status -o json", { encoding: "utf8" });
    const status = JSON.parse(raw.slice(raw.indexOf("{")));
    const serviceKey: string =
      status.SERVICE_ROLE_KEY ?? status.service_role_key;
    const serviceAdmin = createClient(seeded.url, serviceKey, {
      auth: { persistSession: false },
    });
    await purgeE2eUser(serviceAdmin, seeded.id);
  } catch (e) {
    console.error(
      `Post-run cleanup failed (non-fatal): ${(e as Error).message}`,
    );
  }
}
