import { createClient } from "@supabase/supabase-js";
import { getClerkToken } from "./auth-token";
import { e2eBridge } from "./e2e-bridge";

const url =
  import.meta.env.VITE_SUPABASE_URL || "https://placeholder.supabase.co";
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || "placeholder";

if (
  !import.meta.env.VITE_SUPABASE_URL ||
  !import.meta.env.VITE_SUPABASE_ANON_KEY
) {
  console.warn(
    "Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY — UI will load but data fetching will fail.",
  );
}

// Clerk (not Supabase Auth) is the identity provider: every PostgREST request
// carries a Clerk session token, validated by Supabase third-party auth.
// NOTE: with `accessToken` set, supabase-js disables `supabase.auth.*` on this
// client by design. A null token downgrades the request to anon, which has no
// table grants — fail closed; never grant anon SELECT to paper over that.
export const supabase = createClient(url, anonKey, {
  accessToken: async () =>
    e2eBridge ? await e2eBridge.getToken() : await getClerkToken(),
});
