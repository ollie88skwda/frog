import type { ExportBundle } from "../repo/types";

function esc(v: unknown): string {
  if (v == null) return "";
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
}

/**
 * Flat sets.csv: one row per logged set, with the parent session's condition
 * values denormalized into one column per session-scope metric.
 */
export function setsCsv(bundle: ExportBundle): string {
  const exerciseById = new Map(bundle.exercises.map((e) => [e.id, e]));
  const sessionById = new Map(bundle.sessions.map((s) => [s.id, s]));
  const seById = new Map(bundle.sessionExercises.map((se) => [se.id, se]));
  const conditionMetrics = bundle.metrics.filter((m) => m.scope === "session");

  const header = [
    "session_started_at",
    "session_title",
    "exercise",
    "set_no",
    "weight_kg",
    "reps",
    "rir",
    "note",
    ...conditionMetrics.map((m) => m.name),
  ];

  const rows = bundle.setLogs
    .filter((sl) => sl.deletedAt == null)
    .map((sl) => {
      const se = seById.get(sl.sessionExerciseId);
      const session = se ? sessionById.get(se.sessionId) : undefined;
      const exercise = se ? exerciseById.get(se.exerciseId) : undefined;
      const conditions = session?.conditionValues ?? {};
      return [
        session ? new Date(session.startedAt).toISOString() : "",
        session?.title ?? "",
        exercise?.name ?? "",
        sl.setNo,
        sl.weightKg ?? "",
        sl.reps ?? "",
        sl.rir ?? "",
        sl.note ?? "",
        ...conditionMetrics.map(
          (m) => (conditions as Record<string, unknown>)[m.id] ?? "",
        ),
      ]
        .map(esc)
        .join(",");
    });

  return [header.map(esc).join(","), ...rows].join("\n");
}
