// Notes survive a reload (a refresh mid-review must not lose written feedback)
// but nothing here ever touches Supabase — annotations are local scratch, not
// user data, so they are deliberately outside the Repo seam and outside
// registerUserScopedReset (they describe the UI, not an account).

import type { AnnotationNote } from "./format";

const KEY = "frog.annotations.v1";

function isNote(v: unknown): v is AnnotationNote {
  if (typeof v !== "object" || v === null) return false;
  const n = v as Record<string, unknown>;
  return (
    typeof n.id === "string" &&
    typeof n.comment === "string" &&
    typeof n.createdAt === "number" &&
    typeof n.target === "object" &&
    n.target !== null
  );
}

export function loadNotes(): AnnotationNote[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(isNote) : [];
  } catch {
    return [];
  }
}

export function saveNotes(notes: readonly AnnotationNote[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(notes));
  } catch {
    // Quota/private-mode failures are not worth breaking a dev tool over.
  }
}
