import type { SetType } from "@frog/core";
import type { LatMode } from "@/components/session/shared";

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
  rirMin: string;
  rirMax: string;
  rpe: string;
  note: string;
  setType: SetType;
  extras: string[];
  metricDraft: Record<string, string>;
  // Right-side keystrokes for a unilateral pair (blank until overridden — the
  // left values mirror across as placeholders, not draft state).
  rWeight?: string;
  rReps?: string;
  rDuration?: string;
  rDistance?: string;
  // Per-set laterality (BOTH · L · R · L+R) — persisted so a reload restores
  // the ᴿ panel and the right-side keystrokes it protects. Absent = fall back
  // to the routine's per-set prescription / the exercise default.
  latMode?: LatMode;
  // Same-weight link for an L+R set (default on; false = the ᴿ weight is its
  // own value).
  linked?: boolean;
};

const PREFIX = "frog.sdraft.";
// Pre-rebrand prefix, read-only. A user mid-set when the rename shipped would
// otherwise lose the keystrokes this module exists to protect. Safe to delete
// one release after 2026-07-28.
const LEGACY_PREFIX = "sbl.sdraft.";

function keyFor(seId: string): string {
  return PREFIX + seId;
}

export function loadDraft(seId: string): Partial<DraftSnapshot> | null {
  try {
    const raw =
      localStorage.getItem(keyFor(seId)) ??
      localStorage.getItem(LEGACY_PREFIX + seId);
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
      snapshot.rirMin === "" &&
      snapshot.rirMax === "" &&
      snapshot.rpe === "" &&
      snapshot.note === "" &&
      snapshot.setType === "normal" &&
      snapshot.extras.length === 0 &&
      Object.keys(snapshot.metricDraft).length === 0 &&
      !snapshot.rWeight &&
      !snapshot.rReps &&
      !snapshot.rDuration &&
      !snapshot.rDistance &&
      (snapshot.latMode ?? "both") === "both" &&
      snapshot.linked !== false;
    if (empty) {
      clearDraft(seId);
      return;
    }
    localStorage.setItem(keyFor(seId), JSON.stringify(snapshot));
    localStorage.removeItem(LEGACY_PREFIX + seId);
  } catch {
    // Quota / private-mode — draft persistence is best-effort.
  }
}

export function clearDraft(seId: string): void {
  try {
    localStorage.removeItem(keyFor(seId));
    // Drop the legacy key too, or a draft restored from it would survive the
    // commit that cleared its replacement and reappear on the next load.
    localStorage.removeItem(LEGACY_PREFIX + seId);
  } catch {
    // ignore
  }
}
