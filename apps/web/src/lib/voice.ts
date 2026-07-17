import { useCallback, useSyncExternalStore } from "react";

// Language registers — Human · Frog · Ultrafrog (docs/brand/
// frog-brand-identity.html §03). One setting changes how the app TALKS,
// never what it REPORTS: registers are a pure text transform at render
// time; data, timers, and charts are untouched. Copy passes through t()
// only in playground zones (empty states, toasts, errors, celebrations) —
// sacred zones (numbers, findings statistics, the logging hot path) never
// route through a register.
//
// - human: plain, zero personality — the accessibility / serious-mode
//   escape hatch, and the future i18n seam.
// - frog (default): the deadpan brand voice, written per-string.
// - ultra: every word becomes "ribbit" (case preserved); tokens containing
//   a digit plus a whitelist of units survive, so all information rides on
//   the figures.

export type Register = "human" | "frog" | "ultra";

const REGISTER_KEY = "voiceRegister";
const listeners = new Set<() => void>();

function currentRegister(): Register {
  const stored = localStorage.getItem(REGISTER_KEY);
  return stored === "human" || stored === "ultra" ? stored : "frog";
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function useRegister(): {
  register: Register;
  setRegister: (r: Register) => void;
} {
  const register = useSyncExternalStore(subscribe, currentRegister);
  const setRegister = useCallback((r: Register) => {
    localStorage.setItem(REGISTER_KEY, r);
    for (const l of listeners) l();
  }, []);
  return { register, setRegister };
}

// Units that survive the ribbit transform so numbers stay interpretable.
const UNITS = new Set([
  "kg",
  "lb",
  "lbs",
  "rir",
  "e1rm",
  "n",
  "s",
  "sec",
  "min",
  "hr",
  "hrs",
  "h",
  "reps",
  "rep",
  "set",
  "sets",
  "bw",
  "r",
  "p",
  "ci",
  "x",
  "km",
  "mi",
  "cm",
  "in",
]);

function matchCase(core: string): string {
  if (core === core.toUpperCase() && core !== core.toLowerCase())
    return "RIBBIT";
  if (core[0] === core[0].toUpperCase() && core[0] !== core[0].toLowerCase())
    return "Ribbit";
  return "ribbit";
}

// The rule that makes Ultrafrog safe: any token containing a digit survives,
// units survive, punctuation survives in place — everything else ribbits.
export function ribbit(text: string): string {
  return text
    .split(/(\s+)/)
    .map((tok) => {
      if (/^\s*$/.test(tok)) return tok;
      const m = tok.match(/^([^0-9A-Za-zÀ-ɏ]*)([\s\S]*?)([^0-9A-Za-zÀ-ɏ]*)$/);
      if (!m) return tok;
      const [, lead, core, trail] = m;
      if (core === "") return tok;
      if (/[0-9]/.test(core)) return tok;
      if (UNITS.has(core.toLowerCase())) return tok;
      return lead + matchCase(core) + trail;
    })
    .join("");
}

function speak(register: Register, human: string, frog?: string): string {
  if (register === "human") return human;
  if (register === "ultra") return ribbit(frog ?? human);
  return frog ?? human;
}

// Hook form — re-renders when the register changes.
export function useVoice(): {
  register: Register;
  t: (human: string, frog?: string) => string;
} {
  const register = useSyncExternalStore(subscribe, currentRegister);
  const t = useCallback(
    (human: string, frog?: string) => speak(register, human, frog),
    [register],
  );
  return { register, t };
}

// Non-hook form for code outside the render tree (toasts, notifications).
export function voice(human: string, frog?: string): string {
  return speak(currentRegister(), human, frog);
}
