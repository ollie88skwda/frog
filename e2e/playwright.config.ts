import { defineConfig } from "@playwright/test";

// Run via `bun run e2e` (scripts/run-e2e.ts) — it seeds a fresh user against
// local Supabase, builds apps/web with VITE_E2E=1, then invokes Playwright.
export default defineConfig({
  testDir: ".",
  timeout: 30_000,
  workers: 1,
  use: {
    baseURL: "http://localhost:4319",
  },
  webServer: {
    command: "bun x vite preview --port 4319 --strictPort",
    cwd: "../apps/web",
    port: 4319,
    reuseExistingServer: true,
  },
});
