import { useCallback, useSyncExternalStore } from "react";

// Device-local workout behavior prefs (plan §B split rule: pure device behavior
// → localStorage, never the server). Semantics-bearing prefs — default rest,
// plate config, previous-values scope — live server-side in user_prefs.

const listeners = new Set<() => void>();

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

function emit() {
  for (const l of listeners) l();
}

// A boolean device pref backed by localStorage, exposed as a hook. Absent key
// → default; stored as "1"/"0".
function boolPref(key: string, dflt: boolean) {
  const read = () => {
    const v = localStorage.getItem(key);
    return v === null ? dflt : v === "1";
  };
  const write = (value: boolean) => {
    localStorage.setItem(key, value ? "1" : "0");
    emit();
  };
  return function useBoolPref(): [boolean, (v: boolean) => void] {
    const value = useSyncExternalStore(subscribe, read);
    const set = useCallback((v: boolean) => write(v), []);
    return [value, set];
  };
}

// A 0–1 volume device pref (0 = muted). Clamped on write.
function volumePref(key: string, dflt: number) {
  const read = () => {
    const v = localStorage.getItem(key);
    if (v === null) return dflt;
    const n = Number.parseFloat(v);
    return Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : dflt;
  };
  const write = (value: number) => {
    localStorage.setItem(key, String(Math.min(1, Math.max(0, value))));
    emit();
  };
  return function useVolumePref(): [number, (v: number) => void] {
    const value = useSyncExternalStore(subscribe, read);
    const set = useCallback((v: number) => write(v), []);
    return [value, set];
  };
}

/** Smart Superset Scrolling: completing a set inside a superset auto-advances
 * the view to the next member (wrapping). Default ON (matches Hevy). */
export const useSmartSupersetScroll = boolPref("smartSupersetScroll", true);

/** Rest-timer alert volume (0 muted … 1 full). Also gates the PR/rest blip. */
export const useRestSoundVolume = volumePref("restSoundVolume", 0.5);

/** Keep the screen awake during an active session (Wake Lock API). Default OFF
 * (battery-conscious). Read by session.tsx to acquire/release the lock. */
export const useKeepAwake = boolPref("keepAwake", false);

/** Live PR banner: surface a celebratory banner the moment a set beats a record
 * mid-session. Default ON (matches Hevy). Read by session.tsx to gate the banner. */
export const useLivePrBanner = boolPref("livePrBanner", true);
