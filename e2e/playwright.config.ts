import { defineConfig, devices } from "@playwright/test";

// Run via `bun run e2e` (scripts/run-e2e.ts) — it seeds a fresh user against
// local Supabase, builds apps/web with VITE_E2E=1, then invokes Playwright.

// Never reuse a server this run didn't start: a preview left behind by another
// checkout serves a stale build and fails specs against the wrong code. A busy
// port must abort loudly; parallel runs pick distinct ports via E2E_PORT.
const port = Number(process.env.E2E_PORT ?? 4319);

export default defineConfig({
  testDir: ".",
  timeout: 30_000,
  workers: 1,
  // Frog is a mobile web app first (AGENTS.md) — default every spec to a real
  // touch device (viewport + hasTouch + isMobile) so tap-driven bugs (e.g. a
  // blur race that only fires on touchstart) don't hide behind desktop mouse
  // emulation. Individual specs can still override via test.use({ ... }).
  // Pinned to chromium (not iPhone 13's default webkit): CI only installs
  // the chromium binary (.github/workflows/ci.yml), and every spec already
  // assumes chromium's rendering/timing.
  use: {
    ...devices["iPhone 13"],
    defaultBrowserType: "chromium",
    baseURL: `http://localhost:${port}`,
  },
  webServer: {
    command: `bun x vite preview --port ${port} --strictPort`,
    cwd: "../apps/web",
    port,
    reuseExistingServer: false,
  },
});
