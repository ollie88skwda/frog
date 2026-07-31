import {
  type Exercise,
  jointActionLabel,
  type Machine,
  ratingsForExercise,
  type Tier,
} from "@frog/core";
import { Dumbbell, Star } from "lucide-react";
import { cn } from "@/lib/utils";

// Exercise quality is encoded by the brightness of the name text: the better
// the exercise (for that muscle), the brighter/lighter the text. No letters on
// the reading path — see TierLegend for the key. (S = best … C = worst.)
const TIER_NAME_CLASS: Record<Tier, string> = {
  S: "text-ink",
  A: "text-ink-2",
  B: "text-soft",
  C: "text-faint",
};

// Untiered (no rating for this muscle — 862 of 882 seed rows, and every
// hand-added custom exercise) must never read as tier S ("Best"): it means
// "unrated", not "top-rated". Rank it visually below C, not above it.
const UNTIERED_NAME_CLASS = "text-faint";

export function tierNameClass(tier: Tier | null | undefined): string {
  return tier ? TIER_NAME_CLASS[tier] : UNTIERED_NAME_CLASS;
}

// Key explaining the name-brightness scale. Brighter = better exercise.
export function TierLegend({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-x-3 gap-y-1 text-2xs",
        className,
      )}
    >
      <span className="text-faint">Exercise quality:</span>
      <span className="font-semibold text-ink">Best</span>
      <span className="font-semibold text-ink-2">Great</span>
      <span className="font-semibold text-soft">Good</span>
      <span className="font-semibold text-faint">Weak</span>
    </div>
  );
}

// S/A/B/C tier glyph — 16px square, tier encoded by fill strength so it
// stays legible without relying on color alone. Editor/ranking UI only.
export function TierBadge({
  tier,
  className,
}: {
  tier: Tier | null;
  className?: string;
}) {
  if (!tier) return null;
  return (
    <span
      className={cn(
        "num inline-flex size-4 shrink-0 items-center justify-center text-[10px] font-semibold leading-none",
        tier === "S" && "bg-accent text-accent-fg",
        tier === "A" && "bg-accent-soft text-ink",
        tier === "B" && "bg-translucent text-soft",
        tier === "C" && "border border-border text-faint",
        className,
      )}
      title={`${tier} tier`}
    >
      {tier}
    </span>
  );
}

// Reference diagram thumbnail (seed exercises only — docs/DECISIONS.md).
// Fixed white backing since source diagrams are transparent/white-background
// line art and must stay legible on the dark theme. "sm" (24px) for dense
// logging-path lists (session picker, block header); "lg" (64px) for the
// library ribbon, where the image is the primary visual anchor.
//
// Custom exercises never have a reference diagram, so a bare `null` here read
// as broken/missing rather than "no photo yet" — swap in a neutral dumbbell
// glyph instead. Deliberately monochrome (no per-muscle hue): the app has a
// single accent color (docs/brand/frog-brand-identity.html), so this reuses
// the same faint/surface-2 treatment as an untiered exercise name rather than
// inventing a color-coded palette.
export function ExerciseThumb({
  imageUrl,
  name,
  size = "sm",
  className,
}: {
  imageUrl: string | null | undefined;
  name: string;
  size?: "sm" | "lg";
  className?: string;
}) {
  return (
    <span
      className={cn(
        "flex shrink-0 items-center justify-center border border-border",
        imageUrl ? "bg-white" : "bg-surface-2",
        size === "sm" ? "size-6" : "size-16",
        className,
      )}
    >
      {imageUrl ? (
        <img
          src={imageUrl}
          alt={name}
          loading="lazy"
          className="size-full object-contain"
        />
      ) : (
        <Dumbbell
          className={cn("text-faint", size === "sm" ? "size-3.5" : "size-6")}
          aria-hidden
        />
      )}
    </span>
  );
}

// Per-exercise joint-action tiers (docs/DECISIONS.md ACTION_RATINGS): "S Knee
// extension", "S Hip extension" — the tier is looked up for THIS exercise's
// own target muscles, not a generic per-muscle list.
export function JointActionRatings({
  exercise,
  className,
}: {
  exercise: {
    jointActions: string[] | null;
    muscleTargets: { muscle: string; tier: Tier | null }[] | null;
  };
  className?: string;
}) {
  const ratings = ratingsForExercise(exercise);
  if (ratings.length === 0) return null;
  return (
    <span
      className={cn(
        "flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1",
        className,
      )}
    >
      {ratings.map((r) => (
        <span key={r.jointAction} className="shrink-0 text-2xs text-soft">
          {jointActionLabel(r.jointAction)}
        </span>
      ))}
    </span>
  );
}

// Favorite toggle — plain icon button rather than a menu: it's the only
// per-exercise quick action today, and a one-item dropdown/menu primitive
// isn't worth the extra dependency weight (bundle budget, docs/DECISIONS.md).
export function FavoriteButton({
  favorite,
  onToggle,
  name,
  disabled,
  className,
}: {
  favorite: boolean;
  onToggle: () => void;
  name: string;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
      disabled={disabled}
      title={
        disabled
          ? `${name} is still saving`
          : favorite
            ? `Unfavorite ${name}`
            : `Favorite ${name}`
      }
      aria-pressed={favorite}
      className={cn(
        "flex shrink-0 items-center justify-center p-1 transition-colors duration-150 ease-(--ease-out-quad)",
        favorite ? "text-accent" : "text-faint hover:text-soft",
        disabled && "opacity-50",
        className,
      )}
    >
      <Star className="size-4" fill={favorite ? "currentColor" : "none"} />
    </button>
  );
}

// The exercise "ribbon": big reference diagram anchors the row, the name
// carries the most weight, joint-action tiers sit right under it, and the
// machine (if any) is the smallest/faintest metadata. Shared by the Library
// list and the session exercise picker so both read the same way.
export function ExerciseRibbon({
  exercise,
  tier,
  machine,
  className,
}: {
  exercise: Exercise;
  tier?: Tier | null;
  machine?: Machine | null;
  className?: string;
}) {
  return (
    <div className={cn("flex w-full items-start gap-3", className)}>
      <ExerciseThumb
        imageUrl={exercise.imageUrl}
        name={exercise.name}
        size="lg"
      />
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-1.5">
          <span
            className={cn(
              "truncate text-sm font-semibold",
              tierNameClass(tier),
            )}
          >
            {exercise.name}
          </span>
        </div>
        <JointActionRatings exercise={exercise} className="mt-1.5" />
        {machine && (
          <div className="mt-1.5 flex items-center gap-1 truncate text-2xs text-faint">
            <Dumbbell className="size-3 shrink-0" />
            {machine.brand ? `${machine.brand} · ` : ""}
            {machine.name}
          </div>
        )}
      </div>
    </div>
  );
}

export function JointActionChips({
  actions,
  className,
}: {
  actions: string[] | null;
  className?: string;
}) {
  if (!actions?.length) return null;
  return (
    <span className={cn("flex min-w-0 items-center gap-1", className)}>
      {actions.map((a) => (
        <span
          key={a}
          className="truncate bg-translucent px-1 text-2xs text-faint"
        >
          {jointActionLabel(a)}
        </span>
      ))}
    </span>
  );
}
