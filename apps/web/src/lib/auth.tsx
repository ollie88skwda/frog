import {
  ClerkProvider,
  useClerk,
  useAuth as useClerkAuth,
  useUser,
} from "@clerk/react";
import { useQueryClient } from "@tanstack/react-query";
import {
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { Navigate, Outlet, useLocation } from "react-router";
import { bindClerkSession } from "./auth-token";
import { e2eBridge } from "./e2e-bridge";
import { resetUserScopedState } from "./user-scoped-state";

// Clerk is the identity provider (Google + email, prebuilt UI). In E2E builds
// (VITE_E2E=1) Clerk is never mounted; auth state comes from the Playwright
// bridge instead — see e2e-bridge.ts. The e2eBridge constant is fixed at
// build time, so each export below picks one implementation statically.

const publishableKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY as
  | string
  | undefined;

export type UserInfo = { name: string; email: string };

/** Clears per-user residue on sign-out so the next user on a shared device
 * can't see the previous user's data. Legacy `sb-*-auth-token` entries are
 * refresh tokens from the pre-Clerk placeholder auth.
 *
 * `sbl.pastUsers` keeps its pre-rebrand name on purpose: nothing writes it any
 * more, so this is the only code that will ever see it. Renaming it to `frog.`
 * would mean the stale entry on a real device is never cleaned up. */
function clearLocalAuthArtifacts() {
  const stale: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && (/^sb-.*-auth-token/.test(key) || key === "sbl.pastUsers")) {
      stale.push(key);
    }
  }
  for (const key of stale) localStorage.removeItem(key);
}

// --- Clerk implementations --------------------------------------------------

/** Clears the query cache — and the module stores holding per-user state
 * beside it — whenever the signed-in user changes, including sign-outs we
 * didn't initiate (other tab, dashboard revocation, expiry). Query keys aren't
 * user-scoped, so without this the next user on the device would see the
 * previous user's cached rows flash in. */
function useClearCacheOnUserChange(userId: string | null) {
  const queryClient = useQueryClient();
  const prev = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    if (prev.current !== undefined && prev.current !== userId) {
      queryClient.clear();
      resetUserScopedState();
    }
    prev.current = userId;
  }, [userId, queryClient]);
}

/** Binds the live Clerk session to non-React modules (supabase accessToken,
 * repo owner-id) as soon as Clerk mounts. */
function ClerkSessionBinder({ children }: { children: ReactNode }) {
  const { getToken, userId } = useClerkAuth();
  useClearCacheOnUserChange(userId ?? null);
  useEffect(() => {
    bindClerkSession(
      async () => await getToken(),
      () => userId ?? null,
    );
  }, [getToken, userId]);
  return children;
}

function ClerkAuthProvider({ children }: { children: ReactNode }) {
  if (!publishableKey) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-bg px-4">
        <p className="max-w-sm text-center text-sm text-soft">
          Auth is not configured. Set{" "}
          <code className="text-ink">VITE_CLERK_PUBLISHABLE_KEY</code> in{" "}
          <code className="text-ink">apps/web/.env.local</code> and restart the
          dev server.
        </p>
      </div>
    );
  }
  return (
    // allowedRedirectOrigins: Clerk honors a user-supplied ?redirect_url=
    // query param after sign-in; restricting it to our own origin closes the
    // open-redirect (phishing) hole.
    <ClerkProvider
      publishableKey={publishableKey}
      afterSignOutUrl="/auth"
      allowedRedirectOrigins={[window.location.origin]}
    >
      <ClerkSessionBinder>{children}</ClerkSessionBinder>
    </ClerkProvider>
  );
}

function ClerkRequireAuth() {
  const { isLoaded, isSignedIn } = useClerkAuth();
  const location = useLocation();
  if (!isLoaded) return null;
  if (!isSignedIn)
    return <Navigate to="/auth" replace state={{ from: location }} />;
  return <Outlet />;
}

function useClerkSignedIn(): boolean {
  const { isLoaded, isSignedIn } = useClerkAuth();
  return isLoaded && isSignedIn === true;
}

function useClerkUserInfo(): UserInfo {
  const { user } = useUser();
  const email = user?.primaryEmailAddress?.emailAddress ?? "";
  return {
    name: user?.fullName || user?.username || email.split("@")[0] || "You",
    email,
  };
}

function useClerkSignOut(): () => Promise<void> {
  const clerk = useClerk();
  const queryClient = useQueryClient();
  return useCallback(async () => {
    // Sign out FIRST: clearing the cache while the token is still valid lets
    // mounted screens refetch and repopulate it mid-sign-out. Once the
    // session is gone, stray refetches fail closed (null token → anon).
    await clerk.signOut();
    clearLocalAuthArtifacts();
    queryClient.clear();
    resetUserScopedState();
  }, [clerk, queryClient]);
}

// --- E2E implementations (dead code in real builds) ---------------------------

function useE2eSession() {
  const [state, setState] = useState<{
    loading: boolean;
    signedIn: boolean;
    email: string;
    userId: string | null;
  }>({ loading: true, signedIn: false, email: "", userId: null });
  useEffect(() => {
    if (!e2eBridge) return;
    let active = true;
    const apply = (s: { user: { email?: string; id: string } } | null) => {
      if (active)
        setState({
          loading: false,
          signedIn: s !== null,
          email: s?.user.email ?? "",
          userId: s?.user.id ?? null,
        });
    };
    void e2eBridge.getSession().then(apply);
    const unsubscribe = e2eBridge.onAuthChange(apply);
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);
  return state;
}

function E2eAuthProvider({ children }: { children: ReactNode }) {
  const { userId } = useE2eSession();
  useClearCacheOnUserChange(userId);
  return children;
}

function E2eRequireAuth() {
  const { loading, signedIn } = useE2eSession();
  const location = useLocation();
  if (loading) return null;
  if (!signedIn)
    return <Navigate to="/auth" replace state={{ from: location }} />;
  return <Outlet />;
}

function useE2eSignedIn(): boolean {
  const { loading, signedIn } = useE2eSession();
  return !loading && signedIn;
}

function useE2eUserInfo(): UserInfo {
  const { email } = useE2eSession();
  return { name: email.split("@")[0] || "You", email };
}

function useE2eSignOut(): () => Promise<void> {
  const queryClient = useQueryClient();
  return useCallback(async () => {
    await e2eBridge?.signOut();
    queryClient.clear();
    resetUserScopedState();
  }, [queryClient]);
}

// --- Public surface -----------------------------------------------------------

export const AuthProvider = e2eBridge ? E2eAuthProvider : ClerkAuthProvider;

/** Route guard: children render only when signed in. */
export const RequireAuth = e2eBridge ? E2eRequireAuth : ClerkRequireAuth;

/** True once auth has loaded AND the user is signed in. */
export const useSignedIn = e2eBridge ? useE2eSignedIn : useClerkSignedIn;

/** Display name + email of the signed-in user. */
export const useUserInfo = e2eBridge ? useE2eUserInfo : useClerkUserInfo;

/** Signs out and clears per-user client state (query cache, legacy tokens). */
export const useSignOut = e2eBridge ? useE2eSignOut : useClerkSignOut;
