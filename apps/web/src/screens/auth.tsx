import { SignIn } from "@clerk/react";
import { APP_NAME } from "@sbl/core";
import { Navigate } from "react-router";
import { FrogMark } from "@/components/frog-mark";
import { useSignedIn } from "@/lib/auth";
import { e2eBridge } from "@/lib/e2e-bridge";
import { useVoice } from "@/lib/voice";

// Clerk's prebuilt sign-in UI (Google + email — methods are configured in the
// Clerk dashboard). Hash routing keeps Clerk's multi-step flow off
// react-router. Redirect targets stay relative — never user-supplied.

function ClerkAuthScreen() {
  const signedIn = useSignedIn();
  const { t } = useVoice();
  if (signedIn) return <Navigate to="/" replace />;

  return (
    <div className="flex min-h-dvh items-center justify-center bg-bg px-4 py-8">
      <div className="flex w-full max-w-sm flex-col items-center gap-6">
        <div className="flex flex-col items-center gap-3">
          {/* Frog mark — quiet chrome, never the expressive mascot. */}
          <FrogMark className="size-8 text-ink" />
          <div className="flex flex-col items-center gap-1">
            <h1 className="text-lg font-semibold tracking-tight">
              Sign in to {APP_NAME}
            </h1>
            <p className="text-center text-sm text-soft">
              {t(
                "A training lab notebook.",
                "A training lab notebook that a frog wandered into and now runs.",
              )}
            </p>
          </div>
        </div>
        <SignIn
          routing="hash"
          fallbackRedirectUrl="/"
          appearance={{
            variables: {
              // grass-9 — Clerk derives its shade scale from a literal
              // color, so the var(--accent) bridge token can't be used here.
              colorPrimary: "#46a758",
              borderRadius: "0px",
            },
            // Clerk's card renders its own "Sign in to <Clerk app name>"
            // heading, which duplicates ours and shows the Clerk-side app
            // name rather than APP_NAME. Ours is the source of truth.
            elements: { header: { display: "none" } },
          }}
        />
      </div>
    </div>
  );
}

// E2E builds never render a sign-in UI — Playwright signs in via the bridge.
function E2eAuthScreen() {
  const signedIn = useSignedIn();
  if (signedIn) return <Navigate to="/" replace />;
  return (
    <div className="flex min-h-dvh items-center justify-center bg-bg">
      <p className="text-sm text-soft">E2E build — sign in via test hook.</p>
    </div>
  );
}

export default e2eBridge ? E2eAuthScreen : ClerkAuthScreen;
