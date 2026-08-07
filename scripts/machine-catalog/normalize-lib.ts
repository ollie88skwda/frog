// Pure normalization logic, split out from normalize.ts's CLI entry point
// so qa.ts (and any future stage) can import `dedupeKey` etc. without
// triggering normalize.ts's own `main()` — this repo's scripts run their
// CLI body unconditionally at module bottom (see import-free-exercise-db.ts),
// so anything meant to be imported elsewhere has to live outside that file.
import { BRAND_CANONICAL } from "./brands";
import { aliasesForModel } from "./model-aliases";
import type { StagingMachine } from "./types";

export function canonicalizeBrand(raw: string): string {
  const key = raw.trim().toLowerCase();
  return BRAND_CANONICAL[key] ?? raw.trim();
}

export function normalizeMachine(m: StagingMachine): StagingMachine {
  const brand = canonicalizeBrand(m.brand);
  const derivedAliases = aliasesForModel(m.model);
  const existing = m.aliases ?? [];
  const aliases = [...new Set([...existing, ...derivedAliases])];
  return {
    ...m,
    brand,
    aliases: aliases.length > 0 ? aliases : null,
  };
}

// Keyed on normalized (brand, model) — the same key qa.ts's dedupe check
// uses, so "already applied normalization" is consistent everywhere.
export function dedupeKey(m: StagingMachine): string {
  return `${m.brand.trim().toLowerCase()}::${m.model.trim().toLowerCase()}`;
}
