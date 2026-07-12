// E2E orchestrator: verify local Supabase is up, seed a fresh user, build
// apps/web with VITE_E2E=1 + local env, then run Playwright.
import { execSync, spawnSync } from "node:child_process";

function sh(cmd: string, env?: Record<string, string>) {
  const res = spawnSync(cmd, {
    shell: true,
    stdio: "inherit",
    env: { ...process.env, ...env },
  });
  if (res.status !== 0) process.exit(res.status ?? 1);
}

let seeded: { email: string; password: string; url: string; anonKey: string };
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
sh("bun run --cwd apps/web build", {
  VITE_E2E: "1",
  VITE_SUPABASE_URL: seeded.url,
  VITE_SUPABASE_ANON_KEY: seeded.anonKey,
});

sh("bun x playwright test -c e2e/playwright.config.ts", {
  E2E_EMAIL: seeded.email,
  E2E_PASSWORD: seeded.password,
});
