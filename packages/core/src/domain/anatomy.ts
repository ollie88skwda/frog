// Anatomy vocabulary: muscles, joint actions, and evidence-informed tier
// ratings for how well a joint action trains a muscle. Ratings carry nuance
// notes (ROM, grip, position) and citations where the literature supports
// them; thin evidence is flagged as a judgment call. See docs/DECISIONS.md.

export type Muscle = { key: string; label: string };

export const MUSCLES: readonly Muscle[] = [
  { key: "quads", label: "Quads" },
  { key: "hamstrings", label: "Hamstrings" },
  { key: "glutes", label: "Glutes" },
  { key: "adductors", label: "Adductors" },
  { key: "glute-med", label: "Glute med" },
  { key: "calves", label: "Calves" },
  { key: "hip-flexors", label: "Hip flexors" },
  { key: "pecs", label: "Pecs" },
  { key: "upper-pecs", label: "Upper pecs" },
  { key: "front-delts", label: "Front delts" },
  { key: "side-delts", label: "Side delts" },
  { key: "rear-delts", label: "Rear delts" },
  { key: "lats", label: "Lats" },
  { key: "teres-major", label: "Teres major" },
  { key: "mid-traps-rhomboids", label: "Mid traps / rhomboids" },
  { key: "upper-traps", label: "Upper traps" },
  { key: "rotator-cuff", label: "Rotator cuff" },
  { key: "biceps", label: "Biceps" },
  { key: "brachialis-brachioradialis", label: "Brachialis / brachioradialis" },
  { key: "triceps", label: "Triceps" },
  { key: "forearms", label: "Forearms" },
  { key: "erectors", label: "Erectors" },
  { key: "abs", label: "Abs" },
] as const;

// Coarse region rollup for distribution charts + the body heat map
// (Hevy-parity plan §C): 23 muscles → 6 regions. Muscles not listed fall
// under "other" (excluded from region charts).
export const MUSCLE_REGIONS = [
  "chest",
  "back",
  "legs",
  "shoulders",
  "arms",
  "core",
] as const;
export type MuscleRegion = (typeof MUSCLE_REGIONS)[number];

export const MUSCLE_REGION_LABELS: Record<MuscleRegion, string> = {
  chest: "Chest",
  back: "Back",
  legs: "Legs",
  shoulders: "Shoulders",
  arms: "Arms",
  core: "Core",
};

export const MUSCLE_REGION: Record<string, MuscleRegion> = {
  quads: "legs",
  hamstrings: "legs",
  glutes: "legs",
  adductors: "legs",
  "glute-med": "legs",
  calves: "legs",
  "hip-flexors": "legs",
  pecs: "chest",
  "upper-pecs": "chest",
  "front-delts": "shoulders",
  "side-delts": "shoulders",
  "rear-delts": "shoulders",
  "rotator-cuff": "shoulders",
  lats: "back",
  "teres-major": "back",
  "mid-traps-rhomboids": "back",
  "upper-traps": "back",
  erectors: "back",
  biceps: "arms",
  "brachialis-brachioradialis": "arms",
  triceps: "arms",
  forearms: "arms",
  abs: "core",
};

export function regionOf(muscleKey: string): MuscleRegion | null {
  return MUSCLE_REGION[muscleKey] ?? null;
}

export type JointAction = { key: string; label: string; note?: string };

export const JOINT_ACTIONS: readonly JointAction[] = [
  { key: "knee-extension", label: "Knee extension" },
  {
    key: "knee-flexion",
    label: "Knee flexion",
    note: "Seated (hip flexed) trains hamstrings at longer length than lying.",
  },
  { key: "hip-extension", label: "Hip extension" },
  { key: "hip-flexion", label: "Hip flexion" },
  { key: "hip-adduction", label: "Hip adduction" },
  { key: "hip-abduction", label: "Hip abduction" },
  {
    key: "ankle-plantarflexion",
    label: "Ankle plantar flexion",
    note: "Straight knee biases gastrocnemius; bent knee biases soleus.",
  },
  { key: "shoulder-horizontal-adduction", label: "Horizontal adduction" },
  { key: "shoulder-horizontal-abduction", label: "Horizontal abduction" },
  { key: "shoulder-flexion", label: "Shoulder flexion" },
  { key: "shoulder-extension", label: "Shoulder extension" },
  { key: "shoulder-abduction", label: "Shoulder abduction" },
  { key: "shoulder-adduction", label: "Shoulder adduction" },
  {
    key: "elbow-flexion",
    label: "Elbow flexion",
    note: "Supinated grip biases biceps; pronated/neutral biases brachialis + brachioradialis. Biceps works hardest ~20–90°; past 90° brachialis takes over.",
  },
  {
    key: "elbow-extension",
    label: "Elbow extension",
    note: "Overhead (shoulder flexed) lengthens and biases the long head.",
  },
  { key: "external-rotation", label: "External rotation" },
  { key: "scapular-retraction", label: "Scapular retraction" },
  { key: "scapular-elevation", label: "Scapular elevation" },
  { key: "spinal-extension", label: "Spinal extension" },
  { key: "spinal-flexion", label: "Spinal flexion" },
  { key: "wrist-flexion-extension", label: "Wrist flexion/extension" },
] as const;

export type Tier = "S" | "A" | "B" | "C";

export type ActionRating = {
  muscle: string;
  jointAction: string;
  tier: Tier;
  note?: string;
  citations?: string[]; // PMIDs / DOIs
};

// Evidence-informed judgment calls; citations attached where verified.
// Merged/refined from an EMG/MRI/hypertrophy literature pass — where a rating
// lacks citations, treat it as expert judgment, not settled science.
export const ACTION_RATINGS: readonly ActionRating[] = [
  {
    muscle: "quads",
    jointAction: "knee-extension",
    tier: "S",
    note: "Sole primary action of all four heads. Long muscle length (deep knee flexion / lengthened-partial leg extension, ~100–65°) drives more growth, especially distal vasti, vs shortened range.",
    citations: ["doi:10.1080/17461391.2021.1927199", "PMID:31230110"],
  },
  {
    muscle: "quads",
    jointAction: "hip-flexion",
    tier: "C",
    note: "Only the biarticular rectus femoris contributes; the three vasti do not cross the hip. RF is trained best when the hip is extended (lengthened), e.g. RF works harder in leg extension than in squats. Judgment call — indirect evidence.",
  },
  {
    muscle: "hamstrings",
    jointAction: "knee-flexion",
    tier: "S",
    note: "Primary action. Seated leg curl (hip flexed = hamstrings lengthened) produces markedly greater growth of semitendinosus, semimembranosus and biceps femoris long head than lying leg curl; short head grows similarly either way.",
    citations: ["PMID:33009197"],
  },
  {
    muscle: "hamstrings",
    jointAction: "hip-extension",
    tier: "S",
    note: "The three biarticular heads (BFlh, ST, SM) are powerful hip extensors; trained via RDL / stiff-leg deadlift / good-morning at long length. Biases the proximal hamstrings, complementing knee-flexion work. Well-established functional anatomy.",
  },
  {
    muscle: "glutes",
    jointAction: "hip-extension",
    tier: "S",
    note: "Gluteus maximus is the prime hip extensor. Deep squat depth (to ~140° knee flexion) yields significantly greater glute max volume than half squats; peak activity biased toward the flexed-hip (bottom) position.",
    citations: ["PMID:31230110"],
  },
  {
    muscle: "glutes",
    jointAction: "hip-abduction",
    tier: "B",
    note: "Upper/superior gluteus maximus fibers contribute to hip abduction, but it is a secondary role behind extension. Judgment call — limited direct evidence for glute max specifically vs glute med.",
  },
  {
    muscle: "glutes",
    jointAction: "external-rotation",
    tier: "C",
    note: "Gluteus maximus externally rotates the femur, but loading it in isolation for hypertrophy is impractical and unproven. Judgment call — limited direct evidence.",
  },
  {
    muscle: "adductors",
    jointAction: "hip-adduction",
    tier: "S",
    note: "Primary action of the adductor group (longus, brevis, gracilis, pectineus, and adductor portion of magnus). Trained via machine adduction, Copenhagen, sumo/wide stance work.",
  },
  {
    muscle: "adductors",
    jointAction: "hip-extension",
    tier: "A",
    note: "Adductor magnus (posterior/'hamstring' portion) is a major hip extensor — the biggest hip extensor torque contributor in the deep squat. Deep squats grow adductors significantly more than half squats; RDLs/hip thrusts also load it.",
    citations: ["PMID:31230110"],
  },
  {
    muscle: "adductors",
    jointAction: "hip-flexion",
    tier: "C",
    note: "Anterior adductors (longus, pectineus) assist hip flexion from an extended position but the moment reverses with hip angle. Minor stimulus. Judgment call — limited direct evidence.",
  },
  {
    muscle: "adductors",
    jointAction: "knee-flexion",
    tier: "C",
    note: "Only gracilis crosses the knee and weakly assists flexion; not a meaningful hypertrophy driver for the group. Judgment call — limited direct evidence.",
  },
  {
    muscle: "glute-med",
    jointAction: "hip-abduction",
    tier: "S",
    note: "Prime mover of hip abduction. Side-lying hip abduction elicits the highest gluteus medius EMG (~81% MVIC), above single-leg squat and single-leg deadlift.",
    citations: ["PMID:19574661"],
  },
  {
    muscle: "glute-med",
    jointAction: "hip-extension",
    tier: "C",
    note: "Posterior fibers assist hip extension, but this is minor relative to abduction. Judgment call — limited direct evidence.",
  },
  {
    muscle: "glute-med",
    jointAction: "external-rotation",
    tier: "C",
    note: "Posterior fibers externally rotate and anterior fibers internally rotate the hip; rotation is a stabilizing role, not a primary hypertrophy driver. Judgment call — limited direct evidence.",
  },
  {
    muscle: "calves",
    jointAction: "ankle-plantarflexion",
    tier: "S",
    note: "Primary action of gastrocnemius + soleus. Knee angle partitions the two: standing/knee-extended (gastroc lengthened) grows gastrocnemius far more (LG +12.4%, MG +9.2% vs ~1% seated); seated/knee-flexed shifts work to soleus.",
    citations: ["PMID:38156065"],
  },
  {
    muscle: "calves",
    jointAction: "knee-flexion",
    tier: "C",
    note: "Gastrocnemius weakly assists knee flexion but is not meaningfully trained by it; its knee crossing matters instead because knee EXTENSION lengthens it for plantarflexion work. Judgment call.",
    citations: ["PMID:38156065"],
  },
  {
    muscle: "hip-flexors",
    jointAction: "hip-flexion",
    tier: "S",
    note: "Iliopsoas is the prime hip flexor and dominates above ~90° of flexion (e.g. hanging leg raise top range, seated leg raises); rectus femoris and TFL/sartorius assist. Primary action.",
  },
  {
    muscle: "hip-flexors",
    jointAction: "knee-extension",
    tier: "C",
    note: "Rectus femoris (a hip flexor) also extends the knee, so leg extensions give it some stimulus, but iliopsoas — the largest hip flexor — is unaffected. Judgment call.",
  },
  {
    muscle: "hip-flexors",
    jointAction: "spinal-flexion",
    tier: "C",
    note: "Psoas major attaches to the lumbar spine and contributes to lumbar posture/stability; it is not a true trunk flexor and can drive anterior pelvic tilt. Judgment call — limited direct evidence.",
  },
  {
    muscle: "pecs",
    jointAction: "shoulder-horizontal-adduction",
    tier: "S",
    note: "Primary action of the sternocostal (main) pec — flat press and flye. Flat/low bench angle biases the sternal head over clavicular.",
    citations: ["PMID:33049982"],
  },
  {
    muscle: "pecs",
    jointAction: "shoulder-flexion",
    tier: "A",
    note: "Pressing/raising the arm forward strongly recruits pec major; the pressing pattern combines flexion with horizontal adduction. Anterior deltoid shares this action.",
    citations: ["PMID:33049982"],
  },
  {
    muscle: "pecs",
    jointAction: "shoulder-adduction",
    tier: "B",
    note: "Lower/sternal fibers drive shoulder adduction and extension (dips, decline, high-to-low cable crossover), biasing the lower pec. Judgment call — moderate evidence.",
  },
  {
    muscle: "upper-pecs",
    jointAction: "shoulder-flexion",
    tier: "S",
    note: "Clavicular head's best driver: incline pressing at ~30–45° maximizes clavicular EMG (peaks near 43°); low-to-high cable/flye also biases it. Higher inclines shift work to anterior deltoid.",
    citations: ["PMID:33049982"],
  },
  {
    muscle: "upper-pecs",
    jointAction: "shoulder-horizontal-adduction",
    tier: "A",
    note: "Clavicular head assists horizontal adduction; incline flye at a moderate angle biases it more than flat flye.",
    citations: ["PMID:33049982"],
  },
  {
    muscle: "upper-pecs",
    jointAction: "shoulder-abduction",
    tier: "C",
    note: "Clavicular fibers assist early shoulder abduction/elevation but this is a minor role. Judgment call — limited direct evidence.",
  },
  {
    muscle: "front-delts",
    jointAction: "shoulder-flexion",
    tier: "S",
    note: "Anterior deltoid is a prime shoulder flexor — front raise and all overhead/incline pressing. Anterior delt EMG rises with bench incline angle.",
    citations: ["PMID:33049982"],
  },
  {
    muscle: "front-delts",
    jointAction: "shoulder-horizontal-adduction",
    tier: "A",
    note: "Anterior delt strongly assists bringing the arm across the body (flat/incline press and flye).",
    citations: ["PMID:33049982"],
  },
  {
    muscle: "front-delts",
    jointAction: "shoulder-abduction",
    tier: "B",
    note: "Anterior fibers contribute to abduction, especially in the scapular plane and with some internal rotation. Secondary to lateral delt. Judgment call — moderate evidence.",
  },
  {
    muscle: "side-delts",
    jointAction: "shoulder-abduction",
    tier: "S",
    note: "Middle deltoid is the prime mover of shoulder abduction (lateral raise); a slightly internally-rotated/high-elbow path maximizes its EMG. Cable/lengthened-bottom variants add stretch tension.",
  },
  {
    muscle: "side-delts",
    jointAction: "shoulder-flexion",
    tier: "C",
    note: "Middle delt is recruited somewhat during pressing/front raises but abduction is its defining action. Judgment call.",
  },
  {
    muscle: "rear-delts",
    jointAction: "shoulder-horizontal-abduction",
    tier: "S",
    note: "Posterior deltoid's primary action — reverse flye / rear-delt row with the elbow high. A neutral (thumbs-up) grip biases the rear delt over a pronated grip. Judgment-supported by EMG hand-position work.",
  },
  {
    muscle: "rear-delts",
    jointAction: "shoulder-extension",
    tier: "A",
    note: "Posterior delt strongly assists pulling the arm backward (rows, straight-arm extensions), overlapping with lat/teres work.",
  },
  {
    muscle: "rear-delts",
    jointAction: "shoulder-abduction",
    tier: "C",
    note: "Contributes to abduction when the arm is behind the scapular plane, but a minor role. Judgment call — limited direct evidence.",
  },
  {
    muscle: "rear-delts",
    jointAction: "external-rotation",
    tier: "C",
    note: "Posterior fibers assist external rotation, but the rotator cuff drives that action; minor stimulus. Judgment call — limited direct evidence.",
  },
  {
    muscle: "lats",
    jointAction: "shoulder-adduction",
    tier: "S",
    note: "Pulldown pattern (adducting the raised arm). Wide pronated grip pulled in front of the head gives the highest lat EMG; overhead start puts the lat at long length. Prime action.",
    citations: ["doi:10.3390/jfmk10030345"],
  },
  {
    muscle: "lats",
    jointAction: "shoulder-extension",
    tier: "S",
    note: "Latissimus is a powerful shoulder extensor — rows and straight-arm pulldowns/pullovers. Pullover loads it at a long, overhead-stretched length. Peak lat EMG occurs in maximal isometric shoulder extension.",
  },
  {
    muscle: "lats",
    jointAction: "shoulder-horizontal-abduction",
    tier: "B",
    note: "Contributes during rowing when the elbow travels out and back, but adduction/extension are its main hypertrophy drivers. Judgment call — moderate evidence.",
  },
  {
    muscle: "teres-major",
    jointAction: "shoulder-adduction",
    tier: "A",
    note: "'Lat's little helper' — mirrors latissimus in adduction, extension and internal rotation; heavily recruited in pulldowns and rows. Judgment call — well-established anatomy, limited isolation data.",
  },
  {
    muscle: "teres-major",
    jointAction: "shoulder-extension",
    tier: "A",
    note: "Powerful shoulder extensor alongside the lat (rows, straight-arm pulldowns). Judgment call — well-established anatomy.",
  },
  {
    muscle: "teres-major",
    jointAction: "shoulder-horizontal-abduction",
    tier: "C",
    note: "Assists during wide rowing, minor. Judgment call — limited direct evidence.",
  },
  {
    muscle: "mid-traps-rhomboids",
    jointAction: "scapular-retraction",
    tier: "S",
    note: "Middle trapezius and rhomboids are the prime scapular retractors — rows and reverse flyes performed with a deliberate squeeze; rhomboids also downwardly rotate the scapula. Primary action.",
  },
  {
    muscle: "mid-traps-rhomboids",
    jointAction: "shoulder-horizontal-abduction",
    tier: "A",
    note: "Rear-delt-style horizontal abduction is coupled with scapular retraction, so these muscles are strongly co-recruited when the movement finishes with a retraction.",
  },
  {
    muscle: "mid-traps-rhomboids",
    jointAction: "scapular-elevation",
    tier: "C",
    note: "Rhomboids assist scapular elevation, but upper traps dominate that action. Judgment call — limited direct evidence.",
  },
  {
    muscle: "upper-traps",
    jointAction: "scapular-elevation",
    tier: "S",
    note: "Upper trapezius is the prime scapular elevator (shrugs) and, with lower traps, drives upward rotation. Primary action.",
  },
  {
    muscle: "upper-traps",
    jointAction: "scapular-retraction",
    tier: "C",
    note: "Assists retraction but the middle traps/rhomboids lead it. Judgment call — limited direct evidence.",
  },
  {
    muscle: "upper-traps",
    jointAction: "shoulder-abduction",
    tier: "C",
    note: "Contributes to scapular upward rotation that permits arm abduction overhead (force-couple), rather than moving the humerus directly. Judgment call.",
  },
  {
    muscle: "rotator-cuff",
    jointAction: "external-rotation",
    tier: "S",
    note: "Infraspinatus and teres minor are the prime external rotators; side-lying ER at 0° abduction gives the highest infraspinatus (~62% MVIC) and teres minor (~67%) activation, with a towel-roll under the arm adding ~20–25%.",
    citations: ["doi:10.2519/jospt.2004.34.7.385"],
  },
  {
    muscle: "rotator-cuff",
    jointAction: "shoulder-abduction",
    tier: "B",
    note: "Supraspinatus initiates the first ~30° of abduction and stabilizes the humeral head throughout; subscapularis/infraspinatus provide compression. Secondary to isolated ER work. Judgment call.",
  },
  {
    muscle: "rotator-cuff",
    jointAction: "shoulder-flexion",
    tier: "C",
    note: "Supraspinatus assists elevation and the cuff stabilizes during flexion, but this is a stabilizing role, not a growth driver. Judgment call — limited direct evidence.",
  },
  {
    muscle: "biceps",
    jointAction: "elbow-flexion",
    tier: "S",
    note: "Primary action. Biceps bias is greatest with a SUPINATED grip and in the 20–90° range; beyond ~90° and with pronated/neutral grips the load shifts to brachialis/brachioradialis. Supinated grip shows lower brachioradialis co-excitation than pronated/neutral.",
    citations: ["doi:10.3390/sports11030064"],
  },
  {
    muscle: "biceps",
    jointAction: "shoulder-flexion",
    tier: "B",
    note: "The long head crosses the shoulder, so training with the shoulder EXTENDED (incline/Bayesian cable curl) lengthens it and biases proximal biceps growth vs a flexed-shoulder preacher curl (which biases distal/brachialis).",
    citations: ["doi:10.1002/ejsc.12279"],
  },
  {
    muscle: "brachialis-brachioradialis",
    jointAction: "elbow-flexion",
    tier: "S",
    note: "Primary action. Brachialis (the strongest pure elbow flexor, works in every grip) and brachioradialis are biased by a PRONATED or NEUTRAL grip and by flexion beyond ~90°; both show greater excitation than the biceps under pronated/neutral grips (hammer/reverse curls).",
    citations: ["doi:10.3390/sports11030064"],
  },
  {
    muscle: "triceps",
    jointAction: "elbow-extension",
    tier: "S",
    note: "Primary action of all three heads. Overhead (shoulder-flexed) positioning lengthens the long head and produced ~20% triceps growth vs ~13.5% in a neutral position over 12 weeks.",
    citations: ["PMID:35819335", "doi:10.1080/17461391.2022.2100279"],
  },
  {
    muscle: "triceps",
    jointAction: "shoulder-extension",
    tier: "B",
    note: "The long head crosses the shoulder and extends/adducts it; overhead extensions place it at long length, whereas pushdowns (shoulder neutral) understimulate the long head. Complementary to elbow-extension work.",
    citations: ["PMID:35819335"],
  },
  {
    muscle: "triceps",
    jointAction: "shoulder-adduction",
    tier: "C",
    note: "Long head assists shoulder adduction/extension; a minor secondary contribution. Judgment call — limited direct evidence.",
  },
  {
    muscle: "erectors",
    jointAction: "spinal-extension",
    tier: "S",
    note: "Erector spinae are the prime spinal extensors — back extensions / hyperextensions and the dynamic component of good-mornings. Primary action.",
  },
  {
    muscle: "erectors",
    jointAction: "hip-extension",
    tier: "B",
    note: "During hip-hinge loading (deadlift, RDL) the erectors contract isometrically to resist spinal flexion, receiving heavy static stimulus even though the movement occurs at the hip. Judgment call — well-established.",
  },
  {
    muscle: "abs",
    jointAction: "spinal-flexion",
    tier: "S",
    note: "Rectus abdominis is the prime trunk flexor (crunches, cable crunch, hanging shoulder-driven curls); posterior pelvic tilt at the bottom increases the stretch. Primary action.",
  },
  {
    muscle: "abs",
    jointAction: "hip-flexion",
    tier: "C",
    note: "In leg/knee raises the rectus abdominis works largely as a stabilizer / posterior pelvic tilter while the iliopsoas flexes the hip; abs are trained best when the spine flexes, not the hip. Judgment call.",
  },
  {
    muscle: "forearms",
    jointAction: "wrist-flexion-extension",
    tier: "S",
    note: "Judgment call — direct wrist work isolates forearm flexors/extensors; limited direct hypertrophy evidence.",
  },
  {
    muscle: "forearms",
    jointAction: "elbow-flexion",
    tier: "B",
    note: "Brachioradialis loading with pronated/neutral grips; grip work from heavy pulls.",
  },
] as const;

// tier null = unclassified (the free-exercise-db seed batch ships untiered;
// classification is incremental). Untiered sorts below C in library grouping.
// role is optional for back-compat with every jsonb value written before it
// existed — see roleAt, the one place that resolves the absent case.
export type MuscleRole = "primary" | "secondary";
export type MuscleTarget = {
  muscle: string;
  tier: Tier | null;
  role?: MuscleRole;
};

/**
 * Role of the i-th target. Back-compat rule: an absent `role` means index 0
 * is primary and everything after it is secondary (the pre-role convention
 * every existing row was written under) — this is the only place that rule
 * should be read, so a future second primary never has to duplicate it.
 */
export function roleAt(
  targets: readonly MuscleTarget[],
  i: number,
): MuscleRole {
  return targets[i].role ?? (i === 0 ? "primary" : "secondary");
}

/** Muscle keys with role "primary" (explicit, or index 0 under back-compat). */
export function primaryMuscles(
  targets: readonly MuscleTarget[] | null,
): string[] {
  const list = targets ?? [];
  return list
    .filter((_, i) => roleAt(list, i) === "primary")
    .map((t) => t.muscle);
}

/** Muscle keys with role "secondary" (explicit, or index > 0 under back-compat). */
export function secondaryMuscles(
  targets: readonly MuscleTarget[] | null,
): string[] {
  const list = targets ?? [];
  return list
    .filter((_, i) => roleAt(list, i) === "secondary")
    .map((t) => t.muscle);
}

const MUSCLE_BY_KEY = new Map(MUSCLES.map((m) => [m.key, m]));
export const JOINT_ACTION_BY_KEY: ReadonlyMap<string, JointAction> = new Map(
  JOINT_ACTIONS.map((a) => [a.key, a]),
);

export function muscleLabel(key: string): string {
  return MUSCLE_BY_KEY.get(key)?.label ?? key;
}

// Alternate names for muscles, resolved by free-text search so a query like
// "front shoulders" finds the front delts. Mirrors the MatchCandidate.aliases
// precedent (match-exercise.ts): the label is the primary name, these are
// extra strings that resolve to the same muscle — the captain's preference is
// the more universal term, but searching the label works too.
// Colloquial *region* names ("chest", "shoulders", "back", …) don't need an
// entry here: MUSCLE_REGION already owns muscle→region membership for the heat
// map and region charts, and muscleLabelMatches reads it directly, so every
// muscle in a region is searchable by that region's name. Don't add new region
// names below — a second copy of that mapping drifts (rotator-cuff is a
// shoulder in MUSCLE_REGION but had no "shoulders" alias here, so a search for
// "shoulders" used to skip it).
export const MUSCLE_ALIASES: Record<string, readonly string[]> = {
  pecs: ["chest"],
  "upper-pecs": ["upper chest"],
  "front-delts": ["front shoulders", "anterior deltoids", "front deltoids"],
  "side-delts": [
    "side shoulders",
    "lateral deltoids",
    "lateral delts",
    "side deltoids",
  ],
  "rear-delts": ["rear shoulders", "posterior deltoids", "rear deltoids"],
};

/**
 * Does a lowercased query match this muscle's label, its coarse region label,
 * or any of its aliases? Substring match on all three, so "chest" finds both
 * "Pecs" and "Upper pecs" (via the chest region) and "upper chest" finds only
 * the latter (via its alias).
 */
export function muscleLabelMatches(muscleKey: string, q: string): boolean {
  if (muscleLabel(muscleKey).toLowerCase().includes(q)) return true;
  const region = MUSCLE_REGION[muscleKey];
  if (region && MUSCLE_REGION_LABELS[region].toLowerCase().includes(q))
    return true;
  return (MUSCLE_ALIASES[muscleKey] ?? []).some((a) => a.includes(q));
}

export function jointActionLabel(key: string): string {
  return JOINT_ACTION_BY_KEY.get(key)?.label ?? key;
}

const TIER_ORDER: Record<Tier, number> = { S: 0, A: 1, B: 2, C: 3 };

/** Sort rank for a possibly-null tier — untiered ranks below C. */
export function tierRank(tier: Tier | null | undefined): number {
  return tier ? TIER_ORDER[tier] : 4;
}

/** Ranked joint actions for a muscle (S first), from ACTION_RATINGS. */
export function ratingsForMuscle(muscle: string): ActionRating[] {
  return ACTION_RATINGS.filter((r) => r.muscle === muscle).sort(
    (a, b) => TIER_ORDER[a.tier] - TIER_ORDER[b.tier],
  );
}

export type ExerciseJointActionRating = {
  jointAction: string;
  tier: Tier | null; // null when no ACTION_RATINGS entry matches
  muscle: string | null;
};

/**
 * Per-exercise joint-action tiers: for each of the exercise's joint actions,
 * the best (lowest-tier-number) ACTION_RATINGS match among the exercise's own
 * target muscles. E.g. Front Squat (quads, glutes) × knee-extension → S
 * (quads), × hip-extension → S (glutes). Falls back to tier: null (label only)
 * when no rating exists for that muscle/action pair.
 */
export function ratingsForExercise(exercise: {
  jointActions: string[] | null;
  muscleTargets: MuscleTarget[] | null;
}): ExerciseJointActionRating[] {
  const muscles = exercise.muscleTargets?.map((t) => t.muscle) ?? [];
  return (exercise.jointActions ?? []).map((jointAction) => {
    const matches = ACTION_RATINGS.filter(
      (r) => r.jointAction === jointAction && muscles.includes(r.muscle),
    ).sort((a, b) => TIER_ORDER[a.tier] - TIER_ORDER[b.tier]);
    const best = matches[0];
    return {
      jointAction,
      tier: best?.tier ?? null,
      muscle: best?.muscle ?? null,
    };
  });
}

export type MuscleGroup<T> = { key: string; label: string; items: T[] };

/**
 * Group items by their primary muscle (first entry of muscleTargets).
 * Groups follow MUSCLES order; items without targets land in "Other" (last).
 * Within a group, items sort by that muscle's tier (S first), then name-stable.
 *
 * Deliberately keyed on index 0, not on `role`: an exercise can declare two
 * primaries (roleAt), but grouping stays single-home so the library remains a
 * partition — group counts, the filter bar, and this list must all agree on
 * one bucket per exercise. Writers must put primaries first in the array
 * (roleAt's back-compat rule already assumes this), so `[0]` is always *a*
 * primary even when there are two.
 */
export function groupByPrimaryMuscle<
  T extends { muscleTargets: MuscleTarget[] | null },
>(items: T[]): MuscleGroup<T>[] {
  const buckets = new Map<string, T[]>();
  for (const item of items) {
    const primary = item.muscleTargets?.[0]?.muscle;
    const key = primary && MUSCLE_BY_KEY.has(primary) ? primary : "other";
    const bucket = buckets.get(key);
    if (bucket) bucket.push(item);
    else buckets.set(key, [item]);
  }
  const tierFor = (item: T, muscle: string) =>
    tierRank(item.muscleTargets?.find((t) => t.muscle === muscle)?.tier);
  const groups: MuscleGroup<T>[] = [];
  for (const m of MUSCLES) {
    const bucket = buckets.get(m.key);
    if (!bucket) continue;
    bucket.sort((a, b) => tierFor(a, m.key) - tierFor(b, m.key));
    groups.push({ key: m.key, label: m.label, items: bucket });
  }
  const other = buckets.get("other");
  if (other) groups.push({ key: "other", label: "Other", items: other });
  return groups;
}
