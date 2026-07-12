import { Button } from "@/components/ui/button";
import { supabase } from "@/lib/supabase";

export default function SettingsScreen() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-6">
      <h1 className="text-lg font-semibold tracking-tight">Settings</h1>
      <div className="mt-6 rounded-lg border border-border bg-surface p-4">
        <h2 className="text-sm font-medium">Account</h2>
        <Button
          variant="danger"
          size="sm"
          className="mt-3"
          onClick={() => void supabase.auth.signOut()}
          data-testid="sign-out-btn"
        >
          Sign out
        </Button>
      </div>
    </div>
  );
}
