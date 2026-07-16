// Bridges Clerk's session (React context) to non-React modules: the supabase
// client's `accessToken` callback and the repo's owner-id getter. Bound by
// <AuthProvider> once Clerk mounts; unbound (null token) before that, which
// fails closed — anon has no table grants, so early requests are denied, and
// no data query mounts outside <RequireAuth> anyway.

type TokenGetter = () => Promise<string | null>;

let getToken: TokenGetter | null = null;
let getUserId: (() => string | null) | null = null;

export function bindClerkSession(
  tokenGetter: TokenGetter,
  userIdGetter: () => string | null,
): void {
  getToken = tokenGetter;
  getUserId = userIdGetter;
}

export async function getClerkToken(): Promise<string | null> {
  return getToken ? await getToken() : null;
}

export async function getClerkUserId(): Promise<string> {
  const id = getUserId?.();
  if (!id) throw new Error("Not signed in");
  return id;
}
