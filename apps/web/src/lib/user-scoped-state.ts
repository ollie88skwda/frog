// Per-user state that lives in module stores rather than the query cache:
// `queryClient.clear()` on sign-out / user change (see auth.tsx) doesn't reach
// it, so the next user on a shared device would inherit it. Stores register
// their own reset here instead of auth.tsx importing each one, which keeps a
// store that is only reachable from a lazy route out of the eager bundle — and
// a store nobody imported holds nothing to reset.
const resets = new Set<() => void>();

export function registerUserScopedReset(reset: () => void) {
  resets.add(reset);
}

export function resetUserScopedState() {
  for (const reset of resets) reset();
}
