# Machine-catalog v1 QA report (2026-08-07)

Phase-2 data-acquisition pass for `machine_catalog`: the two ToS-verified Tier-1
brands — **Life Fitness** and **Hammer Strength** — crawled, extracted,
normalized, QA-reviewed, and migrated. Run by the scaffold pipeline
(`scripts/machine-catalog/`, see `docs/machine-catalog-pipeline.md`).

## Scope & mode

- **Extraction mode: deterministic mock/dry-run.** No `FROG_EXTRACT_API_KEY` is
  configured in this environment, so `extract.ts` ran in mock mode: each row's
  brand/model/category/mechanism are parsed from the page's own schema.org
  `Product` JSON-LD (author-published facts). Spec fields (`weightStackKg`,
  `plateCapacityKg`, `dimensions`, era) are `null` on every row and each
  row's `source_note` says so. **The live DeepSeek round trip is still
  unvalidated** — the pipeline-doc "known gaps" item stands.
- Strength categories only, current catalogs only. `MachineCategory` union is
  the taxonomy; no new categories invented.

## Brands covered

| Brand | Crawl target | Pages crawled | Rows extracted | Rows migrated |
|---|---|---|---|---|
| Hammer Strength | `lifefitness.com` plate-loaded + Select/MTS selectorized lines | 91 | 89 | **37** |
| Life Fitness | `lifefitness.com` selectorized (insignia/circuit/axiom) + plate-loaded + cable lines | 105 | 99 | **55** |

Total `machine_catalog` seed: **411 → 503** rows (92 added), 0 duplicate
`(brand, model)` across the whole table.

## QA actions taken (all decisions, per row)

1. **Seed-overlap dedupe (auto, 74 rows dropped).** Any extracted machine the
   phase-1 seed (static catalog) already owns was dropped from the migration
   feed — matched exactly, or modulo the three systematic naming divergences
   (the seed's "Plate Loaded" prefix, word order, separator noise). See
   `findSeedOverlaps` in `qa-lib.ts`; e.g. seed "Insignia Series Dual Axis
   Chest Press" == official "Insignia Series Chest Press - Dual Axis".
2. **Discontinued-drop (manual, 21 rows).** Each dropped row's product page
   carries Life Fitness's literal "This product has been discontinued" banner
   (verified live). Dropped rather than seeded with a `discontinued_year`,
   per phase-2 scope ("no discontinued lines — phase 4"):
   - Hammer Strength: Plate Loaded V-Squat, Plate-Loaded Squat Lunge,
     Plate-Loaded Combo Decline, Plate-Loaded Seated Leg Curl.
   - Life Fitness: Fit 3 Multi-Gym; HD Elite Cable Row / Pulldown /
     Dual Adjustable Pulley; the whole Signature Series cable line
     (Cable Column, Row, Pulldown, Shoulder Press, Chest Press,
     Dual Adjustable Pulley w Console, Multi-Jungle MJ4/MJ5/MJ8);
     Optima Series Dual Adjustable Pulley; Insignia Series Seated Leg
     Press, Pectoral Fly, Hip Abduction.
3. **Seed-dup by judgment (1 row).** "Insignia Series Hip Abductor / Adductor"
   is the same combo machine as the phase-1 seed's "Insignia Series Hip
   Abduction/Adduction" — dropped (the standalone Insignia Hip Adduction and
   Sit/Stand Hip Abductor are different, current products and were kept).
4. **Wrong-brand re-home (2 rows).** Hammer Strength Performance Trainer
   products crawled under the shared lifefitness.com sitemap ("Pulldown /
   Row", "HS Dual Adjustable Pulley") were re-homed from the life-fitness
   feed into the hammer-strength feed; their `source_note` records it. The
   other three (HD Elite row/pulldown/DAP) were discontinued → dropped.
5. **Name/category fixes (3 rows).** "AXIOM SERIES PECTORAL FLY/REAR DELTOID"
   → "Axiom Series Pectoral Fly/Rear Deltoid" (all-caps JSON-LD); "Axiom
   Series Multi-Press" → `shoulder-press` (seed convention for Multi-Press);
   "SYNRGY90" → `functional-trainer` (it is a functional trainer rig).

## Sample spot-check (deterministic 10%, seed 1)

Verified against live pages by re-fetching the `sourceUrl` and confirming the
JSON-LD name matches the row. Sampled rows, all clean:

- Hammer Strength: 4-Way Neck, Reverse V-Squat, MTS Iso-Lateral Biceps Curl,
  HS Dual Adjustable Pulley.
- Life Fitness: Plate Loaded Biceps Curl, SYNRGY, Axiom Series Leg Extension /
  Leg Curl, Circuit Series Ab Crunch, Circuit Series Lat Pulldown, Axiom
  Series Biceps Curl.

Full sample/dupe reports: `scripts/machine-catalog/staging/qa/`
(`*-sample.json`, `*-dupes.json` — zero dupe groups in both feeds; gitignored).

## Known gaps

- **Real-model extraction unvalidated** (mock mode only — see above). The
  mock heuristic only resolves pages with a clean `Product` JSON-LD block;
  the 8 skipped pages were all category-landing pages, correctly unresolved.
- **Spec fields all null** — weight stacks, plate capacities, dimensions,
  era need PDF spec sheets or a live-model pass (phase-2 follow-up).
- **13 Tier-1 brands still unverified** (robots.txt/ToS gate) — no crawl for
  them in this pass.
- Life Fitness's "discontinued" banners mark replacements (Insignia/HD
  Perimeter); those current replacements are already covered by this batch
  where they exist.

## Verification

- `supabase db reset` on a fresh local instance: all 30 migrations apply,
  including both new seeds.
- Re-running the two insert statements: `INSERT 0 0` (deterministic ids +
  `on conflict (id) do nothing`).
- `bun run typecheck`, `bun run lint`, `bun run test` (all workspaces) green;
  `bun test scripts/machine-catalog` (29 tests, incl. new seed-overlap and
  JSON-LD-entity cases) green.
