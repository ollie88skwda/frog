import { Button } from "@/components/ui/button";
import { type Unit, useUnit } from "@/lib/settings";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";

const UNITS: Unit[] = ["lb", "kg"];

export default function SettingsScreen() {
  const { unit, setUnit } = useUnit();

  return (
    <div className="mx-auto max-w-2xl px-4 py-6 pb-20 md:pb-6">
      <h1 className="text-lg font-semibold tracking-tight">Settings</h1>

      <div className="mt-6 rounded-lg border border-border bg-surface p-4">
        <h2 className="text-sm font-medium">Units</h2>
        <p className="mt-0.5 text-2xs text-faint">
          Display only — weights are stored canonically in kg.
        </p>
        <div className="mt-3 inline-flex overflow-hidden rounded-md border border-border">
          {UNITS.map((u) => (
            <button
              key={u}
              type="button"
              onClick={() => setUnit(u)}
              data-testid={`unit-${u}`}
              className={cn(
                "px-3 py-1.5 text-xs font-medium transition-colors duration-100",
                unit === u
                  ? "bg-accent-soft text-ink"
                  : "text-soft hover:bg-surface-hover",
              )}
            >
              {u}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-4 rounded-lg border border-border bg-surface p-4">
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
