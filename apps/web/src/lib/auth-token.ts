// Bridges Clerk's session (React context) to non-React modules: the Convex
// transport's token callback. Bound by <AuthProvider> once Clerk mounts;
// unbound (null token) before that, which fails closed — every Convex
// function rejects an unauthenticated call, and no data query mounts outside
// <RequireAuth> anyway.

type TokenGetter = () => Promise<string | null>;

let getToken: TokenGetter | null = null;

export function bindClerkSession(tokenGetter: TokenGetter): void {
  getToken = tokenGetter;
}

export async function getClerkToken(): Promise<string | null> {
  return getToken ? await getToken() : null;
}
