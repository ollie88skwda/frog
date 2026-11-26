import { SignIn } from "@clerk/react";
import { APP_NAME } from "@frog/core";
import { type RefObject, useEffect, useRef } from "react";
import { Navigate } from "react-router";
import { FrogMark } from "@/components/frog-mark";
import { useSignedIn } from "@/lib/auth";
import { e2eBridge } from "@/lib/e2e-bridge";
import { useVoice } from "@/lib/voice";

// Clerk's prebuilt sign-in UI (Google + email — methods are configured in the
// Clerk dashboard). Hash routing keeps Clerk's multi-step flow off
// react-router. Redirect targets stay relative — never user-supplied.

/** Room kept above the keyboard: iOS 26's floating accessory bar (~48pt) plus a gap. */
const KEYBOARD_CLEARANCE = 72;

/**
 * Keeps Clerk's primary button (Continue) above the on-screen keyboard. iOS
 * doesn't shrink the layout viewport for the keyboard, so a centred card sat
 * under it with the accessory bar over Continue (iOS sim report #5). While
 * the visual viewport is shorter than the window, pad the page by the
 * keyboard's height (so it can scroll that far) and scroll the button clear.
 */
function useKeyboardClearance(ref: RefObject<HTMLDivElement | null>) {
  useEffect(() => {
    const vv = window.visualViewport;
    const el = ref.current;
    if (!vv || !el) return;
    let frame = 0;
    const fit = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const keyboard = Math.max(0, window.innerHeight - vv.height);
        el.style.paddingBottom = keyboard > 0 ? `${keyboard}px` : "";
        const focused = document.activeElement;
        if (!keyboard || !(focused instanceof HTMLInputElement)) return;
        if (!el.contains(focused)) return;
        const button = el.querySelector<HTMLElement>(".cl-formButtonPrimary");
        const target = button ?? focused;
        const bottom = target.getBoundingClientRect().bottom - vv.offsetTop;
        const over = bottom - (vv.height - KEYBOARD_CLEARANCE);
        if (over > 0) window.scrollBy({ top: over });
      });
    };
    vv.addEventListener("resize", fit);
    el.addEventListener("focusin", fit);
    return () => {
      cancelAnimationFrame(frame);
      vv.removeEventListener("resize", fit);
      el.removeEventListener("focusin", fit);
      el.style.paddingBottom = "";
    };
  }, [ref]);
}

function ClerkAuthScreen() {
  const signedIn = useSignedIn();
  const { t } = useVoice();
  const pageRef = useRef<HTMLDivElement>(null);
  useKeyboardClearance(pageRef);
  if (signedIn) return <Navigate to="/" replace />;

  return (
    // Top-aligned on phones (centred from md:) so the email field and
    // Continue sit in the top half, clear of the keyboard on most phones.
    <div
      ref={pageRef}
      className="flex min-h-dvh items-start justify-center bg-bg px-4 pt-[max(2rem,env(safe-area-inset-top))] pb-8 md:items-center md:py-8"
    >
      <div className="flex w-full max-w-sm flex-col items-center gap-6">
        <div className="flex flex-col items-center gap-3">
          {/* Frog mark — quiet chrome, never the expressive mascot. */}
          <FrogMark className="size-8" />
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
            // Same tokens as the app: Clerk reads CSS vars at render, so the
            // Because day/night roles follow data-mode automatically.
            variables: {
              colorPrimary: "var(--color-action-primary-bg)",
              colorPrimaryForeground: "var(--color-action-primary-text)",
              colorBackground: "var(--color-bg-raised)",
              colorForeground: "var(--color-text-primary)",
              colorMutedForeground: "var(--color-text-secondary)",
              colorInput: "var(--color-bg-sunken)",
              colorInputForeground: "var(--color-text-primary)",
              colorNeutral: "var(--color-text-primary)",
              colorDanger: "var(--color-danger-text)",
              colorSuccess: "var(--color-success-text)",
              colorRing: "var(--color-border-focus)",
              colorBorder: "var(--color-border-field)",
              colorShadow: "transparent",
              fontFamily: "var(--font-body)",
              fontWeight: {
                normal: 410,
                medium: 600,
                semibold: 600,
                bold: 700,
              },
              borderRadius: "var(--r-sm)",
            },
            // Clerk's card renders its own "Sign in to <Clerk app name>"
            // heading, which duplicates ours and shows the Clerk-side app
            // name rather than APP_NAME. Ours is the source of truth.
            // No lines: the card and social buttons separate by tone + shadow.
            elements: {
              header: { display: "none" },
              cardBox: {
                boxShadow: "var(--shadow-2)",
                borderRadius: "var(--r-md)",
                border: "0",
              },
              card: { boxShadow: "none", border: "0" },
              footer: { background: "transparent", border: "0" },
              footerAction: { border: "0" },
              dividerLine: { display: "none" },
              socialButtonsBlockButton: {
                border: "0",
                background: "var(--color-action-secondary-bg)",
                boxShadow: "none",
              },
              formButtonPrimary: { boxShadow: "none" },
            },
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
