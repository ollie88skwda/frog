// Stage 2 logic: turning a raw page/PDF-text document into the report.md
// §3 field shape, via a cheap model in JSON mode (or a deterministic mock
// when no model credentials are configured). Split out from extract.ts's
// CLI entry point so it's importable by tests without executing that
// file's CLI body (this repo's scripts run their CLI unconditionally at
// module bottom — see import-free-exercise-db.ts).
import type { MachineCategory } from "../../packages/core/src/data/machine-catalog";
import type {
  Dimensions,
  Mechanism,
  RawDocument,
  StagingMachine,
} from "./types";
import { MECHANISMS } from "./types";

export const DEFAULT_BASE_URL = "https://api.deepseek.com/v1";
export const DEFAULT_MODEL = "deepseek-chat";
export const DEFAULT_PROVIDER = "deepseek";

// ---- category / mechanism keyword heuristics (used by mock mode, and as
// the schema's category enum source for the real-model prompt) ----------
export const CATEGORY_KEYWORDS: {
  keywords: string[];
  category: MachineCategory;
}[] = [
  { keywords: ["chest press", "bench press"], category: "chest-press" },
  { keywords: ["incline press"], category: "incline-press" },
  {
    keywords: ["shoulder press", "overhead press"],
    category: "shoulder-press",
  },
  { keywords: ["pec fly", "pec deck", "fly"], category: "pec-fly" },
  { keywords: ["rear delt"], category: "rear-delt-fly" },
  { keywords: ["lateral raise"], category: "lateral-raise" },
  { keywords: ["t-bar row", "row"], category: "row" },
  { keywords: ["pulldown", "lat pull"], category: "pulldown" },
  { keywords: ["pullover"], category: "pullover" },
  { keywords: ["bicep curl", "preacher curl"], category: "bicep-curl" },
  {
    keywords: ["tricep extension", "tricep pushdown"],
    category: "tricep-extension",
  },
  { keywords: ["dip"], category: "dip" },
  { keywords: ["leg press"], category: "leg-press" },
  { keywords: ["hack squat"], category: "hack-squat" },
  { keywords: ["pendulum squat", "pendulum-x"], category: "pendulum-squat" },
  { keywords: ["belt squat"], category: "belt-squat" },
  { keywords: ["smith machine", "smith"], category: "smith" },
  {
    keywords: ["v-squat", "squat press", "squat machine"],
    category: "squat-machine",
  },
  { keywords: ["leg extension"], category: "leg-extension" },
  { keywords: ["leg curl"], category: "leg-curl" },
  { keywords: ["hip thrust"], category: "hip-thrust" },
  { keywords: ["glute kickback"], category: "glute-kickback" },
  { keywords: ["hip adduction"], category: "hip-adduction" },
  { keywords: ["hip abduction"], category: "hip-abduction" },
  { keywords: ["calf raise"], category: "calf-raise" },
  { keywords: ["back extension"], category: "back-extension" },
  { keywords: ["ab crunch", "abdominal"], category: "ab-crunch" },
  { keywords: ["torso rotation"], category: "torso-rotation" },
  {
    keywords: ["multi-station", "multi station", "multi-gym"],
    category: "multi-station",
  },
  { keywords: ["functional trainer"], category: "functional-trainer" },
  {
    keywords: ["assisted pull", "assisted pull-up", "assisted chin"],
    category: "assisted-pullup",
  },
  { keywords: ["shrug"], category: "shrug" },
  { keywords: ["deadlift"], category: "deadlift-machine" },
];

export const MECHANISM_KEYWORDS: {
  keywords: string[];
  mechanism: Mechanism;
}[] = [
  { keywords: ["plate loaded", "plate-loaded"], mechanism: "plate-loaded" },
  { keywords: ["selectorized", "weight stack"], mechanism: "selectorized" },
  { keywords: ["cable"], mechanism: "cable" },
  { keywords: ["pneumatic"], mechanism: "pneumatic" },
  { keywords: ["smith machine", "smith"], mechanism: "smith" },
  { keywords: ["bodyweight"], mechanism: "bodyweight" },
  { keywords: ["electronic", "digital resistance"], mechanism: "electronic" },
];

export const SCHEMA_DESCRIPTION = `Return a JSON object: {"machines": StagingMachine[]}. Each StagingMachine:
{
  "brand": string,
  "model": string,
  "aliases": string[] | null,
  "category": one of ${JSON.stringify(CATEGORY_KEYWORDS.map((c) => c.category))},
  "mechanism": one of ${JSON.stringify(MECHANISMS)} or null,
  "muscleTargets": null,           // never infer this — leave null, a human/agent QA pass fills it
  "weightStackKg": number | null,
  "plateCapacityKg": number | null,
  "dimensions": { "lengthCm"?: number, "widthCm"?: number, "heightCm"?: number, "weightKg"?: number } | null,
  "productUrl": string | null,
  "introducedYear": number | null,
  "discontinuedYear": number | null,
  "sourceUrl": string,             // the page/PDF this row came from — required
  "sourceNote": string | null
}
Only extract facts present in the source text. Do not invent specs. If a field
isn't stated, use null.`;

export function inferCategory(text: string): MachineCategory {
  const lower = text.toLowerCase();
  for (const { keywords, category } of CATEGORY_KEYWORDS) {
    if (keywords.some((k) => lower.includes(k))) return category;
  }
  return "other";
}

export function inferMechanism(text: string): Mechanism | null {
  const lower = text.toLowerCase();
  for (const { keywords, mechanism } of MECHANISM_KEYWORDS) {
    if (keywords.some((k) => lower.includes(k))) return mechanism;
  }
  return null;
}

// Strip a leading "Plate Loaded"/"Plate-Loaded" marketing prefix — it's the
// mechanism, not part of the model name, and stripped brand/mechanism
// prefixes generally read cleaner as a catalog model string.
export function cleanModelName(name: string, brand: string): string {
  return name
    .replace(/^plate[- ]loaded\s+/i, "")
    .replace(new RegExp(`^${brand}\\s+`, "i"), "")
    .trim();
}

// ---- mock/dry-run extraction -------------------------------------------
export function mockExtractOne(
  doc: RawDocument,
  fallbackBrand: string,
): StagingMachine | null {
  if (doc.extractionMethod === "jsonld-product") {
    let parsed: {
      name?: string;
      brand?: { name?: string } | string;
      description?: string;
    };
    try {
      parsed = JSON.parse(doc.text);
    } catch {
      return null;
    }
    const rawBrand =
      typeof parsed.brand === "string"
        ? parsed.brand
        : (parsed.brand?.name ?? fallbackBrand);
    const name = parsed.name?.trim();
    if (!rawBrand || !name) return null;
    const description = parsed.description ?? "";
    const searchText = `${name} ${description}`;
    return {
      brand: rawBrand,
      model: cleanModelName(name, rawBrand),
      aliases: null,
      category: inferCategory(searchText),
      mechanism: inferMechanism(searchText),
      muscleTargets: null,
      weightStackKg: null,
      plateCapacityKg: null,
      dimensions: null,
      productUrl: doc.url,
      introducedYear: null,
      discontinuedYear: null,
      sourceUrl: doc.url,
      sourceNote:
        "dry-run/mock extraction: parsed from schema.org Product JSON-LD (name/brand/description only). " +
        "Spec fields (weight stack, plate capacity, dimensions, era) were not present in this source and " +
        "need a PDF spec sheet or a real model pass to fill — see docs/machine-catalog-pipeline.md.",
    };
  }

  // stripped-html fallback: too unstructured to reliably mock-extract a
  // clean model name from, so mock mode reports it as unresolved rather
  // than guessing — a real model call is exactly what this case needs.
  return null;
}

// ---- live model call -----------------------------------------------------
export type ExtractConfig = {
  apiKey: string;
  baseUrl: string;
  model: string;
  provider: string;
};

export function readExtractConfig(
  env: NodeJS.ProcessEnv = process.env,
): ExtractConfig | null {
  const apiKey = env.FROG_EXTRACT_API_KEY;
  if (!apiKey) return null;
  return {
    apiKey,
    baseUrl: env.FROG_EXTRACT_BASE_URL ?? DEFAULT_BASE_URL,
    model: env.FROG_EXTRACT_MODEL ?? DEFAULT_MODEL,
    provider: env.FROG_EXTRACT_PROVIDER ?? DEFAULT_PROVIDER,
  };
}

export async function callModel(
  doc: RawDocument,
  cfg: ExtractConfig,
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
        {
          role: "system",
          content: `Extract gym-machine catalog data from source text into JSON. ${SCHEMA_DESCRIPTION}`,
        },
        {
          role: "user",
          content: `Source URL: ${doc.url}\n\nSource text:\n${doc.text}`,
        },
      ],
    }),
  });
  if (!res.ok) {
    throw new Error(
      `extraction model call failed: ${res.status} ${await res.text()}`,
    );
  }
  const body = await res.json();
  const content = body.choices?.[0]?.message?.content;
  if (typeof content !== "string") {
    throw new Error("extraction model response had no message content");
  }
  return content;
}

// Validates + coerces an untrusted parsed-JSON object into a StagingMachine,
// throwing on anything that would silently corrupt the batch (missing
// brand/model, or nonsense types). Exported so a live-model pass and a unit
// test can both exercise it without a network call.
export function toStagingMachine(
  obj: unknown,
  fallbackSourceUrl: string,
): StagingMachine {
  if (!obj || typeof obj !== "object")
    throw new Error("extracted row is not an object");
  const o = obj as Record<string, unknown>;
  const brand = String(o.brand ?? "").trim();
  const model = String(o.model ?? "").trim();
  if (!brand || !model) throw new Error("extracted row missing brand/model");

  const knownCategories = new Set(
    CATEGORY_KEYWORDS.map((c) => c.category).concat("other"),
  );
  const category = knownCategories.has(o.category as MachineCategory)
    ? (o.category as MachineCategory)
    : "other";
  const mechanism = MECHANISMS.includes(o.mechanism as Mechanism)
    ? (o.mechanism as Mechanism)
    : null;

  return {
    brand,
    model,
    aliases: Array.isArray(o.aliases) ? (o.aliases as string[]) : null,
    category,
    mechanism,
    muscleTargets: null, // never trust a model's muscle-target guess — see types.ts
    weightStackKg: typeof o.weightStackKg === "number" ? o.weightStackKg : null,
    plateCapacityKg:
      typeof o.plateCapacityKg === "number" ? o.plateCapacityKg : null,
    dimensions: (o.dimensions as Dimensions | null) ?? null,
    productUrl: typeof o.productUrl === "string" ? o.productUrl : null,
    introducedYear:
      typeof o.introducedYear === "number" ? o.introducedYear : null,
    discontinuedYear:
      typeof o.discontinuedYear === "number" ? o.discontinuedYear : null,
    sourceUrl:
      typeof o.sourceUrl === "string" ? o.sourceUrl : fallbackSourceUrl,
    sourceNote: typeof o.sourceNote === "string" ? o.sourceNote : null,
  };
}
