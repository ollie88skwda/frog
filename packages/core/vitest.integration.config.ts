import { defineConfig } from "vitest/config";

// Integration tests hit a running LOCAL Convex backend prepared by
// `bun scripts/convex-test-env.ts` (TEST_JWKS + functions + seed). Kept out
// of the default unit run so `bun run test` needs no backend.
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.itest.ts"],
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
