import { useCallback, useSyncExternalStore } from "react";

// In-app micro-education (docs/DECISIONS.md): ultra-concise — a couple of
// short lines per lesson, optional tiny visual, optional citations (the seam
// the future PubMed coaching plugs into). Seen-state is a local device
// setting, same pattern as lib/settings.ts.

export type LessonId = "rir";

export type Lesson = {
  title: string;
  body: string[]; // one string = one short line
  citations?: string[]; // PMIDs / DOIs, rendered as small links
};

export const LESSONS: Record<LessonId, Lesson> = {
  // PLACEHOLDER copy — Ollie supplies the final wording.
  rir: {
    title: "RIR — reps in reserve",
    body: [
      "Reps you could still do. 0 = failure: max stimulus, most fatigue.",
      "1–2 RIR: similar gains, less fatigue.",
      "Beginner? Go near failure to learn what failure feels like. Intermediate+? Stay at 1–2.",
    ],
  },
};

const KEY = "lessons-seen";
const listeners = new Set<() => void>();

let cache: string | null = null;
function raw(): string {
  cache ??= localStorage.getItem(KEY) ?? "[]";
  return cache;
}

function seenIds(): string[] {
  try {
    const parsed: unknown = JSON.parse(raw());
    return Array.isArray(parsed)
      ? parsed.filter((x) => typeof x === "string")
      : [];
  } catch {
    return [];
  }
}

function markSeen(id: LessonId) {
  const ids = seenIds();
  if (ids.includes(id)) return;
  cache = JSON.stringify([...ids, id]);
  localStorage.setItem(KEY, cache);
  for (const l of listeners) l();
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function useLessonSeen(id: LessonId): {
  seen: boolean;
  markSeen: () => void;
} {
  const snapshot = useSyncExternalStore(subscribe, raw);
  const mark = useCallback(() => markSeen(id), [id]);
  return { seen: snapshot.includes(`"${id}"`), markSeen: mark };
}
