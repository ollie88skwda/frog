# Machine-catalog acquisition pipeline

Scaffold for building the `machine_catalog` seed dataset described in the
scout plan (`frog-machine-db-plan/report.md`, §4-5). Code lives in
`scripts/machine-catalog/`. Tier 1 brands only (captain-greenlit): Life
Fitness, Precor, Technogym, Hammer Strength, Nautilus, Cybex, Matrix, Hoist,
Atlantis, Freemotion, Panatta, Star Trac, Prime, Gym80, Arsenal Strength —
see `scripts/machine-catalog/brands.ts` (`TIER1_BRANDS`), which is also the
per-brand domain/ToS checklist: only flip a brand's `verified` flag after
you've personally fetched its robots.txt and skimmed its ToS.

**Ownership boundary**: this pipeline does not touch
`packages/core/src/db/schema.ts` or `supabase/migrations/` — the
`machine_catalog` table's shape is owned by `docs/schema.md`.
`generate-migration.ts` produces SQL text matching that table but never
writes into `supabase/migrations/` on its own.

## Pipeline stages

```
crawl.ts  ->  extract.ts  ->  normalize.ts  ->  qa.ts  ->  generate-migration.ts
(raw text)    (StagingMachine)  (canonicalized)  (sample+dedupe)  (SQL)
```

Every stage reads/writes JSON under a shared staging root
(`scripts/machine-catalog/paths.ts`), default
`scripts/machine-catalog/staging/` (gitignored — never commit real crawl
output there). Set `FROG_MC_ROOT` to point every stage at a different root
instead; that's how the committed reference example under
`scripts/machine-catalog/sample/` was produced.

### 1. `crawl.ts` — fetch a brand's current catalog

```sh
bun scripts/machine-catalog/crawl.ts <brandKey> [--limit N]   # default limit 5
```

Sitemap-driven: fetches `robots.txt` (`robots.ts` — a minimal but
correct-enough parser: `User-agent: *` groups, `Disallow`/`Allow` prefixes
and `*` wildcards, longest-match-wins), fetches the brand's configured
sitemap, filters `<loc>` entries by the brand's `pathPattern`, then fetches
each page (rate-limited to one request per `FROG_CRAWL_DELAY_MS`, default
1000ms, via a descriptive `FrogMachineCatalogBot` User-Agent). A brand with
no `verified: true` in `brands.ts` is refused outright — verify the domain
by hand first.

Per page, prefers a `schema.org Product` JSON-LD block when present
(structured, author-published facts) and falls back to tag-stripped visible
text otherwise. A PDF response is saved as raw bytes
(`RawBinary`) — **this environment has no `pdftotext`/PDF-parsing library**,
so PDF text extraction is not implemented; `extract.ts` reports every PDF as
skipped rather than silently dropping it. Wiring real PDF-to-text (e.g.
shelling out to `pdftotext` where available, or a JS PDF-parsing lib) is the
main follow-up before this pipeline can lean on official spec-sheet PDFs the
way report.md §4 recommends.

Output: `staging/raw/<brand>/manifest.json` (`CrawlManifest`).

### 2. `extract.ts` — cheap-model structured extraction

```sh
bun scripts/machine-catalog/extract.ts <brandKey> [--dry-run]
```

Turns each raw document into the report.md §3 field shape (`StagingMachine`
in `types.ts`) via a cheap model in JSON mode. Fully env-configurable, no
frontier model anywhere in this path:

| Env var | Purpose | Default |
|---|---|---|
| `FROG_EXTRACT_API_KEY` | required for live mode | — |
| `FROG_EXTRACT_BASE_URL` | OpenAI-chat-completions-shaped endpoint | `https://api.deepseek.com/v1` |
| `FROG_EXTRACT_MODEL` | model name | `deepseek-chat` |
| `FROG_EXTRACT_PROVIDER` | label only, recorded in output | `deepseek` |

No API key present (or `--dry-run`) → **deterministic mock mode**: a
keyword/JSON-LD heuristic (`extract-lib.ts`'s `mockExtractOne`) that proves
the pipeline mechanics without ever calling a model. It only emits a row
when it can parse a real `Product` JSON-LD block (brand/model/description);
unstructured stripped-HTML pages are reported unresolved rather than
guessed at. Every mock-mode row's `sourceNote` says so plainly, and the
batch's `meta.mode` records `"live"` or `"dry-run"` — **state which mode you
validated with**, don't mix them silently in one PR.

`muscleTargets` is **always** left `null` by this stage, live or mock —
report.md §4 calls muscle-target assignment a human/agent judgment call, not
something to infer from a spec page.

Output: `staging/extracted/<brand>.json` (`ExtractionBatch`).

### 3. `normalize.ts` — brand + alias canonicalization

```sh
bun scripts/machine-catalog/normalize.ts <brandKey>
```

Applies `brands.ts`'s `BRAND_CANONICAL` table (raw brand string seen in the
wild → the one display string) and `model-aliases.ts`'s `MODEL_ALIASES`
(substring-matched model-family short names, e.g. "Iso-Lateral" → merged
into `aliases`, same shape/purpose as `MatchCandidate.aliases` in
`packages/core/src/domain/match-exercise.ts`). Both tables are starter sets,
illustrative of the mechanism — extend as real batches surface more brand
variants/family names worth aliasing.

Output: `staging/normalized/<brand>.json`.

### 4. `qa.ts` — sample + dedupe

```sh
bun scripts/machine-catalog/qa.ts <brandKey> [--pct 10] [--seed 1]
```

Two reports, both required before a batch feeds `generate-migration.ts`:

- a deterministic random sample (default 10%, report.md §5's 5-10%
  recommendation) for a human/agent to spot-check each row against its
  `sourceUrl` — same seed reviews the same rows on a re-run;
- a dedupe check keyed on normalized `(brand, model)` (`normalize-lib.ts`'s
  `dedupeKey`), flagging any group with more than one row.

Output: `staging/qa/<brand>-sample.json`, `staging/qa/<brand>-dupes.json`.

### 5. `generate-migration.ts` — idempotent Supabase seed migration

```sh
bun scripts/machine-catalog/generate-migration.ts <brandKey> [-o path]
```

Turns a **reviewed** batch into SQL matching
`supabase/migrations/20260715055811_seed_free_exercise_db.sql`'s shape
exactly: deterministic uuids (sha1 of `brand::model`, so a re-run is a
no-op), `insert ... on conflict (id) do nothing`, `owner_id null` (global
seed row). Prints to stdout by default (redirect straight into
`supabase/migrations/`), or `-o path` to write a file — never writes into
`supabase/migrations/` on its own.

**Input:** prefers `staging/qa/<brand>-review.json` — the QA-reviewed
migration feed that `qa.ts` writes (batch minus phase-1-seed overlaps and
wrong-brand rows) — falling back to `staging/normalized/<brand>.json`.
This script doesn't gate on the review having happened; it trusts the
caller, same as before.

## Reference example (committed, real crawl + dry-run extraction)

`scripts/machine-catalog/sample/` is the full pipeline output for
**Hammer Strength** (`hammer-strength`), the one brand this task fully
validated:

- `raw/hammer-strength/manifest.json` — a **real** crawl: 8 pages fetched
  from `lifefitness.com`'s live `en-us` sitemap (Hammer Strength is a Life
  Fitness brand in the real world and shares its storefront/sitemap — see
  `brands.ts`), robots.txt-checked, rate-limited. 3 of the 8 are genuine
  `Product` JSON-LD pages; the other 5 are category-landing or non-JSON-LD
  product pages, staged as `stripped-html`.
- `extracted/hammer-strength.json` — **dry-run/mock mode** (no
  `FROG_EXTRACT_API_KEY` in this environment — validated with mock mode,
  not a live model call; state your own mode plainly if you regenerate
  this). 3 rows resolved from the JSON-LD pages (Iso-Lateral T-Bar Row,
  Reverse V-Squat, Super Squat Press); the other 5 pages correctly reported
  unresolved rather than guessed at.
- `normalized/hammer-strength.json` — brand canonicalized to "Hammer
  Strength", `ISO-Lateral`/`V-Squat` aliases applied.
- `qa/hammer-strength-sample.json`, `qa/hammer-strength-dupes.json` — a 40%
  QA sample (seed 7, exaggerated above the 5-10% default so a 3-row demo
  batch still yields a non-trivial sample) and a clean (zero-group) dedupe
  check.
- `migrations/hammer-strength.sql` — the generated SQL. **Not applied
  anywhere** — a reference example only; the real Hammer Strength seed
  ships as
  `supabase/migrations/20260807083500_seed_machine_catalog_hammer_strength.sql`.

Reproduce it yourself:

```sh
export FROG_MC_ROOT="$(pwd)/scripts/machine-catalog/sample"
bun scripts/machine-catalog/crawl.ts hammer-strength --limit 8
bun scripts/machine-catalog/extract.ts hammer-strength --dry-run
bun scripts/machine-catalog/normalize.ts hammer-strength
bun scripts/machine-catalog/qa.ts hammer-strength --pct 40 --seed 7
bun scripts/machine-catalog/generate-migration.ts hammer-strength \
  -o "$(pwd)/scripts/machine-catalog/sample/migrations/hammer-strength.sql"
```

## Tests

`scripts/machine-catalog/pipeline.test.ts` unit-tests every stage's pure
logic (robots.txt parsing, brand/alias normalization, QA sampling/dedupe,
extraction heuristics + validation, crawl text extraction, SQL generation).
Not part of `bun run test` — that filter only runs the three workspace
packages (`apps/web`, `packages/core`, `packages/mcp`) and `scripts/` is
intentionally outside every workspace, same as every other top-level script
in this repo. Run directly:

```sh
bun test scripts/machine-catalog
```

## Known gaps / follow-ups

- **PDF text extraction is unimplemented** (see stage 1 above) — the
  biggest gap before this pipeline can use official PDF spec sheets the
  way report.md §4 prefers.
- **`collectSitemapUrls` follows sitemap indexes** (since the phase-2b
  batch, 2026-08): Shopify/WordPress storefronts publish `sitemap.xml` as
  an index of child sitemaps, and the recursion + pathPattern handles it.
  `crawl.ts` also accepts `--urls-file <path>` for brands whose sitemap is
  incomplete for the target category — see `discover-precor.ts`, the
  companion script that reads precor.com's strength products out of its
  category pages' embedded Contentful JSON.
- **Live-model extraction is validated** (phase-2b ran live against
  `deepseek-chat` with `FROG_EXTRACT_API_KEY` set — see
  `docs/machine-catalog-v2-qa.md`). Two fixes from that run are worth
  knowing: (1) `extract.ts` passes a brand hint to the model — several
  storefronts (Precor, corehandf, gym80.de) never state the manufacturer
  in page text/JSON-LD; (2) the prompt tells the model that a SKU/code is
  an alias, never the model name.
- **Domain moves to re-check per batch**: nautilus.com is now the *home*
  brand (commercial Nautilus lives on corehandf.com, with Star Trac;
  Cybex has no current official catalog at all); gym80.com lapsed into a
  GoDaddy parking page (gym80.de is the live site). Matrix
  (world.matrixfitness.com) is a fully client-rendered SPA — its product
  pages ship no server-side content, so it is not crawlable by this
  pipeline without reverse-engineering its data API.
- **Only `life-fitness`, `hammer-strength` and the six phase-2b brands are
  `verified: true`** in `brands.ts`. Technogym (CloudFront 403),
  Panatta/Prime (dead domains) and Matrix/Arsenal/Cybex/Star-Trac (no
  crawlable product catalog on the current site) stay unverified or
  gapped; each entry's tosNote records why.
- **QA review feed**: `qa.ts` writes `staging/qa/<brand>-review.json` (batch
  minus phase-1-seed overlaps — `findSeedOverlaps`, see `qa-lib.ts` — minus
  wrong-brand rows) and `generate-migration.ts` consumes it; edit that file
  during review (drop rows, fix categories/names) before generating. The
  seed-overlap dedupe is bag-of-words on the model string, which misses
  systematic renames (Freemotion's EPIC line -> short names, Hoist's
  ROC-IT, Atlantis's code-first names) — those batches were deduped by
  slug in review (see the v2 QA doc).
- **`BRAND_CANONICAL` and `MODEL_ALIASES` are starter sets**, not an
  exhaustive pass over every current Tier 1 line.
