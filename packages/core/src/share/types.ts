// Share-card data model (share redesign, docs/DECISIONS.md — see the entry
// dated alongside this module). Six card types, each with its own hero stat,
// replacing the old one-template `ShareCardData` key/value bag. Builders in
// `builders.ts` are pure (no React/DOM) so they're unit-testable here and
// reusable by anything that wants a card's numbers without the canvas painter.

import type { MuscleRegion } from "../domain/anatomy";
import type { ExerciseType } from "../domain/exercise-types";
import type { PrType } from "../records/types";

/** A single labeled number, already formatted for display. */
export type ShareStat = { label: string; value: string };

/** Big-number hero slot: value + unit are sized differently by the painter
 * (value dominant, unit ~0.35x); caption is an optional line above the
 * number giving it context (e.g. which exercise a chosen set belongs to). */
export type ShareHero = { caption?: string; value: string; unit: string };

export type ShareIdentity = { displayName: string | null };

// ── Session (Type 1) ────────────────────────────────────────────────────────

export type SessionCardSet = {
  id: string;
  setNo: number;
  setType: string;
  weightKg: number | null;
  reps: number | null;
  durationSec: number | null;
  distanceM: number | null;
};

export type SessionCardBlock = {
  exerciseId: string;
  exerciseName: string;
  exerciseType: ExerciseType;
  sets: SessionCardSet[];
};

/** Identifies one set within a session's blocks, for the hero-set picker. */
export type SessionSetRef = { exerciseId: string; setId: string };

export type SessionCard = {
  kind: "session";
  eyebrow: string; // "WORKOUT #47"
  title: string;
  date: string;
  hero: ShareHero;
  /** The exact set behind the hero — auto-picked (top set) unless the caller
   * passed a `heroSet` ref into the builder. */
  heroRef: SessionSetRef | null;
  isAutoHero: boolean;
  support: [ShareStat, ShareStat, ShareStat]; // Volume, Sets, Duration
  muscleSets: Record<string, number>;
  identity: ShareIdentity;
};

// ── PR (Type 2) ──────────────────────────────────────────────────────────

export type PrCard = {
  kind: "pr";
  eyebrow: string; // "NEW PR"
  exerciseName: string;
  prTypeLabel: string;
  hero: ShareHero;
  delta: ShareStat | null; // vs previous best
  previousBest: ShareStat | null;
  estOneRm: ShareStat | null;
  sparkline: Array<{ at: number; value: number }>; // e1RM, last 12 sessions
  /** When 2+ PRs land in one session: the rest, as a max-3 supporting list
   * (hero already carries the largest delta). */
  extraPrs: string[];
  identity: ShareIdentity;
};

// ── Streak (Type 3) ──────────────────────────────────────────────────────

export type StreakCard = {
  kind: "streak";
  eyebrow: "CONSISTENCY";
  hero: ShareHero; // weeks
  support: [ShareStat, ShareStat, ShareStat]; // workouts this wk, volume, rest days
  /** Last 13 weeks, oldest first: 1 if that week had ≥1 workout. */
  weeks: boolean[];
  identity: ShareIdentity;
};

// ── Month (Type 4) ─────────────────────────────────────────────────────────

export type MonthCard = {
  kind: "month";
  eyebrow: string; // "JULY 2026"
  hero: ShareHero; // workout count
  support: [ShareStat, ShareStat, ShareStat]; // volume, sets, hours
  workoutDays: string[]; // YYYY-MM-DD
  year: number;
  month: number; // 0-based
  topRegions: Array<{ region: MuscleRegion; sets: number }>;
  topExerciseName: string | null;
  prCount: number;
  identity: ShareIdentity;
};

// ── Year (Type 5) ────────────────────────────────────────────────────────

export type YearCard = {
  kind: "year";
  eyebrow: string; // "2026"
  hero: ShareHero; // total volume
  support: [ShareStat, ShareStat, ShareStat]; // workouts, hours, longest streak
  monthlyWorkouts: number[]; // 12, index = month
  mostProductiveMonth: number | null;
  topExerciseName: string | null;
  topRegionNames: string[];
  prCount: number;
  identity: ShareIdentity;
};

// ── Exercise records (Type 6) ───────────────────────────────────────────

export type ExerciseRecordsCard = {
  kind: "records";
  eyebrow: "PERSONAL RECORDS";
  exerciseName: string;
  hero: ShareHero; // best e1RM or heaviest weight
  heroPrType: PrType;
  support: ShareStat[]; // up to 3 rep-max set records
  sparkline: Array<{ at: number; value: number }>;
  identity: ShareIdentity;
};

// ── Measurement (gated — never a promoted card type; see report §5.2 "not a
// card type" / §7.2. Kept minimal and never auto-offered or in the default
// carousel, but still runs through the same frame/ground painter as the six
// numbered types rather than a bespoke rendering path.) ─────────────────────

export type MeasurementCard = {
  kind: "measurement";
  eyebrow: string; // metric label, e.g. "BODY WEIGHT"
  hero: ShareHero; // latest value
  support: ShareStat[]; // 30d / 90d change, when enough history exists
  sparkline: Array<{ at: number; value: number }>;
  identity: ShareIdentity;
};

export type ShareCard =
  | SessionCard
  | PrCard
  | StreakCard
  | MonthCard
  | YearCard
  | ExerciseRecordsCard
  | MeasurementCard;
