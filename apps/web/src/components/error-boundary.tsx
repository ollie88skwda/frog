import { Component, type ErrorInfo, type ReactNode } from "react";

// The app's only error boundary, and the floor under every screen: React 19
// unmounts the whole tree on an uncaught render error, so without this the
// user gets a blank white page with nothing to tap.
//
// The case that motivated it is a stale lazy chunk. Every route is a
// `lazy(() => import(...))` and vercel.json deliberately keeps `/assets/` out
// of the SPA rewrite, so a hashed chunk from a superseded deploy is a real
// 404 — a tab or installed PWA left open across a release then fails to open
// any new screen. app.tsx retries and reloads first; this is what the user
// sees when that didn't fix it. docs/DECISIONS.md 2026-08-25.
//
// The reload control is a hand-rolled <button>, not ui/button.tsx, and that is
// deliberate rather than an oversight of AGENTS.md's library-components rule:
// this card is the floor under a broken app, so it must not depend on code
// that may itself be unloadable, and it is eager by construction. It still
// carries a visible resting background, so the no-bare-text-buttons rule
// holds.
const STALE_CHUNK =
  /dynamically imported module|importing a module script failed/i;

type Props = { children: ReactNode };
type State = { error: Error | null };

export class AppErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error("Frog crashed:", error, info.componentStack);
  }

  render(): ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;

    // A stale chunk is a known, self-healing state and says so; anything else
    // is an unknown crash and must not claim to be an update.
    const stale = STALE_CHUNK.test(error.message);
    return (
      <div
        role="alert"
        data-testid="app-error-card"
        className="mx-auto flex min-h-dvh max-w-sm flex-col items-center justify-center gap-3 px-6 text-center"
      >
        <p className="text-sm font-semibold tracking-tight">
          {stale ? "Frog updated — reload" : "Something went wrong"}
        </p>
        <p className="text-xs text-faint">
          {stale
            ? "This tab is still running an older version. Reloading picks up the new one."
            : "The frog dropped it. Reloading usually sorts it out."}
        </p>
        <button
          type="button"
          data-testid="app-error-reload"
          onClick={() => window.location.reload()}
          className="rounded-sm bg-surface-2 px-4 py-2 text-sm transition-colors duration-100 hover:bg-surface-hover"
        >
          Reload
        </button>
      </div>
    );
  }
}
