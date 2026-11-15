// Tier 1: hand-curated classification of the exercises the research programs
// and Frog's templates actually use (PROGRAM-RULES.md R7, R12, R12b, R14).
// Keyed by exact seed name; the unit test fails if a name stops resolving.
//
// Target spec grammar, `;`-separated: `muscle weight [p|s] [region] [L]`
//   weight  explicit credit per hard set (R7: direct 1, indirect 0.5, 0 = not
//           credited by the programs' own set sums)
//   p|s     role override (default: first listed muscle primary, rest secondary)
//   region  R12b regional head      L  lengthened-loading bias (R14: descriptive)
// A seed muscle not listed keeps role "secondary", weight 0.
import type {
  Mechanic,
  MovementPattern,
} from "../../packages/core/src/domain/exercise-types";

export type Curated = {
  ja: string[];
  mech: Mechanic;
  pat: MovementPattern;
  t: string;
};

const SQUAT_JA = ["knee-extension", "hip-extension"];
const PRESS_H = ["shoulder-horizontal-adduction", "elbow-extension"];
const PRESS_INC = [
  "shoulder-horizontal-adduction",
  "shoulder-flexion",
  "elbow-extension",
];
const PRESS_V = ["shoulder-flexion", "elbow-extension"];
const ROW_JA = ["shoulder-extension", "scapular-retraction", "elbow-flexion"];
const PULL_V = ["shoulder-adduction", "elbow-flexion"];
const HINGE = ["hip-extension", "spinal-extension"];

const squat = (t: string): Curated => ({
  ja: SQUAT_JA,
  mech: "compound",
  pat: "squat",
  t,
});
const lunge = (t: string): Curated => ({
  ja: SQUAT_JA,
  mech: "compound",
  pat: "lunge",
  t,
});
const hinge = (t: string, ja = HINGE): Curated => ({
  ja,
  mech: "compound",
  pat: "hinge",
  t,
});
const pressH = (t: string, ja = PRESS_H): Curated => ({
  ja,
  mech: "compound",
  pat: "horizontal-push",
  t,
});
const pressV = (t: string): Curated => ({
  ja: PRESS_V,
  mech: "compound",
  pat: "vertical-push",
  t,
});
const row = (t: string): Curated => ({
  ja: ROW_JA,
  mech: "compound",
  pat: "horizontal-pull",
  t,
});
const pull = (t: string): Curated => ({
  ja: PULL_V,
  mech: "compound",
  pat: "vertical-pull",
  t,
});
const iso = (ja: string, t: string): Curated => ({
  ja: [ja],
  mech: "isolation",
  pat: "isolation",
  t,
});

const ROW_T =
  "lats 1 p; mid-traps-rhomboids 1 p; biceps .5; rear-delts 0; front-delts 0";
const PULLDOWN_T =
  "lats 1 p; biceps .5; teres-major 0; mid-traps-rhomboids 0; front-delts 0";
const PRESS_T = "pecs 1 p; triceps .5; front-delts 0";
const CURL_T = "biceps 1 p";
const PUSHDOWN_T = "triceps 1 p";
const CALF_T = "calves 1 p gastrocnemius";
const CURL_LEG_T = "hamstrings 1 p";

export const CURATED: Record<string, Curated> = {
  // --- quads / squat pattern (R12b: vasti vs rectus femoris)
  Squat: squat("quads 1 p vasti; glutes .5; adductors 0"),
  "Front Squat": squat("quads 1 p vasti; glutes .5"),
  "Leg Press": squat("quads 1 p vasti; glutes .5; adductors 0"),
  "Hack Squat": squat("quads 1 p vasti; glutes .5; hamstrings 0; calves 0"),
  "Smith Machine Squat": squat(
    "quads 1 p vasti; glutes .5; hamstrings 0; calves 0; erectors 0",
  ),
  "Split Squat with Dumbbells": lunge(
    "quads 1 p vasti; glutes .5; hamstrings 0",
  ),
  "Leg Extension": iso("knee-extension", "quads 1 p rectus-femoris L"),
  "Leg Extensions": iso("knee-extension", "quads 1 p rectus-femoris L"),
  // --- hinge / hamstrings / glutes
  "Romanian Deadlift": hinge("hamstrings 1 p L; glutes .5; erectors 0"),
  "Stiff-Legged Barbell Deadlift": hinge(
    "hamstrings 1 p L; glutes .5; erectors 0",
  ),
  Deadlift: hinge("glutes 1 p; hamstrings 1 p; erectors .5; quads 0", [
    "hip-extension",
    "knee-extension",
    "spinal-extension",
  ]),
  "Barbell Hip Thrust": {
    ja: ["hip-extension"],
    mech: "compound",
    pat: "hinge",
    t: "glutes 1 p; hamstrings 0; calves 0",
  },
  "Hyperextensions (Back Extensions)": hinge(
    "erectors 1 p; glutes .5; hamstrings 0",
  ),
  "Leg Curl": iso("knee-flexion", CURL_LEG_T),
  "Lying Leg Curls": iso("knee-flexion", CURL_LEG_T),
  "Seated Leg Curl": iso("knee-flexion", "hamstrings 1 p L"),
  // --- calves (gastrocnemius straight knee; soleus bent knee, R12b)
  "Calf Raise": iso("ankle-plantarflexion", CALF_T),
  "Standing Calf Raises": iso("ankle-plantarflexion", CALF_T),
  "Calf Press": iso("ankle-plantarflexion", CALF_T),
  "Smith Machine Calf Raise": iso("ankle-plantarflexion", CALF_T),
  "Seated Calf Raise": iso("ankle-plantarflexion", "calves 1 p soleus"),
  // --- chest
  "Bench Press": pressH(PRESS_T),
  "Dumbbell Bench Press": pressH(PRESS_T),
  "Dumbbell Bench Press with Neutral Grip": pressH(PRESS_T),
  "Smith Machine Bench Press": pressH(PRESS_T),
  "Incline Bench Press": pressH(
    "upper-pecs 1 p; triceps .5; front-delts 0",
    PRESS_INC,
  ),
  "Incline Dumbbell Press": pressH(
    "pecs 1 p; triceps .5; front-delts 0",
    PRESS_INC,
  ),
  "Incline Cable Chest Press": pressH(
    "pecs 1 p; triceps .5; front-delts 0",
    PRESS_INC,
  ),
  "Dips - Chest Version": pressH(PRESS_T),
  Butterfly: iso("shoulder-horizontal-adduction", "pecs 1 p"),
  "Cable Crossover": iso(
    "shoulder-horizontal-adduction",
    "pecs 1 p; front-delts 0",
  ),
  "Dumbbell Flyes": iso("shoulder-horizontal-adduction", "pecs 1 p"),
  // --- shoulders
  "Overhead Press": pressV("front-delts 1 p; triceps .5; upper-pecs 0"),
  "Machine Shoulder (Military) Press": pressV("front-delts 1 p; triceps .5"),
  "Arnold Dumbbell Press": pressV("front-delts 1 p; triceps .5"),
  "Lateral Raise": iso("shoulder-abduction", "side-delts 1 p"),
  "Side Lateral Raise": iso("shoulder-abduction", "side-delts 1 p"),
  "Reverse Flyes": iso("shoulder-horizontal-abduction", "rear-delts 1 p"),
  "Face Pull": {
    ja: [
      "shoulder-horizontal-abduction",
      "external-rotation",
      "scapular-retraction",
    ],
    mech: "compound",
    pat: "horizontal-pull",
    t: "rear-delts 1 p; rotator-cuff 0; mid-traps-rhomboids 0",
  },
  // --- back (program A counts mid back equal to lats, R7)
  "Barbell Row": row(ROW_T),
  "Bent Over Barbell Row": row(ROW_T),
  "Seated Cable Row": row(ROW_T),
  "Seated Cable Rows": row(ROW_T),
  "One-Arm Dumbbell Row": row(ROW_T),
  "T-Bar Row with Handle": row(ROW_T),
  "Lat Pulldown": pull(PULLDOWN_T),
  "Wide-Grip Lat Pulldown": pull(PULLDOWN_T),
  "Pull-Up": pull(PULLDOWN_T),
  Pullups: pull(PULLDOWN_T),
  "Chin-Up": pull("lats 1 p; biceps .5; forearms 0; mid-traps-rhomboids 0"),
  // --- arms (R12b: incline favours biceps brachii, overhead lengthens long head)
  "Bicep Curl": iso(
    "elbow-flexion",
    "biceps 1 p; brachialis-brachioradialis 0",
  ),
  "Barbell Curl": iso("elbow-flexion", "biceps 1 p; forearms 0"),
  "EZ-Bar Curl": iso("elbow-flexion", CURL_T),
  "Incline Dumbbell Curl": iso("elbow-flexion", "biceps 1 p biceps-brachii L"),
  "Preacher Curl": iso("elbow-flexion", "biceps 1 p"),
  "Overhead Cable Curl": iso("elbow-flexion", CURL_T),
  "Hammer Curls": iso("elbow-flexion", "biceps 1 p"),
  "Incline Hammer Curls": iso("elbow-flexion", "biceps 1 p"),
  "Tricep Pushdown": iso("elbow-extension", PUSHDOWN_T),
  "Triceps Pushdown": iso("elbow-extension", PUSHDOWN_T),
  "Triceps Pushdown - Rope Attachment": iso("elbow-extension", PUSHDOWN_T),
  "Triceps Pushdown - V-Bar Attachment": iso("elbow-extension", PUSHDOWN_T),
  "Triceps Overhead Extension with Rope": iso(
    "elbow-extension",
    "triceps 1 p long-head L",
  ),
  "Lying Triceps Press": iso("elbow-extension", PUSHDOWN_T),
  "Tricep Dumbbell Kickback": iso("elbow-extension", PUSHDOWN_T),
  "Dips - Triceps Version": pressH("triceps 1 p; pecs .5; front-delts 0"),
  // --- core
  "Cable Crunch": iso("spinal-flexion", "abs 1 p"),
  "Hanging Leg Raise": iso("hip-flexion", "abs 1 p"),
};
