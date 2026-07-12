import type { Repo } from "@sbl/core";
import { SupabaseRepo } from "@sbl/core/repo/supabase";
import { createContext, type ReactNode, useContext, useMemo } from "react";
import { supabase } from "./supabase";

// Screens depend on the Repo interface only — never on supabase-js directly.
// This is the seam where a local/offline store slots in later.
const RepoContext = createContext<Repo | null>(null);

export function RepoProvider({ children }: { children: ReactNode }) {
  const repo = useMemo(() => new SupabaseRepo(supabase), []);
  return <RepoContext.Provider value={repo}>{children}</RepoContext.Provider>;
}

export function useRepo(): Repo {
  const repo = useContext(RepoContext);
  if (!repo) throw new Error("useRepo must be used inside <RepoProvider>");
  return repo;
}
