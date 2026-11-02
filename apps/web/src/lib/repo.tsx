import type { Repo } from "@frog/core";
import { ConvexRepo } from "@frog/core/repo/convex";
import { createContext, type ReactNode, useContext } from "react";
import { convex } from "./convex";
import { registerUserScopedReset } from "./user-scoped-state";

// Screens depend on the Repo interface only — never on the backend client
// directly. This is the seam where a local/offline store slots in later.
const RepoContext = createContext<Repo | null>(null);

// The ConvexRepo caches local object URLs for private file bytes. Clear them
// with the query cache on sign-out / user change so another account on the
// device cannot reuse a previous owner's in-memory photo URL.
const repo = new ConvexRepo(convex);
registerUserScopedReset(() => repo.clearFileUrls());

export function RepoProvider({ children }: { children: ReactNode }) {
  // The owner is the token's `sub`, enforced server-side in /convex — the
  // repo never sends an owner id.
  return <RepoContext.Provider value={repo}>{children}</RepoContext.Provider>;
}

export function useRepo(): Repo {
  const repo = useContext(RepoContext);
  if (!repo) throw new Error("useRepo must be used inside <RepoProvider>");
  return repo;
}
