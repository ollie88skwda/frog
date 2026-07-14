import { defineConfig } from "vitest/config";

// Integration tests hit a running local Supabase (`supabase start`).
// Kept out of the default unit run so `bun run test` needs no Docker.
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.itest.ts"],
    testTimeout: 20_000,
    hookTimeout: 30_000,
  },
});
