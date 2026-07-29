import type { Repo } from "@frog/core";
import { SupabaseRepo } from "@frog/core/repo/supabase";
import { createContext, type ReactNode, useContext, useMemo } from "react";
import { getClerkUserId } from "./auth-token";
import { e2eBridge } from "./e2e-bridge";
import { supabase } from "./supabase";

// Screens depend on the Repo interface only — never on supabase-js directly.
// This is the seam where a local/offline store slots in later.
const RepoContext = createContext<Repo | null>(null);

// The app client's `accessToken` option disables supabase.auth, so the repo
// can't derive the owner id itself — inject it from the identity provider.
const getOwnerId = e2eBridge ? e2eBridge.getUserId : getClerkUserId;

export function RepoProvider({ children }: { children: ReactNode }) {
  const repo = useMemo(() => new SupabaseRepo(supabase, { getOwnerId }), []);
  return <RepoContext.Provider value={repo}>{children}</RepoContext.Provider>;
}

export function useRepo(): Repo {
  const repo = useContext(RepoContext);
  if (!repo) throw new Error("useRepo must be used inside <RepoProvider>");
  return repo;
}
