import { e2eBridge } from "./e2e-bridge";

// E2E-only hook (VITE_E2E=1 builds): lets Playwright sign in a minted test
// identity and assert server state as that user, without a sign-in UI.
// Dead-code-eliminated from production builds (enforced by the bundle guard
// in scripts/check-bundle.ts).
if (e2eBridge) {
  (window as unknown as Record<string, unknown>).__frog = {
    signIn: e2eBridge.signIn,
    signOut: e2eBridge.signOut,
    db: e2eBridge.db,
  };
}
