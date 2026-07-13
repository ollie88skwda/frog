import { APP_NAME } from "@sbl/core";
import { type FormEvent, useState } from "react";
import { Navigate } from "react-router";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";

type Phase = "idle" | "sending" | "sent";

export default function AuthScreen() {
  const { session, loading } = useAuth();
  const [email, setEmail] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);

  if (!loading && session) return <Navigate to="/" replace />;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setPhase("sending");
    setError(null);
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: window.location.origin },
    });
    if (error) {
      setError(error.message);
      setPhase("idle");
    } else {
      setPhase("sent");
    }
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-bg px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center gap-3">
          <div className="flex size-8 items-center justify-center rounded-lg bg-brand text-sm font-semibold text-accent-fg">
            {APP_NAME[0]}
          </div>
          <div className="text-center">
            <h1 className="text-lg font-semibold tracking-tight">
              Sign in to {APP_NAME}
            </h1>
            <p className="mt-1 text-xs text-soft">
              Your training lab notebook. We'll email you a magic link.
            </p>
          </div>
        </div>

        {phase === "sent" ? (
          <div className="rounded-lg border border-border bg-surface p-4 text-center">
            <p className="text-sm">Check your email</p>
            <p className="mt-1 text-xs text-soft">
              A sign-in link was sent to{" "}
              <span className="text-ink">{email}</span>.
            </p>
            <Button
              variant="ghost"
              size="sm"
              className="mt-3"
              onClick={() => setPhase("idle")}
            >
              Use a different email
            </Button>
          </div>
        ) : (
          <form onSubmit={onSubmit} className="flex flex-col gap-2">
            <Input
              type="email"
              required
              autoFocus
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              data-testid="auth-email-input"
            />
            <Button
              type="submit"
              variant="primary"
              size="lg"
              disabled={phase === "sending" || email.length === 0}
              data-testid="auth-submit-btn"
            >
              {phase === "sending" ? "Sending…" : "Send magic link"}
            </Button>
            {error && <p className="text-xs text-neg">{error}</p>}
          </form>
        )}
      </div>
    </div>
  );
}
