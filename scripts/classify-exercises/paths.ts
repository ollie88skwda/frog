// Where the committed classification lives. Override with FROG_CLASSIFY_OUT
// to write a scratch file (the tests do) without touching the real one.
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const PKG_ROOT = dirname(fileURLToPath(import.meta.url));

export const CLASSIFICATION_PATH =
  process.env.FROG_CLASSIFY_OUT ?? join(PKG_ROOT, "classification.json");

export const SEED_PATH = join(PKG_ROOT, "..", "convex", "global-seed.json");
