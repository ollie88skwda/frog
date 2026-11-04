import { defineConfig, devices } from "@playwright/test";

// Real-Clerk lane (see clerk-real.spec.ts): no webServer — point
// CLERK_REAL_URL at a `vite preview` of a non-E2E build.
export default defineConfig({
  testDir: ".",
  testMatch: /clerk-real\.spec\.ts/,
  timeout: 180_000,
  workers: 1,
  use: {
    ...devices["iPhone 13"],
    defaultBrowserType: "chromium",
    baseURL: process.env.CLERK_REAL_URL ?? "http://localhost:4400",
  },
});
