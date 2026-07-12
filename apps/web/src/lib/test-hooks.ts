import { supabase } from "./supabase";

// E2E-only hook (VITE_E2E=1 builds): lets Playwright sign in a seeded password
// user and assert server state as that user, without a password UI existing.
// Dead-code-eliminated from production builds.
if (import.meta.env.VITE_E2E === "1") {
  (window as unknown as Record<string, unknown>).__sbl = { supabase };
}
