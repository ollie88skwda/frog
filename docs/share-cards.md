# Share cards reference

Full detail behind the `DECISIONS.md` **2026-07-30 (share system redesign)**
entry. That log stays terse and points here; this doc holds the actual
design decisions, card kinds/frames/grounds, and rationale so the log
doesn't keep growing with every share-card commit.

Built from `data/share-plan-h4` (report + external competitor research:
Strava/Hevy/Whoop/Peloton/Fitbod). Supersedes the earlier single-template
`share-card.tsx` architecture (see the superseded stub in `DECISIONS.md`'s
Design section for that history — token-sampling and mark-rasterization
techniques, and `frog-tagline.ts`, all carried forward from there into the
files described below).

## Card kinds

**The statline rule**: one hero number, three supporting stats, one
signature graphic, one identity line — anything else is cut.

Replaces the generic `ShareCardData` key/value bag with a discriminated
`ShareCard` union (`packages/core/src/share/types.ts`) and pure builders
(`share/builders.ts`, unit-tested): Session, PR, Streak, Month, Year,
Exercise-records — plus a seventh, deliberately-unpromoted `Measurement`
kind (kept per report §7.2, but never a "card type" in the marketing sense:
never auto-offered, never in a default carousel, gated behind a
confirm-every-time in `measures.tsx`).

## Frames

Story (1080×1920, default, mobile-first — the primary IG-story surface
every competitor treats as primary) / Post (1080×1350) / Square
(1080×1080) / OG (1200×630, brand-only, not user-selectable).

## Grounds

Dark / Light / Photo (new — bottom scrim over a session photo, the format
every competitor ships and the old card didn't) / Green (new — the shipped
brand-tile palette, default for PR cards and now confirmed for general use
per captain call).

## Session card hero

Captain call, extends report §5.2 beyond its own volume-vs-top-set
recommendation: the hero is always a *set* (never volume, which moved to a
support stat alongside Sets/Duration), defaulting to an auto-picked "most
impressive set" (`pickAutoHeroSet` in `share/builders.ts`: max weight →
ties broken by reps → falls back to reps/duration/distance for
bodyweight-only or cardio sessions), but the share sheet's `HeroSetPicker`
lets the user tap any set from the session to headline instead —
`SessionCard.heroRef`/`isAutoHero` carry which.

## Exercise-records hero

Falls back through the whole PR-type list (`best_e1rm > heaviest_weight >
best_time > best_pace > longest_distance > best_set_reps >
best_session_volume > best_session_reps` in `buildExerciseRecordsCard`) —
heading only on `best_e1rm`/`heaviest_weight` silently dropped the Share
button for the 4 exercise types that can never hold either (bodyweight_reps,
assisted_bodyweight, duration, distance_duration), a regression against the
pre-redesign `bests.length > 0` gate.

~~The hero-fallback fix left those same 4 types with an empty support-stats
row and sparkline — `records.setRecords` (the "Nrm" table) and the
sparkline both only ever accumulated weight_reps/weighted_bodyweight data,
so the fix was hero-only, strictly-better-than-no-button, gap known and
deferred.~~ **SUPERSEDED → 2026-08-03**: closed. `ExerciseRecords.topRecords`
(`records/types.ts`) is a list of the highest *distinct* all-time set
values (`TOP_RECORDS_MAX` = 4 — one more than the 3 support rows a card
shows; duplicates are dropped so a straight-sets session can't fill it) —
reps for bodyweight_reps/assisted_bodyweight, seconds for
duration/weight_duration, meters for distance_duration/weight_distance
(`TOP_RECORD_PR_TYPE` in `records/records.ts` picks which) — filled by
`computeRecords` in `setRecords`'s place for exactly the types that have no
set-records table, read by `buildExerciseRecordsCard`'s support row when
`hasSetRecords(type)` is false. When the hero headlines that same metric
(bodyweight_reps/assisted_bodyweight on `best_set_reps`, duration on
`best_time`), only strictly-lower values qualify — an equal row would just
restate the hero — and the rank labels shift down (`Best / 2nd best / 3rd
best / 4th best`), which is what the 4th value is held in reserve for;
where the hero is a different metric (weight_duration/weight_distance
headline `heaviest_weight`, distance_duration `best_time`) the two aren't
numerically comparable, so the raw top 3 list.

`exercise-detail.tsx`'s sparkline (renamed `recordsSparkline`) now tracks
each type's headline metric via `topRecordValue` instead of always e1RM.

## Typography

**Mono-vs-display exception, written down as instructed**: the hero number
is Bricolage (a poster headline; mono's fixed advance widths on `,`/`×`
read like a terminal dump at 150–260px), the support-stat row stays mono
(`.num`-equivalent — a data row, values must align).

## Footer identity line

`SHARE_DOMAIN` (`packages/core/src/config.ts`, `null` until a custom domain
is attached — captain call, no placeholder Vercel URL ever) on the right,
`@handle` (slugified `display_name`) or a `Tracked with Frog` fallback on
the left; flipping the domain on later is a one-line change to that one
constant.

## Public links (out of scope)

Public links stay explicitly out of scope (report §7.5 — a full
public-share feature needs a public read path, a privacy model, and
SSR/edge rendering this client-only SPA doesn't have, and is a separate
project) — but `sessions.share_slug` (nullable, unique, migration
`20260731003449_cynical_stick.sql`) exists now, unread and unwritten by
anything, so adding that feature later is additive rather than a schema
rework.

## OG image (`og-image-p6` closes)

`apps/web/public/og.png` (Green ground, static brand only — no per-route
stats are possible or honest for a client-only SPA with no public session
read path) is generated by `scripts/gen-og-image.ts` off the same
`paintBrandOg` painter, driven through a throwaway Vite dev server + a
harness page (`og-harness.html`/`.tsx`, unreachable from any app route,
confirmed absent from a production build) since the OG card needs the real
`FrogMark` component and can't be built from raw SVG manipulation the way
`gen-pwa-icons.ts` is. `--check` mode (no browser) asserts
`og:site_name`/`og:title`/`twitter:title` haven't drifted from `APP_NAME`,
wired into CI's `checks` job.

A planned `<link rel="canonical" href="/">` was dropped — Vite's HTML asset
resolver reads a root `href` as the project directory itself (`EISDIR`),
and there's no domain yet to canonicalize to regardless; `og:url` is gone
for the same reason (it must be an absolute canonical URL, `SHARE_DOMAIN`
is still `null`, and scrapers fall back to the fetched URL — an omitted
optional tag beats a meaningless one).

## iOS `navigator.share` gesture-timing defense

Report §2.5: the share sheet pre-renders the export blob on every
frame/ground/hero-set/photo change (not at tap time), so `Share` calls
`navigator.share` with an already-resolved `File` inside the same user
gesture — **not verified on a real iPhone** (no device available from this
worktree); flagged for follow-up.

## Error handling

A paint or export that fails outright (no 2D context, or iOS Safari
refusing a 1080×1920 export under memory pressure) surfaces as
`share-paint-error` with Share/Save left disabled — the painter throws
instead of returning quietly, so nobody can export the untouched canvas as
a transparent PNG.

## Body heat-map geometry dedup

Body heat-map path geometry (`components/charts/body-paths.ts`) is now the
one copy the interactive SVG and the canvas painter both draw from, rather
than a second hand-copy.

## Surfaces

Supersedes the M9 list: the post-save deck's Session / PR / Streak slides,
history-detail, exercise-detail's Records panel, `/stats/monthly`,
`/stats/year`, and `/measures` (confirm-gated).

`/stats`'s distribution share button is dropped — a muscle-distribution
chart maps onto no card kind in the union, and inventing one would be the
generic key/value bag again; the section keeps its "vs previous …" label
only.

The post-save deck is at most three slides — Session (always), PR (a
record landed), Streak (the streak extended); the old consistency /
overview / exercise-list slides are cut as thumbnail-illegible
restatements of the Session card (report §5.4 "carousel discipline").

## Frog-tagline tone widening

`lib/frog-tagline.ts` tone widened `strong|normal` → `pr|streak|heavy|normal`,
each still keyed to a signal the caller already holds — PR landed / streak
extended / this session out-tonnaged the trailing 4-week average
(`TRAILING_MS` in `post-save-summary.tsx`, off the records history the deck
already fetched — no extra query) — with `pr > streak > heavy > normal`
precedence so the Session slide never claims a signal a dedicated slide
already took.

## Test IDs

`summary-{ordinal,streak,streak-weeks,pr-count,dots,dismiss}`,
`share-slide-{hero,pr,streak}`,
`share-sheet`(+`-loading`)/`share-preview`/`share-canvas`/`share-close`/`share-save`/`share-export`/`share-paint-error`,
`share-frame-{story,post,square}`/`share-ground-{dark,light,photo,green}`,
`share-hero-picker`/`share-hero-auto`/`share-hero-set-{setId}`,
`share-photo-picker`/`share-photo-{position}`/`share-photo-camera`/`share-photo-error`,
`history-share-btn`/`records-share-btn`/`monthly-share-btn`/`year-share-btn`/`measures-share-btn`(+`measures-share-confirm`).

## Bundle size

The entire share system (painter, six builders, graphics, mobile sheet)
lands in the lazy `share-sheet` chunk, so the redesign left eager JS
unchanged. The live eager total and its budget are measured and gated by
`scripts/check-bundle.ts` (CI) — read the number from there rather than
hand-copying one into this doc.
