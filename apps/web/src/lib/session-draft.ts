import type { SetType } from "@sbl/core";

// Per-block uncommitted draft persistence. The active (unlogged) row's
// keystrokes are mirrored to localStorage keyed by session_exercise id, so a
// reload / crash mid-set restores what was typed. Cleared on commit, finish,
// and discard. Committed sets already live server-side — this only guards the
// one in-progress row per block. (Plan §D: only uncommitted keystrokes go to
// localStorage; the online-first mandate is unchanged.)

export type DraftSnapshot = {
  weight: string;
  reps: string;
  duration: string;
  distance: string;
  rir: string;
  rpe: string;
  note: string;
  setType: SetType;
  extras: string[];
  metricDraft: Record<string, string>;
};

const PREFIX = "sbl.sdraft.";

function keyFor(seId: string): string {
  return PREFIX + seId;
}

export function loadDraft(seId: string): Partial<DraftSnapshot> | null {
  try {
    const raw = localStorage.getItem(keyFor(seId));
    return raw ? (JSON.parse(raw) as Partial<DraftSnapshot>) : null;
  } catch {
    return null;
  }
}

export function saveDraft(seId: string, snapshot: DraftSnapshot): void {
  try {
    // Nothing typed → don't leave an empty husk behind.
    const empty =
      snapshot.weight === "" &&
      snapshot.reps === "" &&
      snapshot.duration === "" &&
      snapshot.distance === "" &&
      snapshot.rir === "" &&
      snapshot.rpe === "" &&
      snapshot.note === "" &&
      snapshot.setType === "normal" &&
      snapshot.extras.length === 0 &&
      Object.keys(snapshot.metricDraft).length === 0;
    if (empty) {
      localStorage.removeItem(keyFor(seId));
      return;
    }
    localStorage.setItem(keyFor(seId), JSON.stringify(snapshot));
  } catch {
    // Quota / private-mode — draft persistence is best-effort.
  }
}

export function clearDraft(seId: string): void {
  try {
    localStorage.removeItem(keyFor(seId));
  } catch {
    // ignore
  }
}
