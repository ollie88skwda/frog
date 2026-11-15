import { DEFAULT_WARMUP_METHOD, type WarmupStep } from "@frog/core";
import { useCallback, useSyncExternalStore } from "react";

// The user's warm-up ramp (percentage + reps per step) — a device-local pref
// (plan §B: pure logging behavior → localStorage). session.tsx's warm-up insert
// reads getWarmupMethod() so an edited ramp takes effect on the next insert.

const KEY = "warmupMethod";
const listeners = new Set<() => void>();

// getWarmupMethod must return a STABLE reference between calls (it backs a
// useSyncExternalStore snapshot) — recompute only when the stored string
// changes, otherwise React sees a "new" store on every render and loops.
let cachedRaw: string | null | undefined;
let cachedValue: WarmupStep[] = DEFAULT_WARMUP_METHOD;

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

function emit() {
  for (const l of listeners) l();
}

function isStep(v: unknown): v is WarmupStep {
  return (
    typeof v === "object" &&
    v !== null &&
    typeof (v as WarmupStep).pct === "number" &&
    typeof (v as WarmupStep).reps === "number"
  );
}

function parse(raw: string | null): WarmupStep[] {
  if (!raw) return DEFAULT_WARMUP_METHOD;
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length > 0 && parsed.every(isStep)) {
      return parsed as WarmupStep[];
    }
  } catch {
    // fall through to default
  }
  return DEFAULT_WARMUP_METHOD;
}

/** The stored ramp, or the default when unset / corrupt. Cached so repeated
 * calls (and the useSyncExternalStore snapshot) return a stable reference. */
export function getWarmupMethod(): WarmupStep[] {
  const raw = localStorage.getItem(KEY);
  if (raw !== cachedRaw) {
    cachedRaw = raw;
    cachedValue = parse(raw);
  }
  return cachedValue;
}

function setWarmupMethod(method: WarmupStep[]) {
  if (method.length === 0) {
    localStorage.removeItem(KEY);
  } else {
    localStorage.setItem(KEY, JSON.stringify(method));
  }
  emit();
}

/** Editor hook: current ramp + a setter. Setting [] (or via reset) reverts to
 * the built-in default. */
export function useWarmupMethod(): {
  method: WarmupStep[];
  setMethod: (m: WarmupStep[]) => void;
  reset: () => void;
  isCustom: boolean;
} {
  const method = useSyncExternalStore(subscribe, getWarmupMethod);
  const setMethod = useCallback((m: WarmupStep[]) => setWarmupMethod(m), []);
  const reset = useCallback(() => setWarmupMethod([]), []);
  const isCustom = method !== DEFAULT_WARMUP_METHOD;
  return { method, setMethod, reset, isCustom };
}
