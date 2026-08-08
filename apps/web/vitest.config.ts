import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Deliberately standalone (not merged with vite.config.ts): apps/web unit
// tests cover framework-free logic only — anything that needs a browser is an
// e2e spec, per the repo's existing split.
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: { environment: "node", include: ["src/**/*.test.ts"] },
});
