// Shared slot definitions for the research programs (programs/*.md in the
// research base). Program A, B and C reuse these; templates differ in the
// session lists, per-session set counts and block plan. Muscle keys and joint
// actions are checked against anatomy.ts by templates.test.ts.

import { PROGRAM_RULES as R } from "../rules";
import type { MenuEntry, SlotPrescription, SlotTemplate } from "../types";

const heavyRest: [number, number] = [R.restHeavySec[0], R.restHeavySec[1]];
const accessoryRest: [number, number] = [
  R.restAccessorySec[0],
  R.restAccessorySec[1],
];
const rir: [number, number] = [R.rirDefault[0], R.rirDefault[1]];

const rx = (
  sets: number,
  reps: [number, number],
  kind: "heavy" | "accessory",
  warmup: SlotPrescription["warmup"] = "none",
): SlotPrescription => ({
  sets,
  reps,
  rir,
  restSec: kind === "heavy" ? heavyRest : accessoryRest,
  warmup,
});

const m = (
  matchKey: string,
  stability: MenuEntry["stability"],
  jointAction: string,
  why?: string,
): MenuEntry => ({ matchKey, stability, jointAction, why });

// Isolation reps under the "heavy" bias (D4 default): R8 says any load near
// failure grows similarly, so 4-8 on isolation is evidence-compatible.
const HEAVY_ISO: [number, number] = [R.repsMost[0], R.repsMost[1]];

export const SLOT_LEG_PRESS: SlotTemplate = {
  slot: "1a",
  role: "main-compound",
  credits: { direct: ["quads"], indirect: ["glutes"] },
  region: "quads-vasti",
  jointActions: ["knee-extension", "hip-extension"],
  menu: [
    m(
      "Leg Press",
      "stable",
      "knee-extension",
      "Easy to load and progress (R13).",
    ),
    m("Hack Squat", "stable", "knee-extension"),
    m("Squat", "free", "knee-extension"),
    m("Dumbbell Lunges", "moderate", "knee-extension"),
    m("Bodyweight Squat", "moderate", "knee-extension"),
  ],
  rx: rx(3, [5, 7], "heavy", "ramp2"),
  firstSetMax: true,
  rules: ["R8b", "R12b", "R13", "R15", "R17b"],
};

export const SLOT_LEG_EXT: SlotTemplate = {
  slot: "1b",
  role: "isolation",
  credits: { direct: ["quads"], indirect: [] },
  region: "quads-rf",
  jointActions: ["knee-extension"],
  menu: [
    m(
      "Leg Extension",
      "stable",
      "knee-extension",
      "Adds the rectus femoris, which squats and presses train less (R12b).",
    ),
  ],
  rx: rx(2, [10, 15], "accessory"),
  heavyReps: HEAVY_ISO,
  rules: ["R8b", "R12b", "R15"],
  note: "Practical default, not tested in a study.",
};

export const SLOT_RDL: SlotTemplate = {
  slot: "2",
  role: "compound",
  credits: { direct: ["hamstrings"], indirect: ["glutes"] },
  region: "hams-hinge",
  jointActions: ["hip-extension"],
  menu: [
    m("Romanian Deadlift", "free", "hip-extension"),
    m("Stiff-Legged Dumbbell Deadlift", "free", "hip-extension"),
  ],
  rx: rx(3, [6, 8], "heavy", "ramp1"),
  firstSetMax: true,
  rules: ["R8b", "R12b", "R15", "R17b"],
};

export const SLOT_CHEST_PRESS: SlotTemplate = {
  slot: "3",
  role: "compound",
  credits: { direct: ["pecs"], indirect: ["triceps"] },
  region: "chest",
  jointActions: ["shoulder-horizontal-adduction", "elbow-extension"],
  menu: [
    m("Leverage Chest Press", "stable", "shoulder-horizontal-adduction"),
    m("Machine Bench Press", "stable", "shoulder-horizontal-adduction"),
    m("Dumbbell Bench Press", "moderate", "shoulder-horizontal-adduction"),
    m("Cable Chest Press", "moderate", "shoulder-horizontal-adduction"),
    m("Bench Press", "free", "shoulder-horizontal-adduction"),
    m("Pushups", "moderate", "shoulder-horizontal-adduction"),
  ],
  rx: rx(3, [6, 8], "heavy", "ramp1"),
  firstSetMax: true,
  rules: ["R8b", "R12b", "R15", "R17b"],
};

export const SLOT_INCLINE_PRESS: SlotTemplate = {
  slot: "3",
  role: "compound",
  credits: { direct: ["upper-pecs"], indirect: ["triceps"] },
  region: "upper-chest",
  jointActions: ["shoulder-horizontal-adduction", "elbow-extension"],
  menu: [
    m(
      "Leverage Incline Chest Press",
      "stable",
      "shoulder-horizontal-adduction",
    ),
    m("Incline Dumbbell Press", "moderate", "shoulder-horizontal-adduction"),
    m("Incline Cable Chest Press", "moderate", "shoulder-horizontal-adduction"),
    m("Incline Bench Press", "free", "shoulder-horizontal-adduction"),
  ],
  rx: rx(3, [6, 8], "heavy", "ramp1"),
  firstSetMax: true,
  rules: ["R8b", "R12b", "R15", "R17b"],
};

export const SLOT_ROW: SlotTemplate = {
  slot: "4",
  role: "compound",
  credits: {
    direct: ["lats", "mid-traps-rhomboids"],
    indirect: ["biceps"],
  },
  region: "back",
  jointActions: ["shoulder-extension", "scapular-retraction", "elbow-flexion"],
  menu: [
    m("Lying T-Bar Row", "stable", "shoulder-extension", "Chest-supported."),
    m(
      "Dumbbell Incline Row",
      "stable",
      "shoulder-extension",
      "Chest-supported.",
    ),
    m("Seated Cable Row", "stable", "shoulder-extension"),
    m("Lat Pulldown", "stable", "shoulder-adduction"),
    m("Chin-Up", "moderate", "shoulder-adduction"),
  ],
  rx: rx(3, [6, 8], "heavy", "ramp1"),
  firstSetMax: true,
  rules: ["R8b", "R12b", "R15", "R17b"],
};

export const SLOT_PULL: SlotTemplate = {
  ...SLOT_ROW,
  menu: [
    m("Lat Pulldown", "stable", "shoulder-adduction"),
    m("Seated Cable Row", "stable", "shoulder-extension"),
    m("Lying T-Bar Row", "stable", "shoulder-extension"),
    m("Dumbbell Incline Row", "stable", "shoulder-extension"),
    m("Chin-Up", "moderate", "shoulder-adduction"),
  ],
};

export const SLOT_LATERAL_RAISE: SlotTemplate = {
  slot: "5",
  role: "isolation",
  credits: { direct: ["side-delts"], indirect: [] },
  region: "side-delts",
  jointActions: ["shoulder-abduction"],
  menu: [
    m(
      "Lateral Raise",
      "moderate",
      "shoulder-abduction",
      "Dumbbell and cable raises grew side delts similarly (R12b).",
    ),
    m("Side Lateral Raise", "moderate", "shoulder-abduction"),
  ],
  rx: rx(3, [10, 15], "accessory"),
  heavyReps: HEAVY_ISO,
  rules: ["R8b", "R12b", "R15"],
};

export const SLOT_INCLINE_CURL: SlotTemplate = {
  slot: "6",
  role: "isolation",
  credits: { direct: ["biceps"], indirect: [] },
  region: "biceps",
  jointActions: ["elbow-flexion"],
  menu: [
    m(
      "Incline Dumbbell Curl",
      "moderate",
      "elbow-flexion",
      "Incline curls favoured the biceps brachii; total elbow-flexor growth was similar (R12b).",
    ),
    m("Machine Bicep Curl", "stable", "elbow-flexion"),
    m("Cable Preacher Curl", "stable", "elbow-flexion"),
    m("Dumbbell Bicep Curl", "moderate", "elbow-flexion"),
    m("Barbell Curl", "free", "elbow-flexion"),
  ],
  rx: rx(2, [10, 12], "accessory"),
  heavyReps: HEAVY_ISO,
  rules: ["R8b", "R12b", "R15"],
};

export const SLOT_CABLE_CURL: SlotTemplate = {
  ...SLOT_INCLINE_CURL,
  slot: "7a",
  menu: [
    m("Cable Preacher Curl", "stable", "elbow-flexion"),
    m("Machine Bicep Curl", "stable", "elbow-flexion"),
    m("Incline Dumbbell Curl", "moderate", "elbow-flexion"),
    m("Dumbbell Bicep Curl", "moderate", "elbow-flexion"),
  ],
};

export const SLOT_OVERHEAD_TRICEPS: SlotTemplate = {
  slot: "7",
  role: "isolation",
  credits: { direct: ["triceps"], indirect: [] },
  region: "triceps-long",
  jointActions: ["elbow-extension"],
  menu: [
    m(
      "Triceps Overhead Extension with Rope",
      "stable",
      "elbow-extension",
      "Overhead extensions grew the long head more (R12b).",
    ),
    m("Cable Rope Overhead Triceps Extension", "stable", "elbow-extension"),
    m("Standing Dumbbell Triceps Extension", "moderate", "elbow-extension"),
    m("Standing Overhead Barbell Triceps Extension", "free", "elbow-extension"),
  ],
  rx: rx(2, [10, 12], "accessory"),
  heavyReps: HEAVY_ISO,
  rules: ["R8b", "R12b", "R15"],
};

export const SLOT_CALF: SlotTemplate = {
  slot: "8",
  role: "isolation",
  credits: { direct: ["calves"], indirect: [] },
  region: "calves-gastroc",
  jointActions: ["ankle-plantarflexion"],
  menu: [
    m("Standing Calf Raises", "stable", "ankle-plantarflexion"),
    m("Calf Raise", "stable", "ankle-plantarflexion"),
    m("Standing Dumbbell Calf Raise", "moderate", "ankle-plantarflexion"),
    m("Standing Barbell Calf Raise", "free", "ankle-plantarflexion"),
  ],
  rx: rx(3, [10, 15], "accessory"),
  heavyReps: HEAVY_ISO,
  rules: ["R8b", "R12b", "R15"],
  note: "Practical default, not tested in a study.",
};

export const SLOT_SEATED_CURL: SlotTemplate = {
  slot: "6",
  role: "isolation",
  credits: { direct: ["hamstrings"], indirect: [] },
  region: "hams-biarticular",
  jointActions: ["knee-flexion"],
  menu: [
    m(
      "Seated Leg Curl",
      "stable",
      "knee-flexion",
      "Seated curls grew the hamstrings more than lying curls (R12b).",
    ),
    m("Leg Curl", "stable", "knee-flexion"),
    m("Lying Leg Curls", "stable", "knee-flexion"),
  ],
  rx: rx(2, [10, 12], "accessory"),
  heavyReps: HEAVY_ISO,
  rules: ["R8b", "R12b", "R15"],
};

export const SLOT_HIP_THRUST: SlotTemplate = {
  slot: "9",
  role: "compound",
  credits: { direct: ["glutes"], indirect: ["hamstrings"] },
  region: "glutes",
  jointActions: ["hip-extension"],
  menu: [m("Barbell Hip Thrust", "moderate", "hip-extension")],
  rx: rx(1, [8, 12], "heavy"),
  rules: ["R7b", "R12b"],
  note: "Added so glutes reach 10 weekly sets without a sixth direct quad or hamstring set in one session (R7b).",
};
