import { e2eBridge } from "./e2e-bridge";

// E2E-only hook (VITE_E2E=1 builds): lets Playwright sign in the seeded
// password user and assert server state as that user, without a password UI
// existing. Dead-code-eliminated from production builds (enforced by the
// bundle guard in scripts/check-bundle.ts).
if (e2eBridge) {
  (window as unknown as Record<string, unknown>).__sbl = {
    supabase: e2eBridge.client,
  };
}
