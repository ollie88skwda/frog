// Where the committed classification lives.
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const PKG_ROOT = dirname(fileURLToPath(import.meta.url));

export const CLASSIFICATION_PATH = join(PKG_ROOT, "classification.json");

export const SEED_PATH = join(PKG_ROOT, "..", "convex", "global-seed.json");
