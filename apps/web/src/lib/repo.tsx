import type { Repo } from "@frog/core";
import { ConvexRepo } from "@frog/core/repo/convex";
import { createContext, type ReactNode, useContext, useMemo } from "react";
import { convex } from "./convex";

// Screens depend on the Repo interface only — never on the backend client
// directly. This is the seam where a local/offline store slots in later.
const RepoContext = createContext<Repo | null>(null);

export function RepoProvider({ children }: { children: ReactNode }) {
  // The owner is the token's `sub`, enforced server-side in /convex — the
  // repo never sends an owner id.
  const repo = useMemo(() => new ConvexRepo(convex), []);
  return <RepoContext.Provider value={repo}>{children}</RepoContext.Provider>;
}

export function useRepo(): Repo {
  const repo = useContext(RepoContext);
  if (!repo) throw new Error("useRepo must be used inside <RepoProvider>");
  return repo;
}
