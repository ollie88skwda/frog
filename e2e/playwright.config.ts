import { defineConfig, devices } from "@playwright/test";
import path from "node:path";

const PORT = Number(process.env.E2E_PORT || 4319);
const ROOT = path.resolve(__dirname, "..");

// Drives the real SBL screens running as a web build (sql.js-backed DB for headless
// determinism). See e2e/README.html for the why/how. Run with `npm run e2e`, which
// first exports the E2E web bundle into dist-e2e/.
export default defineConfig({
  testDir: ".",
  testMatch: ["web.spec.ts"],
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "node e2e/web/serve.cjs",
    cwd: ROOT,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
    env: { E2E_PORT: String(PORT) },
  },
});
