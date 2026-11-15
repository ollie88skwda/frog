// The pre-merge seed exercises: the frozen-SQL rows exactly as
// `seed-convex.ts --generate` sees them before applyClassification. The
// classifier reads these, never global-seed.json (its own merged output).
import { join } from "node:path";
import { replayMigrations } from "../convex/pg-replay";
import { toConvex } from "../convex-rows-lib";
import type { SeedExercise } from "./types";

const ROOT = join(import.meta.dir, "..", "..");

export async function loadBaseExercises(): Promise<
  (SeedExercise & Record<string, unknown>)[]
> {
  const db = await replayMigrations(ROOT);
  try {
    const res = await db.query<Record<string, unknown>>(
      "select * from exercises where owner_id is null order by id",
    );
    return res.rows.map(
      (r) => toConvex("exercises", r) as SeedExercise & Record<string, unknown>,
    );
  } finally {
    await db.close();
  }
}
