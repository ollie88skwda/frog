# Machine-catalog v2 QA report (2026-08-07)

Phase-2 batch B of the `machine_catalog` acquisition plan: **six** Tier-1
brands crawled, live-extracted, QA-reviewed, and migrated (the four
ToS-verified-but-uncrawled brands from batch A's gate — Precor, Hoist,
Atlantis, Freemotion — plus Nautilus and Gym80, whose **source domains
moved** since batch A verified them). Runs on the scaffold pipeline
(`scripts/machine-catalog/`, see `docs/machine-catalog-pipeline.md`).

## Scope & mode

- **Extraction mode: LIVE DeepSeek** (`deepseek-chat`, the Flash-class
  model the scaffold defaults to) — the first live-model run of this
  pipeline; batch A ran in mock/dry-run mode. `FROG_EXTRACT_API_KEY` was
  exported from this environment's provider config. Every row's
  `source_note` records extraction provenance, and the batch meta records
  `"mode": "live"` + provider/model.
- Strength categories only, current catalogs only. `MachineCategory` union
  is the taxonomy.
- **Scaffold fixes made in this batch** (all unit-tested):
  1. `collectSitemapUrls` now **follows sitemap indexes** (Shopify /
     WordPress storefronts publish `sitemap.xml` as an index of child
     sitemaps; previously the crawler treated child sitemap files as pages).
  2. `crawl.ts` gained `--urls-file` for brands whose sitemap is incomplete
     for the target category (Precor).
  3. `extract.ts` passes a **brand hint** to the model — several storefronts
     (Precor, corehandf, gym80.de) omit the manufacturer from their page
     text/JSON-LD entirely, and the model would otherwise return rows
     missing `brand` (7 Precor rows failed extraction until the hint).
  4. `normalize.ts` strips bare `®`/`™` marks live pages keep.
  5. The extraction prompt now says: model = human-readable product name
     (never a SKU/code), codes go in `aliases`, and non-machines
     (benches/racks/cardio/accessories) map to `"other"` so QA can drop
     them.
- New companion script `discover-precor.ts`: precor.com's sitemap omits
  most of its strength products; the script reads them out of the
  category pages' embedded Contentful JSON and writes a crawl list for
  `--urls-file`.

## Brands covered

| Brand | Crawl source | Pages crawled | Rows extracted | Rows migrated | Notes |
|---|---|---|---|---|---|
| Precor | precor.com (sitemap + category discovery) | 33 | 33 | **19** | ~14 benches/racks/accessories dropped in review |
| Hoist | hoistfitness.com (machine-family pathPattern) | 62 | 60 | **45** | RS/ROC-IT line is a phase-1-seed dup → dropped; parts-heavy sitemap narrowed |
| Nautilus | **corehandf.com** (domain moved from nautilus.com) | 96 | 95 | **65** | 19 auto-dropped as seed dupes + 11 manual (benches + seed dups) |
| Freemotion | freemotionfitness.com | 90 | 90 | **29** | EPIC/Genesis lines are seed dupes (32); benches/racks/rigs (29) dropped |
| Atlantis | atlantisstrength.com (equipment sitemap) | 199 | 334 | **61** | category-listing pages also extracted (155 rows) → dropped; 33 seed dupes |
| Gym80 | **gym80.de** (gym80.com lapsed — GoDaddy parking page) | 419 | 410 | **145** | 235 free-weight/accessory rows + benches + 10 seed dupes dropped |
| **Total** | | ~930 | ~1,000 | **364** | |

`machine_catalog` seed before this batch: 503 rows (phase-1 + batch A).
After: **867 rows**, still 0 duplicate `(brand, model)`.

## QA actions taken (all decisions, per row)

1. **Seed-overlap dedupe (auto + manual).** `qa.ts`'s bag-of-words dedupe
   caught the exact/near-exact seed dups (19 Nautilus, 12 Gym80). Where the
   seed names a machine differently from the current site, the overlap was
   judged manually and dropped:
   - **Freemotion**: the seed's whole EPIC line (`EPIC Selectorized Chest
     Press ES800`...) and the Genesis Dual Cable Cross are the same
     machines the site now sells under short names (`Chest Press`,
     `Plate Loaded Chest Press`...) — 32 rows dropped by slug.
   - **Hoist**: the seed's 21 ROC-IT (RS-*) rows — dropped by slug (the
     extracted rows' short names couldn't be word-matched).
   - **Atlantis**: the seed's 33 code-first rows (`PW429 Glute Abductor`,
     `D-337 Diverging Row`...) — dropped by slug.
2. **Category/listing pages dropped (Atlantis, 155 rows).** The Atlantis
   equipment sitemap includes `/gym-equipment/<bodypart>` listing pages;
   the model extracted every machine they list, duplicating the individual
   product pages. All rows whose sourceUrl lacks a model code were dropped.
   One machine (NM510 Unilateral Low Row) exists only on a listing page —
   noted in gaps.
3. **Non-machines dropped.** Benches, racks, rigs, platforms, dumbbell/
   barbell storage, pull-up bars, attachments and cardio all map to
   `"other"` and were dropped in review (Precor 14, Freemotion 29, Hoist
   3 optional attachments, Nautilus 7, Atlantis ~60).
4. **RD-series variants dropped (Atlantis).** `RD123/RD124/RD438` pages
   state "Not sold as a standalone unit" — the multi-station versions of
   the D-series machines already kept.
5. **Same-name collisions disambiguated with the model code** (Atlantis,
   matching the seed's code-first convention): `Lat Pulldown (D123)` vs
   `(MS6)`, `Low Row (D124)` vs `(MS7)`, `Incline Row (D132)` vs `(MS8)`,
   `Converging Shoulder Press (E149)` vs `(E449)`, `Adjustable Pulley
   (MS2)` vs `(RX200)`. Precor's `GSL0360/GSL0363` both extract as
   "Selectorized Kneeling Glute Isolator" — one kept.
6. **Name/category fixes (live-model misreads):** Hoist `Decline Chest
   Press` → chest-press; Nautilus `Inspiration Tricep Dip` → dip,
   `HumanSport Arm Crunch` → ab-crunch; Freemotion `Preacher Curl` →
   preacher-curl; Atlantis `Sissy squat` → squat-machine, `Multi-forearm`
   → other.
7. **Gym80 specifics:** 235 `"other"` rows were free-weight furniture and
   accessories (barbells/dumbbells/discs/kettlebells/benches/racks/bags/
   straps/platforms) — dropped wholesale; only `PURE KRAFT SEATED TIBIALIS
   MACHINE` and `Forearms Machine` are genuine machines with no fitting
   category, kept as `"other"`. Two Gym80 products share the exact name
   `LOWER BACK MACHINE` (IDs 3007 + 3038, both live) — one renamed
   `Lower Back Machine (3038)`. `PURE KRAFT SQUAT MACHINE` (4038) kept:
   the seed's `Pure Kraft Pendulum Squat` appears to map to it but the
   current page is titled Squat Machine; noted as a possible seed dup.

## Sample spot-check

Deterministic 10% (seed 1) samples per brand plus targeted re-fetches of
every ambiguous row (Atlantis model-code twins, Precor SKU-named benches,
Hoist multi-station pods). Verified against live pages by re-fetching the
`sourceUrl` and comparing the page's title/JSON-LD name with the row:
all kept rows matched. Notable confirmations: Precor `VBR6100 AB-X`
(JSON-LD name, not the "Abdominal Trainer" marketing title), Precor
`VBR6802 Smith Machine`, Atlantis `Hack squat (C412)` vs seed
`PW412 Hack Squat Pro` (distinct codes, both kept), Freemotion `Squat` /
`Row` (Genesis line — new machines, distinct from seed's EPIC Plate
Loaded).

## Verification

- Fresh `supabase db reset` applies all migrations cleanly (see PR — run
  locally before merge if re-verifying).
- Re-running the inserts: `INSERT 0 0` (deterministic ids + `on conflict
  (id) do nothing`).
- `bun run typecheck`, `bun run lint`, `bun run test` green;
  `bun test scripts/machine-catalog` (32 tests, incl. new sitemap-index,
  `--urls-file`, trademark-strip cases) green.

## Known gaps

- **Matrix** — `world.matrixfitness.com` is a fully client-rendered SPA
  (product pages ship no server-side content; the sitemap's ~150 strength
  URLs are empty shells for a text crawler). Not crawlable with this
  pipeline without reverse-engineering the site's data API. Skipped this
  batch; note in PR.
- **Cybex** — no live official catalog found: cybexintl.com is dead and
  corehandf.com (Core Health & Fitness) no longer lists any Cybex
  products (its strength line is the commercial Nautilus line). Batch A's
  note that Cybex "lives at corehandf.com" no longer holds — the current
  storefront has zero Cybex rows.
- **Star Trac** — corehandf.com carries only Star Trac *cardio* (8-series
  treadmills/bikes/consoles); no strength machines. Seed's 12 Star Trac
  "Instinct" rows are the same machines corehandf sells under Nautilus
  Instinct — noted, not fixed in this batch.
- **Arsenal Strength** — arsenalstrength.com is now a gym + blog; the
  product catalog (Reloaded line, 20 rows in seed) has no product pages
  on the current site. Skipped.
- **Gym80** — gym80.com lapsed (GoDaddy parking); crawled gym80.de
  instead. Benches/racks/accessories within its catalog dropped like the
  others.
- Atlantis NM510 (Unilateral Low Row) has no standalone product page —
  only on a listing page; 1-row gap.
- Spec fields (`weight_stack_kg`, `plate_capacity_kg`, `dimensions`) are
  populated when the page states them (Atlantis/Gym80 pages carry real
  dimensions; Shopify pages rarely do) — partial coverage, as expected.

## ToS / domain updates (brands.ts)

- `nautilus` → domain **www.corehandf.com**, EN products sitemap direct
  (nautilus.com is now the home brand — vibration boards/supplements, no
  strength machines; Core Health & Fitness bought the Nautilus commercial
  business).
- `gym80` → domain **gym80.de** (gym80.com lapsed), pathPattern
  `/en/product/\d+/` (German `/produkt/` twins excluded).
- `precor` tosNote documents the incomplete sitemap + discovery path.
- `hoist`/`atlantis`/`freemotion` pathPatterns narrowed to their
  strength-machine URL shapes.
- Matrix, Cybex, Star Trac, Arsenal, Technogym, Panatta, Prime remain
  `verified: false`-or-gapped for the reasons above (Technogym's
  CloudFront 403 stands; Panatta/Prime domains still dead).
