import type { Measurement } from "../db/schema";
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
    "set_type",
    "weight_kg",
    "reps",
    "duration_sec",
    "distance_m",
    "rir",
    "rpe",
    "rest_sec",
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
        sl.setType,
        sl.weightKg ?? "",
        sl.reps ?? "",
        sl.durationSec ?? "",
        sl.distanceM ?? "",
        sl.rir ?? "",
        sl.rpe ?? "",
        sl.restSec ?? "",
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

/** measurements.csv: one row per day's entry (canonical kg/cm units). */
export function measurementsCsv(measurements: Measurement[]): string {
  const header = [
    "measured_on",
    "bodyweight_kg",
    "bodyfat_pct",
    "neck_cm",
    "shoulders_cm",
    "chest_cm",
    "waist_cm",
    "abdomen_cm",
    "hips_cm",
    "bicep_l_cm",
    "bicep_r_cm",
    "forearm_l_cm",
    "forearm_r_cm",
    "thigh_l_cm",
    "thigh_r_cm",
    "calf_l_cm",
    "calf_r_cm",
  ];
  const rows = measurements
    .filter((m) => m.deletedAt == null)
    .sort((a, b) => a.measuredOn.localeCompare(b.measuredOn))
    .map((m) =>
      [
        m.measuredOn,
        m.bodyweightKg ?? "",
        m.bodyfatPct ?? "",
        m.neckCm ?? "",
        m.shouldersCm ?? "",
        m.chestCm ?? "",
        m.waistCm ?? "",
        m.abdomenCm ?? "",
        m.hipsCm ?? "",
        m.bicepLCm ?? "",
        m.bicepRCm ?? "",
        m.forearmLCm ?? "",
        m.forearmRCm ?? "",
        m.thighLCm ?? "",
        m.thighRCm ?? "",
        m.calfLCm ?? "",
        m.calfRCm ?? "",
      ]
        .map(esc)
        .join(","),
    );
  return [header.map(esc).join(","), ...rows].join("\n");
}
