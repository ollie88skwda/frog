// Pure card builders (share redesign). Each shapes already-computed domain
// data (sessions, PR events, monthly/year reports, exercise records) into one
// card's hero/support/graphic slots per the statline rule: one hero number,
// three supporting stats, one signature graphic, one identity line. No
// React/DOM — these run identically in the app and in a unit test.

import type { MuscleRegion } from "../domain/anatomy";
import { MUSCLE_REGION_LABELS } from "../domain/anatomy";
import type { ExerciseType } from "../domain/exercise-types";
import {
  formatVolume,
  formatVolumeNumber,
  formatWeight,
  toDisplayWeight,
  unitLabel,
} from "../domain/units";
import { setVolumeKg } from "../domain/volume";
import type { ExerciseRecords, PrEvent, PrType } from "../records/types";
import type { MuscleByExercise } from "../stats/aggregate";
import { muscleCredits } from "../stats/aggregate";
import type { MonthlyReport } from "../stats/monthly-report";
import type { YearReview } from "../stats/year-review";
import { formatHM, formatSetMMSS } from "./format";
import type {
  ExerciseRecordsCard,
  MeasurementCard,
  MonthCard,
  PrCard,
  SessionCard,
  SessionCardBlock,
  SessionCardSet,
  SessionSetRef,
  ShareHero,
  ShareIdentity,
  ShareStat,
  StreakCard,
  YearCard,
} from "./types";

type Unit = "kg" | "lb";
type DistUnit = "km" | "mi";

// ── Session (Type 1) ────────────────────────────────────────────────────────

/** Per-session muscle set credit (primary 1.0 / secondary 0.5), for the
 * session card's body heat map graphic. */
export function sessionMuscleSets(
  blocks: SessionCardBlock[],
  muscles: MuscleByExercise,
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const b of blocks) {
    const credits = muscleCredits(muscles.get(b.exerciseId));
    if (!credits.length || b.sets.length === 0) continue;
    for (const { muscle, credit } of credits) {
      out[muscle] = (out[muscle] ?? 0) + b.sets.length * credit;
    }
  }
  return out;
}

type ScoredSet = {
  block: SessionCardBlock;
  set: SessionCardSet;
  score: [number, number, number, number];
};

/** The session's "most impressive set", auto-picked when the user hasn't
 * chosen one: heaviest weight (ties broken by reps), falling back to most
 * reps / longest duration / longest distance for bodyweight-only or
 * duration/distance sessions where no set carries a weight. */
function pickAutoHeroSet(blocks: SessionCardBlock[]): ScoredSet | null {
  let best: ScoredSet | null = null;
  for (const block of blocks) {
    for (const set of block.sets) {
      const score: [number, number, number, number] = [
        set.weightKg ?? -1,
        set.reps ?? -1,
        set.durationSec ?? -1,
        set.distanceM ?? -1,
      ];
      if (!best || compareLex(score, best.score) > 0) {
        best = { block, set, score };
      }
    }
  }
  return best;
}

function compareLex(a: number[], b: number[]): number {
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return a[i] - b[i];
  }
  return 0;
}

function findHeroSet(
  blocks: SessionCardBlock[],
  ref: SessionSetRef,
): ScoredSet | null {
  const block = blocks.find((b) => b.exerciseId === ref.exerciseId);
  const set = block?.sets.find((s) => s.id === ref.setId);
  return block && set ? { block, set, score: [0, 0, 0, 0] } : null;
}

/** The hero unit slot for a duration set. Unlike "kg × 3" / "reps" / "m" this
 * is a descriptor rather than an inline unit — an mm:ss value already reads as
 * a time — so surfaces that print value and unit on one line drop it. */
export const HERO_DURATION_UNIT = "time";

/** The hero slot for one set. Exported because the share sheet's headline-set
 * picker labels each chip with the very number the card will paint once it is
 * tapped — two hand-written copies of this precedence would drift. */
export function formatHeroSet(
  block: SessionCardBlock,
  set: SessionCardSet,
  unit: Unit,
): ShareHero {
  const caption = block.exerciseName;
  if (set.weightKg != null && set.weightKg > 0) {
    const value = String(toDisplayWeight(set.weightKg, unit));
    const unitStr =
      set.reps != null && set.reps > 0
        ? `${unitLabel(unit)} × ${set.reps}`
        : unitLabel(unit);
    return { caption, value, unit: unitStr };
  }
  if (set.reps != null && set.reps > 0) {
    return {
      caption,
      value: String(set.reps),
      unit: set.reps === 1 ? "rep" : "reps",
    };
  }
  if (set.durationSec != null && set.durationSec > 0) {
    return {
      caption,
      value: formatSetMMSS(set.durationSec),
      unit: HERO_DURATION_UNIT,
    };
  }
  if (set.distanceM != null && set.distanceM > 0) {
    return { caption, value: String(Math.round(set.distanceM)), unit: "m" };
  }
  return { caption, value: "—", unit: "" };
}

export function buildSessionCard(input: {
  ordinal: number;
  title: string;
  date: string;
  durationMs: number;
  blocks: SessionCardBlock[];
  muscles: MuscleByExercise;
  bodyweightKg: number | null;
  unit: Unit;
  identity: ShareIdentity;
  /** A user-tapped set to headline; omit/null for the auto pick (top set). */
  heroSet?: SessionSetRef | null;
}): SessionCard {
  const { blocks, unit, bodyweightKg } = input;

  const volumeKg = blocks.reduce(
    (sum, b) =>
      sum +
      b.sets.reduce(
        (s, x) => s + setVolumeKg(b.exerciseType, x, bodyweightKg),
        0,
      ),
    0,
  );
  const setCount = blocks.reduce((n, b) => n + b.sets.length, 0);

  const picked = input.heroSet ? findHeroSet(blocks, input.heroSet) : null;
  const auto = picked ?? pickAutoHeroSet(blocks);
  const isAutoHero = picked == null;

  const hero = auto
    ? formatHeroSet(auto.block, auto.set, unit)
    : { value: "—", unit: "" };
  const heroRef: SessionSetRef | null = auto
    ? { exerciseId: auto.block.exerciseId, setId: auto.set.id }
    : null;

  const support: [ShareStat, ShareStat, ShareStat] = [
    {
      label: "Volume",
      value: volumeKg > 0 ? formatVolume(volumeKg, unit) : "—",
    },
    { label: "Sets", value: String(setCount) },
    { label: "Duration", value: formatHM(input.durationMs) },
  ];

  return {
    kind: "session",
    eyebrow: `Workout #${input.ordinal}`,
    title: input.title,
    date: input.date,
    hero,
    heroRef,
    isAutoHero,
    support,
    muscleSets: sessionMuscleSets(blocks, input.muscles),
    identity: input.identity,
  };
}

// ── PR (Type 2) ──────────────────────────────────────────────────────────

/** PR value formatting per PR type. Mirrors the app-level `formatPrValue` /
 * `prValue` helpers in exercise-detail.tsx and lib/report-format.ts — kept as
 * a separate core copy (not consolidated into those) since this one only
 * needs to be pure and reusable by the share builders, not touch the app's
 * `Unit`/`DistanceUnit` display-setting types. */
export function formatPrValue(
  pr: PrType,
  v: number,
  unit: Unit,
  distUnit: DistUnit,
): string {
  switch (pr) {
    case "heaviest_weight":
    case "best_e1rm":
    case "best_set_volume":
    case "best_session_volume":
      return formatWeight(v, unit);
    case "best_set_reps":
    case "best_session_reps":
      return `${Math.round(v)} reps`;
    case "best_time":
      return formatSetMMSS(v);
    case "longest_distance":
      return distUnit === "mi"
        ? `${(v / 1609.344).toFixed(2)} mi`
        : `${(v / 1000).toFixed(2)} km`;
    case "best_pace": {
      const perHour = v * 3600;
      return distUnit === "mi"
        ? `${(perHour / 1609.344).toFixed(1)} mi/h`
        : `${(perHour / 1000).toFixed(1)} km/h`;
    }
  }
}

export function buildPrCard(input: {
  event: PrEvent;
  prTypeLabel: string;
  exerciseName: string;
  unit: Unit;
  distUnit: DistUnit;
  estOneRmKg: number | null;
  sparkline: Array<{ at: number; value: number }>;
  extraPrLabels: string[];
  identity: ShareIdentity;
}): PrCard {
  const { event, unit, distUnit } = input;
  const hero: ShareHero = {
    value: formatPrValue(event.prType, event.value, unit, distUnit),
    unit: "",
  };
  const delta: ShareStat | null =
    event.previous != null
      ? {
          label: "Δ vs previous",
          value: `+${formatPrValue(event.prType, event.value - event.previous, unit, distUnit)}`,
        }
      : null;
  const previousBest: ShareStat | null =
    event.previous != null
      ? {
          label: "Previous best",
          value: formatPrValue(event.prType, event.previous, unit, distUnit),
        }
      : null;
  const estOneRm: ShareStat | null =
    input.estOneRmKg != null
      ? { label: "Est. 1RM", value: formatWeight(input.estOneRmKg, unit) }
      : null;

  return {
    kind: "pr",
    eyebrow: "New PR",
    exerciseName: input.exerciseName,
    prTypeLabel: input.prTypeLabel,
    hero,
    delta,
    previousBest,
    estOneRm,
    sparkline: input.sparkline,
    extraPrs: input.extraPrLabels.slice(0, 3),
    identity: input.identity,
  };
}

// ── Streak (Type 3) ──────────────────────────────────────────────────────

export function buildStreakCard(input: {
  weeksStreak: number;
  workoutsThisWeek: number;
  volumeKgThisWeek: number;
  restDays: number | null;
  /** Oldest → newest, length 13: true = that week had ≥1 workout. */
  last13Weeks: boolean[];
  unit: Unit;
  identity: ShareIdentity;
}): StreakCard {
  return {
    kind: "streak",
    eyebrow: "CONSISTENCY",
    hero: {
      value: String(input.weeksStreak),
      unit: input.weeksStreak === 1 ? "week streak" : "weeks streak",
    },
    support: [
      { label: "This week", value: String(input.workoutsThisWeek) },
      {
        label: "Volume",
        value: formatVolume(input.volumeKgThisWeek, input.unit),
      },
      {
        label: "Rest",
        value:
          input.restDays == null
            ? "—"
            : input.restDays === 0
              ? "Trained today"
              : `${input.restDays}d`,
      },
    ],
    weeks: input.last13Weeks,
    identity: input.identity,
  };
}

// ── Month (Type 4) ─────────────────────────────────────────────────────────

const monthLabelFmt = new Intl.DateTimeFormat(undefined, {
  month: "long",
  year: "numeric",
});

export function buildMonthCard(input: {
  report: MonthlyReport;
  unit: Unit;
  topExerciseName: string | null;
  identity: ShareIdentity;
}): MonthCard {
  const { report, unit } = input;
  const topRegions = (
    Object.entries(report.distribution.regionSets) as Array<
      [MuscleRegion, number]
    >
  )
    .map(([region, sets]) => ({ region, sets }))
    .filter((r) => r.sets > 0)
    .sort((a, b) => b.sets - a.sets)
    .slice(0, 3);

  return {
    kind: "month",
    eyebrow: monthLabelFmt
      .format(new Date(report.year, report.month, 1))
      .toUpperCase(),
    hero: {
      value: String(report.totals.workouts),
      unit: report.totals.workouts === 1 ? "workout" : "workouts",
    },
    support: [
      { label: "Volume", value: formatVolume(report.totals.volumeKg, unit) },
      { label: "Sets", value: String(report.totals.sets) },
      {
        label: "Hours",
        value: (report.totals.durationMs / 3_600_000).toFixed(1),
      },
    ],
    workoutDays: report.workoutDays,
    year: report.year,
    month: report.month,
    topRegions,
    topExerciseName: input.topExerciseName,
    prCount: report.prEvents.length,
    identity: input.identity,
  };
}

// ── Year (Type 5) ────────────────────────────────────────────────────────

export function buildYearCard(input: {
  review: YearReview;
  unit: Unit;
  topExerciseName: string | null;
  identity: ShareIdentity;
}): YearCard {
  const { review, unit } = input;
  const monthlyWorkouts = new Array(12).fill(0);
  // YearReview doesn't carry a per-month breakdown beyond mostProductiveMonth,
  // so the bar-strip graphic derives its per-month counts from workoutDays.
  for (const day of review.workoutDays) {
    const m = new Date(`${day}T00:00:00`).getMonth();
    monthlyWorkouts[m] += 1;
  }

  return {
    kind: "year",
    eyebrow: String(review.year),
    hero: {
      value: formatVolumeNumber(review.volumeKg, unit),
      unit: unitLabel(unit),
    },
    support: [
      { label: "Workouts", value: String(review.workouts) },
      { label: "Hours", value: (review.activeMs / 3_600_000).toFixed(0) },
      {
        label: "Longest streak",
        value: `${review.longestStreakWeeks}w`,
      },
    ],
    monthlyWorkouts,
    mostProductiveMonth: review.mostProductiveMonth?.month ?? null,
    topExerciseName: input.topExerciseName,
    topRegionNames: review.topRegions.map(
      (r) => MUSCLE_REGION_LABELS[r.region],
    ),
    prCount: review.prEvents.length,
    identity: input.identity,
  };
}

// ── Exercise records (Type 6) ───────────────────────────────────────────

export function buildExerciseRecordsCard(input: {
  exerciseName: string;
  type: ExerciseType;
  records: ExerciseRecords;
  unit: Unit;
  distUnit: DistUnit;
  sparkline: Array<{ at: number; value: number }>;
  identity: ShareIdentity;
}): ExerciseRecordsCard | null {
  const { records, unit, distUnit } = input;
  // Priority order for the hero stat, falling back through PR types so every
  // exercise type keeps a working card — only weight_reps/weighted_bodyweight
  // ever have best_e1rm/heaviest_weight; bodyweight_reps/assisted_bodyweight,
  // duration/weight_duration, and distance_duration/weight_distance each need
  // a different PR type to headline with.
  const HERO_PRIORITY: PrType[] = [
    "best_e1rm",
    "heaviest_weight",
    "best_time",
    "best_pace",
    "longest_distance",
    "best_set_reps",
    "best_session_volume",
    "best_session_reps",
  ];
  const heroPrType =
    HERO_PRIORITY.find((t) => records.bests[t] != null) ?? null;
  const heroEntry = heroPrType ? records.bests[heroPrType] : undefined;
  if (!heroEntry || !heroPrType) return null;

  const setRecordRows = [...records.setRecords.entries()]
    .sort((a, b) => a[0] - b[0])
    .slice(0, 3);

  return {
    kind: "records",
    eyebrow: "PERSONAL RECORDS",
    exerciseName: input.exerciseName,
    hero: {
      value: formatPrValue(heroPrType, heroEntry.value, unit, distUnit),
      unit: "",
    },
    heroPrType,
    support: setRecordRows.map(([reps, r]) => ({
      label: `${reps}RM`,
      value: formatWeight(r.weightKg, unit),
    })),
    sparkline: input.sparkline,
    identity: input.identity,
  };
}

// ── Measurement (gated, report §5.2/§7.2) ─────────────────────────────────

/** Formatting stays with the caller (measures.tsx already owns kg/lb/cm/in/%
 * display conversion per metric kind) — this just assembles the slots. */
export function buildMeasurementCard(input: {
  metricLabel: string;
  heroValue: string;
  heroUnit: string;
  change30d: string | null;
  change90d: string | null;
  sparkline: Array<{ at: number; value: number }>;
  identity: ShareIdentity;
}): MeasurementCard {
  const support: ShareStat[] = [];
  if (input.change30d != null)
    support.push({ label: "30d", value: input.change30d });
  if (input.change90d != null)
    support.push({ label: "90d", value: input.change90d });

  return {
    kind: "measurement",
    eyebrow: input.metricLabel,
    hero: { value: input.heroValue, unit: input.heroUnit },
    support,
    sparkline: input.sparkline,
    identity: input.identity,
  };
}
