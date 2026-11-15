import { convexHttpTransport } from "@frog/core/repo/convex-http";
import { getClerkToken } from "./auth-token";
import { e2eBridge } from "./e2e-bridge";

const url = import.meta.env.VITE_CONVEX_URL as string | undefined;

if (!url) {
  console.warn(
    "Missing VITE_CONVEX_URL — UI will load but data fetching will fail.",
  );
}

// Clerk is the identity provider: every Convex call carries the Clerk session
// token minted from the `convex` JWT template, validated by
// convex/auth.config.ts. A null token reaches the backend unauthenticated,
// and every function rejects it (convex/lib.ts requireUser) — fail closed.
export const convex = convexHttpTransport({
  url: url || "https://placeholder.convex.cloud",
  getToken: async () =>
    e2eBridge ? e2eBridge.getToken() : await getClerkToken(),
});
