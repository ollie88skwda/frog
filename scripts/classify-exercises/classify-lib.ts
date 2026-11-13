// Pure logic for the exercise-classification backfill (plan §9.7, job J12).
// No file/network I/O except `callModel`; classify.ts is the CLI and
// seed-convex.ts calls `applyClassification` after toConvex().
//
// Rules implemented (PROGRAM-RULES.md):
//   R7   indirect sets count 0.5, direct 1. Seed targets list every assisting
//        muscle, so an unlisted/untiered assistant gets an explicit weight 0
//        rather than the over-counting role default.
//   R7b  not touched here (a per-session planning range, not data).
//   R12/R12b  jointActions[0] is the primary joint action (grouping key);
//        `region` carries the R12b regional head.
//   R13  `stability` is deliberately NOT stored: derived from equipment (§9.5).
//   R14  `lengthened` is descriptive only, never a ranking gate.
import { JOINT_ACTIONS, MUSCLES } from "../../packages/core/src/domain/anatomy";
import {
  MECHANICS,
  type Mechanic,
  MOVEMENT_PATTERNS,
  type MovementPattern,
} from "../../packages/core/src/domain/exercise-types";
import { CURATED, type Curated } from "./curated";
import type {
  Classification,
  ClassificationFile,
  ClassifiedTarget,
  SeedExercise,
} from "./types";

const JOINT_KEYS = new Set(JOINT_ACTIONS.map((a) => a.key));
const MUSCLE_KEYS = new Set(MUSCLES.map((m) => m.key));
const MECHANIC_SET = new Set<string>(MECHANICS);
const PATTERN_SET = new Set<string>(MOVEMENT_PATTERNS);

/** Default credit for a secondary with no explicit weight (R7, plan §9.7). */
export function defaultCredit(
  role: "primary" | "secondary",
  tier: string | null,
): number {
  if (role === "primary") return 1;
  return tier === "S" || tier === "A" ? 0.5 : 0;
}

// ---------- curated (Tier 1) ----------

export function parseTargetSpec(
  spec: string,
  seedTargets: { muscle: string; tier: string | null }[],
): ClassifiedTarget[] {
  const tierOf = new Map(seedTargets.map((t) => [t.muscle, t.tier]));
  const out = new Map<string, ClassifiedTarget>();
  for (const part of spec.split(";")) {
    const tok = part.trim().split(/\s+/);
    const [muscle, w, ...rest] = tok;
    if (!MUSCLE_KEYS.has(muscle)) throw new Error(`unknown muscle "${muscle}"`);
    const weight = Number(w);
    if (!(weight >= 0 && weight <= 1))
      throw new Error(`bad weight in "${part}"`);
    const t: ClassifiedTarget = {
      muscle,
      tier: tierOf.get(muscle) ?? null,
      role: rest.includes("p") ? "primary" : "secondary",
      weight,
    };
    if (rest.includes("L")) t.lengthened = true;
    const region = rest.find((r) => r !== "p" && r !== "s" && r !== "L");
    if (region) t.region = region;
    out.set(muscle, t);
  }
  // Any seed muscle the spec doesn't name: explicit secondary, no credit.
  for (const s of seedTargets) {
    if (!out.has(s.muscle)) {
      out.set(s.muscle, {
        muscle: s.muscle,
        tier: s.tier,
        role: "secondary",
        weight: 0,
      });
    }
  }
  return orderLikeSeed([...out.values()], seedTargets);
}

/** Keep the seed's muscle order: library grouping keys off the first target. */
function orderLikeSeed(
  targets: ClassifiedTarget[],
  seed: { muscle: string }[],
): ClassifiedTarget[] {
  const idx = new Map(seed.map((s, i) => [s.muscle, i]));
  return [...targets].sort(
    (a, b) => (idx.get(a.muscle) ?? 99) - (idx.get(b.muscle) ?? 99),
  );
}

export function curatedClassification(
  ex: SeedExercise,
  c: Curated,
): Classification {
  return {
    name: ex.name,
    source: "curated",
    mechanic: c.mech,
    movementPattern: c.pat,
    jointActions: c.ja,
    muscleTargets: parseTargetSpec(c.t, ex.muscleTargets ?? []),
  };
}

// ---------- rules (Tier 2, also the deterministic mock mode) ----------

const ISOLATION_NAME =
  /\b(curl|extension|raise|fly|flye|flyes|kickback|crunch|pushdown|shrug|stretch|smr|calf|pec deck|butterfly|abduct|adduct|twist|rotation|isometric|neck)/i;

export function inferMechanic(ex: SeedExercise): Mechanic {
  const n = ex.muscleTargets?.length ?? 0;
  if (n <= 1) return "isolation";
  if (ISOLATION_NAME.test(ex.name) && n <= 3) return "isolation";
  return "compound"; // legacy generator proxy: 2+ muscles
}

export function inferPattern(
  ex: SeedExercise,
  mechanic: Mechanic,
): MovementPattern | null {
  const name = ex.name.toLowerCase();
  const primary = ex.muscleTargets?.[0]?.muscle;
  if (mechanic === "isolation") return "isolation";
  if (/lunge|split squat|step.?up|pistol/.test(name)) return "lunge";
  if (/carry|farmer|walk/.test(name)) return "carry";
  if (/twist|rotation|woodchop|chop|windmill/.test(name)) return "rotation";
  if (/squat|leg press|hack|jump/.test(name) || primary === "quads")
    return "squat";
  if (
    /deadlift|good morning|swing|clean|snatch|thrust|bridge|hyperext/.test(
      name,
    ) ||
    primary === "hamstrings" ||
    primary === "glutes" ||
    primary === "erectors"
  )
    return "hinge";
  if (/pull-?up|chin|pulldown|pull-down|lat\b/.test(name))
    return "vertical-pull";
  if (
    /row|pull|face/.test(name) ||
    primary === "lats" ||
    primary === "mid-traps-rhomboids"
  )
    return "horizontal-pull";
  if (
    /overhead|military|shoulder press|arnold|handstand|push press|jerk/.test(
      name,
    ) ||
    primary === "front-delts"
  )
    return "vertical-push";
  if (
    primary === "pecs" ||
    primary === "upper-pecs" ||
    primary === "triceps" ||
    /press|push|dip/.test(name)
  )
    return "horizontal-push";
  return null;
}

const PRIMARY_ACTION: Record<string, string[]> = {
  quads: ["knee-extension"],
  hamstrings: ["knee-flexion"],
  glutes: ["hip-extension"],
  adductors: ["hip-adduction"],
  "glute-med": ["hip-abduction"],
  calves: ["ankle-plantarflexion"],
  "hip-flexors": ["hip-flexion"],
  pecs: ["shoulder-horizontal-adduction"],
  "upper-pecs": ["shoulder-horizontal-adduction"],
  "front-delts": ["shoulder-flexion"],
  "side-delts": ["shoulder-abduction"],
  "rear-delts": ["shoulder-horizontal-abduction"],
  "rotator-cuff": ["external-rotation"],
  lats: ["shoulder-extension"],
  "teres-major": ["shoulder-extension"],
  "mid-traps-rhomboids": ["scapular-retraction"],
  "upper-traps": ["scapular-elevation"],
  erectors: ["spinal-extension"],
  biceps: ["elbow-flexion"],
  "brachialis-brachioradialis": ["elbow-flexion"],
  triceps: ["elbow-extension"],
  forearms: ["wrist-flexion-extension"],
  abs: ["spinal-flexion"],
};

export function inferJointActions(
  ex: SeedExercise,
  mechanic: Mechanic,
  pattern: MovementPattern | null,
): string[] {
  const primary = ex.muscleTargets?.[0]?.muscle;
  if (!primary) return [];
  let acts = [...(PRIMARY_ACTION[primary] ?? [])];
  const compound = mechanic === "compound";
  if (primary === "hamstrings" && compound) acts = ["hip-extension"];
  if (primary === "lats") {
    acts =
      pattern === "vertical-pull"
        ? ["shoulder-adduction"]
        : ["shoulder-extension"];
  }
  if (compound) {
    if (primary === "quads") acts.push("hip-extension");
    if (
      primary === "pecs" ||
      primary === "upper-pecs" ||
      primary === "front-delts"
    )
      acts.push("elbow-extension");
    if (primary === "lats" || primary === "mid-traps-rhomboids")
      acts.push("elbow-flexion");
    if (primary === "mid-traps-rhomboids")
      acts = ["scapular-retraction", "shoulder-extension", "elbow-flexion"];
    if (primary === "triceps" && !acts.includes("elbow-extension"))
      acts.push("elbow-extension");
  }
  return [...new Set(acts)].filter((a) => JOINT_KEYS.has(a));
}

export function rulesClassification(ex: SeedExercise): Classification {
  const mechanic = inferMechanic(ex);
  const movementPattern = inferPattern(ex, mechanic);
  const seed = ex.muscleTargets ?? [];
  return {
    name: ex.name,
    source: "rules",
    mechanic,
    movementPattern,
    jointActions: inferJointActions(ex, mechanic, movementPattern),
    muscleTargets: seed.map((t, i) => {
      const role = i === 0 ? "primary" : "secondary";
      return {
        muscle: t.muscle,
        tier: t.tier,
        role,
        weight: defaultCredit(role, t.tier),
      };
    }),
  };
}

// ---------- model (live mode) ----------

export type ModelConfig = {
  apiKey: string;
  baseUrl: string;
  model: string;
  provider: string;
};

export function readModelConfig(
  env: NodeJS.ProcessEnv = process.env,
): ModelConfig | null {
  const apiKey = env.FROG_EXTRACT_API_KEY;
  if (!apiKey) return null;
  return {
    apiKey,
    baseUrl: env.FROG_EXTRACT_BASE_URL ?? "https://api.deepseek.com/v1",
    model: env.FROG_EXTRACT_MODEL ?? "deepseek-chat",
    provider: env.FROG_EXTRACT_PROVIDER ?? "deepseek",
  };
}

const MODEL_SYSTEM = `You classify gym exercises. Return JSON {"items":[{"id":string,"mechanic":"compound"|"isolation","movementPattern":one of ${MOVEMENT_PATTERNS.join("|")},"jointActions":[primary joint action first, from: ${[...JOINT_KEYS].join(", ")}],"primaryMuscle":one of the exercise's listed muscles}]}. Only classify; never invent muscles. The primary muscle is the main target; compounds list the main joint action first.`;

export async function callModel(
  items: SeedExercise[],
  cfg: ModelConfig,
): Promise<string> {
  const res = await fetch(`${cfg.baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${cfg.apiKey}`,
    },
    body: JSON.stringify({
      model: cfg.model,
      response_format: { type: "json_object" },
      temperature: 0,
      messages: [
        { role: "system", content: MODEL_SYSTEM },
        {
          role: "user",
          content: JSON.stringify(
            items.map((e) => ({
              id: e.id,
              name: e.name,
              equipment: e.equipment,
              muscles: (e.muscleTargets ?? []).map((t) => t.muscle),
            })),
          ),
        },
      ],
    }),
  });
  if (!res.ok) {
    throw new Error(
      `classify model call failed: ${res.status} ${await res.text()}`,
    );
  }
  const content = (await res.json()).choices?.[0]?.message?.content;
  if (typeof content !== "string")
    throw new Error("classify model response had no content");
  return content;
}

/**
 * Validate an untrusted model answer against the seed row and fold it into a
 * Classification. Anything off-vocabulary falls back to the rules value for
 * that field, so a bad answer never corrupts the seed.
 */
export function fromModelItem(ex: SeedExercise, raw: unknown): Classification {
  const base = rulesClassification(ex);
  if (!raw || typeof raw !== "object") return base;
  const r = raw as Record<string, unknown>;
  const mechanic =
    typeof r.mechanic === "string" && MECHANIC_SET.has(r.mechanic)
      ? (r.mechanic as Mechanic)
      : base.mechanic;
  const movementPattern =
    typeof r.movementPattern === "string" && PATTERN_SET.has(r.movementPattern)
      ? (r.movementPattern as MovementPattern)
      : base.movementPattern;
  const ja = Array.isArray(r.jointActions)
    ? [
        ...new Set(
          r.jointActions.filter(
            (a): a is string => typeof a === "string" && JOINT_KEYS.has(a),
          ),
        ),
      ]
    : [];
  const seedMuscles = ex.muscleTargets ?? [];
  const pm = typeof r.primaryMuscle === "string" ? r.primaryMuscle : null;
  const muscleTargets = seedMuscles.map((t, i) => {
    const role =
      pm && seedMuscles.some((s) => s.muscle === pm)
        ? t.muscle === pm
          ? "primary"
          : "secondary"
        : i === 0
          ? "primary"
          : "secondary";
    return {
      muscle: t.muscle,
      tier: t.tier,
      role,
      weight: defaultCredit(role, t.tier),
    } as ClassifiedTarget;
  });
  return {
    name: ex.name,
    source: "model",
    mechanic,
    movementPattern,
    jointActions: ja.length ? ja : base.jointActions,
    muscleTargets,
  };
}

export function parseModelBatch(content: string): Record<string, unknown> {
  const parsed = JSON.parse(content) as { items?: { id?: string }[] };
  const out: Record<string, unknown> = {};
  for (const it of parsed.items ?? []) if (it?.id) out[it.id] = it;
  return out;
}

// ---------- assembly + merge ----------

export type ModelFn = (
  items: SeedExercise[],
) => Promise<Record<string, unknown>>;

export async function classifyAll(
  seed: SeedExercise[],
  opts: { model?: ModelFn; batch?: number } = {},
): Promise<ClassificationFile> {
  const byId: Record<string, Classification> = {};
  const rest: SeedExercise[] = [];
  for (const ex of seed) {
    const c = CURATED[ex.name];
    if (c) byId[ex.id] = curatedClassification(ex, c);
    else rest.push(ex);
  }
  const batch = opts.batch ?? 25;
  for (let i = 0; i < rest.length; i += batch) {
    const slice = rest.slice(i, i + batch);
    const answers = opts.model ? await opts.model(slice) : {};
    for (const ex of slice) {
      byId[ex.id] = opts.model
        ? fromModelItem(ex, answers[ex.id])
        : rulesClassification(ex);
    }
  }
  const counts = { curated: 0, model: 0, rules: 0 };
  for (const c of Object.values(byId)) counts[c.source]++;
  return {
    meta: {
      mode: opts.model ? "model" : "mock",
      generatedBy: "scripts/classify-exercises/classify.ts",
      counts,
    },
    byId,
  };
}

/** Merge one classification into a converted seed exercise row (in place). */
export function applyClassification(
  row: Record<string, unknown>,
  c: Classification | undefined,
): void {
  if (!c) return;
  row.mechanic = c.mechanic;
  row.movementPattern = c.movementPattern;
  if (c.jointActions.length) row.jointActions = c.jointActions;
  if (c.muscleTargets.length) {
    row.muscleTargets = c.muscleTargets.map((t) => {
      const o: Record<string, unknown> = {
        muscle: t.muscle,
        tier: t.tier,
        role: t.role,
        weight: t.weight,
      };
      if (t.lengthened) o.lengthened = true;
      if (t.region) o.region = t.region;
      return o;
    });
  }
}
