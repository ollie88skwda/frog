import {
  createClient,
  type Session,
  type SupabaseClient,
} from "@supabase/supabase-js";

// Playwright-only auth bridge (VITE_E2E=1 builds). Clerk is never mounted in
// E2E builds; instead a second supabase-js client (auth enabled, unlike the
// app client whose `accessToken` option disables its auth namespace) signs in
// the seeded password user, and the app sources its PostgREST token + owner id
// from here. RLS compares the JWT `sub` as text, so both Clerk tokens and
// these Supabase-native sessions pass the same policies.
//
// `e2eBridge` is `undefined` in real builds — every `e2eBridge ? … : …` branch
// is compile-time dead code there; scripts/check-bundle.ts asserts the bridge
// marker never reaches a production bundle.

type E2eBridge = {
  client: SupabaseClient;
  getToken: () => Promise<string | null>;
  getUserId: () => Promise<string>;
  getSession: () => Promise<Session | null>;
  onAuthChange: (cb: (session: Session | null) => void) => () => void;
  signOut: () => Promise<void>;
};

function createBridge(): E2eBridge {
  const client = createClient(
    import.meta.env.VITE_SUPABASE_URL as string,
    import.meta.env.VITE_SUPABASE_ANON_KEY as string,
    { auth: { storageKey: "sbl-e2e-auth" } },
  );
  const session = async () => (await client.auth.getSession()).data.session;
  return {
    client,
    getToken: async () => (await session())?.access_token ?? null,
    getUserId: async () => {
      const id = (await session())?.user.id;
      if (!id) throw new Error("E2E bridge: not signed in");
      return id;
    },
    getSession: session,
    onAuthChange: (cb) => {
      const { data } = client.auth.onAuthStateChange((_event, s) => cb(s));
      return () => data.subscription.unsubscribe();
    },
    signOut: async () => {
      await client.auth.signOut();
    },
  };
}

export const e2eBridge: E2eBridge | undefined =
  import.meta.env.VITE_E2E === "1" ? createBridge() : undefined;
