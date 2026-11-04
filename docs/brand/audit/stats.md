# Audit: stats group

Paths relative to `apps/web/src/`. Scope: stats, findings, monthly-report, year-review, calendar, measures, charts/*, report-calendar, report-promo, streak-card, train-findings-card.
Method: full read of every file + rg sweeps (outline-none, transition-all, hardcoded colors, off-scale radii, `...`, div onClick, bare buttons). Clean sweeps: no `outline-none`, no `transition-all`, no hex/rgb/raw-palette classes, no div-onClick, no lucide, no `rounded-xl/2xl/full/lg`. Most findings are structural.

Reference facts: `text-2xs`=12px (theme.css:339), `text-xs`=13px; Button `icon`=size-8 (32px, no md/touch bump), `icon-lg`=size-10; Input is `h-8`; IconButton 40px touch / 32px desktop.

## screens/stats.tsx

- :108-114 - [P1] loading is a bare `<p>` "Loading…" for the whole screen, no skeleton, no `role="status"` -> keep text but add `role="status"`; (P2) avoid whole-screen swap, render header + Section skeletons.
- :101-114 - [P0] no error branch: `useRecordsData`/`useExercises` errors fall through with `history=[]` and render the "Log a few workouts" empty copy (violates "failed query must not render as empty"). Also `muscleMap` (useMuscleMap) has no error state -> destructure `isError`, `refetch`; show `text-neg` message + retry Button (same register as library.tsx) before the empty state.
- :127-136 - [P2] empty-state banner shows but all six Sections below still render with zero charts ("No data yet", empty heatmaps) -> when `history.length===0` return only the banner (+ ReportsRow hidden).
- :129 - [P3] `rounded-md mt-6 bg-surface` ordering, rounded first; harmless.
- :208-228 `Chips` - [P1] touch target `h-8` (32px) on a phone; chips are primary controls (range/granularity) -> `h-10 md:h-8`. [P1] no `aria-pressed` on toggle buttons -> `aria-pressed={o===value}`; wrap group in `role="group" aria-label`. [P2] no `focus-visible` styling beyond global; ok. DUPLICATE: same chip pattern hand-rolled in monthly-report.tsx:133 & :400, year-review.tsx:97, measures.tsx:396, human-body-heatmap.tsx:155 / body-heatmap.tsx:200, share-sheet.tsx (`labels`) -> extract `ui/chip.tsx` / `ChipGroup` (see cross-cutting).
- :208 - [P3] `Chips` generic `T extends string` plus `labels: Record<T,string>`; fine.
- :245-262 chart wrappers - [P1] `ChartContainer` for "Workouts per week" has no `role="img"`/`aria-label` (monthly/year charts do) though `accessibilityLayer` is set. Same for :384 sets-per-muscle (:383 testid), :520 distribution. -> add `role="img" aria-label="…"` consistent with the other report screens, or rely on accessibilityLayer everywhere (pick one).
- :256 `tickFormatter={(v)=>labelOf.get(Number(v)) ?? ""}` + XAxis default `interval` - [P2] Recharts may drop ticks with `preserveEnd`; sparse month labels depend on every tick being tried -> set `interval={0}` on the 12-week axis (:264) so month-start labels are never skipped.
- :262 - [P3] "Workouts per week — last 12 weeks" hard-coded em dash copy; fine. Section title "Last 7 days" is misleading for a 12-week bar chart + 7-day heatmap -> rename "Recent activity" or split.
- :266, :388, :524 - [P2] `YAxis width={24|26|30}` magic numbers -> constant `Y_AXIS_W` in a shared chart helper.
- :275 `labelFormatter` - [P2] `new Date(payload?.[0]?.payload?.weekStart)` -> `new Date(undefined)` = Invalid Date -> "Invalid Date" if payload empty. Guard.
- :340-358 breakdown list - [P1] bespoke `<li className="flex … px-3 py-1.5">` rather than `Row interactive={false}` (rule: dense data lists use `Row`); same for :470-485 distribution totals (`px-3 py-2`). Meanwhile :661 WeekBody uses `Row`. -> use `<Row interactive={false}>` in both.
- :341 `py-1.5` list item shorter than 44px rows; inconsistent with the rest -> Row fixes.
- :433-470 DIST_CONFIG `previous` color `var(--color-text-secondary)` - [P3] a text color token used as chart fill; works but should be a chart token (`--chart-2`/muted bar). Duplicated with monthly-report.tsx:53.
- :447 - [P2] volume axis `compactNumber` -> `toFixed(1)` and `formatCount` hand-rolled; number formatting not via `Intl.NumberFormat` (`compact`). -> `new Intl.NumberFormat(undefined,{notation:"compact",maximumFractionDigits:1})`. There's also `lib/report-format.compactVolume` (duplicate concept) -> reuse.
- :466-468 - [P2] `String(current.totals.workouts)` etc.: counts not `toLocaleString`; fine for small numbers.
- :493 `Delta` - [P2] color-only (pos/neg) plus arrow glyph "▲/▼" text characters, not Phosphor -> ok (text glyph) but add `<span className="sr-only">increase|decrease</span>` for screen readers. Duplicated inline in monthly-report.tsx:`Stat` (:539) -> shared `Delta`.
- :498 `Delta` "±0" fine; [P3] literal `▲▼` should be `aria-hidden`.
- :537 `useState(0)` week offset - [P2] stateful UI not in URL (range/gran/offset chips) -> acceptable; note only.
- :631, :639 `IconButton title="Previous week"` - [P1] icon-only buttons have `title` but no `aria-label` (title is unreliable on touch/AT) -> add `aria-label` both. Icons lack `aria-hidden` (:633, :642, :722, :751, and all CaretRight/CaretLeft) -> Phosphor icons render `aria-hidden` by default? (they do not set it; verify) -> add `aria-hidden` or rely on wrapper; make a note in shared Icon usage.
- :630 week nav - [P2] disabled "Next week" at offset 0 fine. [P2] no way to jump back >1 week quickly; ok.
- :653 `week-range` - [P2] "{from} – {to-DAY}" uses `monthDay` (no year); crossing years ambiguous -> include year when different.
- :655 `No sets logged this week.` - [P3] no frog voice registered while other empties use `t()`; acceptable (data zone).
- :665-675 `Favorite Exercises` - [P3] Title Case vs other sentence-case section titles ("Last 7 days", "Sets per muscle group", "Body view by week") -> pick sentence case. [P3] `ranked.slice(0,15)` magic number -> const.
- :705-725 - [P2] `<span className="num w-4 …">{i+1}</span>` rank width w-4 (16px) breaks at 10+ (two digits fit 12px*2=~14px ok).
- :743-755 `ReportButton` - [P1] bespoke link card instead of shared chrome; no hover state at all (only `transition-colors` with no `hover:`) -> add `hover:bg-surface-hover`; build via `rowClass()` or a shared `NavCard`. `h-14` (56px) ok for tap. `data-testid` derived via `label.split(" ")[0].toLowerCase()` -> brittle; pass `testId` prop.
- :747 - [P3] `transition-colors duration-150` hover-less; same in train-findings-card.tsx:89.
- :758 `formatCount` defined at file bottom but used above (hoisting OK) - [P3] duplicated in human-body-heatmap.tsx:`formatSets`, body-heatmap.tsx:`formatSets` (identical) -> one `formatCount` in `lib/format.ts`.
- general - [P2] `Section` title `<h2>` correct; `<h1>` correct; no skip-link (global). [P3] DAY const redefinition (also DAY_MS in findings.tsx:44) -> shared.
- general - [P2] `Card` imported from ui/card with `bg-surface px-4 py-4` overriding; verify Card doesn't add border/shadow. 
- Data-testid `stats-empty` p with `t()` - fine.

## screens/findings.tsx

- :52-66, :78 - [P0] `useFindingsData`/`useMetrics` have no error branch: failure renders `empty` (:66) -> "No findings yet" copy. Fix: `isError` + retry before `empty`. (`useMetrics` loading/err also ignored: metrics missing silently drops condition findings.)
- :78-81 - [P2] loading is a single `<p>` with `t("Analyzing…")`; no `role="status"`/`aria-live`.
- :87,102,117 - [P1] list containers use `[&>*+*]:mt-0.5 overflow-hidden rounded-md bg-surface` with rows inside; the "On the way" rows (:125-170) are bespoke `div.flex px-4 py-2` not `Row`; ConditionRow (:241) is a bespoke button (`px-4 py-2`, `hover:bg-surface-hover`) rather than `rowClass`. -> use `rowClass()`; rows may be taller (two-line) -> allow `rowClass({className:"h-auto py-2"})` or add a `tall` variant to Row.
- :125-170 - [P2] countdown blocks duplicate each other (two near-identical `<div>` maps) -> extract `CountdownRow`. `{c.sessionsLogged}/2` and `/10` magic thresholds hard-coded in UI; import from core constants.
- :163-176 empty card - [P3] fine; bespoke `rounded-md bg-surface px-4 py-8` repeated across app -> shared `EmptyState`.
- :183-194 - [P3] `SectionLabel` duplicates `Section` heading style in stats.tsx, monthly `Slide`, year `Slide`, measures PhotoStrip h2 (:~628) -> shared `SectionHeading` (cross-cutting).
- :195-211 `VERDICT_TONE` - [P3] ok. :213-243 TrendRow - [P1] row is `flex shrink-0` with 2 Badges + text + caret in one line at 390px: `truncate` name, but right cluster is wide ("+12.3% · 5 sessions" + "Medium confidence" + "PROGRESSING") -> overflows/ellipsizes the exercise name to nothing. Stack: line 2 for stats/badges, or drop confidence badge to the sheet. Test at 360px.
- :237 `Badge` text is uppercase enum (`PROGRESSING`) shown raw -> label map ("Progressing") ; Title/sentence case.
- :215 - [P2] `Badge` "Rough estimate"/"Medium confidence": third state "high" not handled (`confidence === "low" ? … : "Medium confidence"`) -> verify type; map via record.
- :241-270 ConditionRow - [P2] `<p>` inside `<button>` with block layout fine; `{finding.confidence}` raw lowercase "medium confidence" fine. `transition-colors duration-150 ease-(--ease-out-quad)` - ok.
- :252 key `${c.conditionId}-${JSON.stringify(c.outcome)}` - [P3] JSON.stringify in render keys; derive a stable id in `computeFindings`.
- :282-346 TrendChart - [P1] `role="img"` on ChartContainer **and** `accessibilityLayer` makes the svg's focusable layer unreachable/duplicated; pick one. [P1] `aria-label={label}` only names the chart, no summary of the data -> add a visually-hidden text summary (first→last value). [P2] `h-30` ok.
- :318-322 - [P2] `tickFormatter formatDate(Number(v))` — `formatDate` from lib/format; fine (Intl). 
- :367 `dot={{ r: 2.5, strokeWidth: 0, fill: … }}` - [P3] hardcoded; fine.
- :386 TrendSheet - [P1] `<Dialog open onOpenChange>` rendered conditionally and unmounted on close; the close animation is lost and focus return relies on Radix trigger (none) -> focus is lost after close (no Trigger). Use controlled `open={openTrend!=null}` and keep last value, or restore focus to the row. Same for ConditionSheet and calendar/measures dialogs.
- :411 `DialogContent title=` - ok (has title). Missing `aria-describedby`/Description -> Radix console warning "Missing Description"; check dialog.tsx suppresses.
- :430-444 - [P2] sheet metrics line: `n = {n} sessions · ~{weeks} weeks · … confidence` — "~" and "n =" is jargon for a non-coder audience (Oliver's voice rule); acceptable in "data zone" but "chance of error is high" fine.
- :487-491 "Full history" link - [P1] bespoke `Link` styled as a button: `h-9` (36px) < 40px; `bg-translucent` ok -> use `<Button asChild variant="outline" size="lg">` or `buttonClass` export. `rounded-sm mt-1` ordering weird.
- :507-560 RecommendationBlock - [P2] three near-identical blocks (`rounded-md bg-surface px-3 py-2` + title/body/stats) -> one `RecBlock({title, body, stats})`. `t("Keep going","Keep going")` / `t("Consider more volume","Consider more volume")` with identical args (:513, :538) -> dead `t()`; remove.
- :517 `sign`: `trend.pctChange > 0 ? "+" : ""` recomputed in 4 places (also :228, :425, TrendRow) -> `formatSigned()` helper in lib/format.
- :564 RecStatsLine - [P3] `Number.isInteger(x) ? x : x.toFixed(1)` repeated (also :452-456, stats.tsx, heatmap) -> shared.
- :598 ConditionSheet title `${conditionName} × ${outcome}` - [P3] "×" fine.
- :624,632 `rounded-sm … bg-surface` rows inside dialog; surface-on-surface? Dialog bg likely `bg-raised`; fine.
- :640 - [P3] confidence label ternary `confidence === "medium" ? "Medium" : "Low"` while ConditionRow prints raw `{finding.confidence}` lowercase -> make consistent.
- general - [P2] `Dialog` sheets: verify `overscroll-behavior: contain` in ui/dialog.tsx (outside this group).
- general - [P2] No URL state for the open finding (deep-link) -> low priority.

## screens/monthly-report.tsx

- :67,91-97 - [P0] `isLoading || !data` -> permanent "Loading…" if the query errored (data undefined, isLoading false) — error shows as eternal loading. Add `isError` branch with retry.
- :91-97 - [P2] bare `<p>` loading, no `role="status"`.
- :110-115 - [P2] empty copy ok, `t()` used. [P3] `mt-8 text-sm` differs from stats (`text-xs` in card) -> unify via shared `EmptyState`.
- :122-148 month picker - [P1] chips `h-9` (36px), horizontal scroller with no scroll affordance, no `aria-pressed`, `overflow-x-auto pb-1` leaves scrollbar visible on desktop; no `scroll-snap`. Selected chip not scrolled into view (default may be off-screen when many months) -> `scrollIntoView({inline:"center"})` on mount. -> shared Chip.
- :133 - [P3] className built with template literal rather than `cn()` (same in :400, year-review:97, measures:396) -> `cn`.
- :168-195 `trailing` computed 6x `distributionBetween` on each (year, month) change - [P3] fine memoized.
- :203-212 shareCard memo depends on `data`/`prefs`; fine.
- :240-246 PRs list - [P1] each PR `Link` row: two-line content (name+type) inside `rowClass()` fixed 44/32px height -> two lines of `text-xs` + `text-2xs` (16+18=34px) squeezed on desktop (32px) -> clipping. Also duplicated verbatim in year-review.tsx:275-305 (PR list) -> extract `PrRow`.
- :248-279 - [P2] unlimited PR list (no cap) vs year capped at 20; inconsistent.
- :281-292 calendar - [P1] `MonthHeatGrid` cells are `div` with no accessible name; workout days indicated only by color (accent vs surface-2) -> non-color cue: add `aria-label="{day}: workout"` or visually-hidden text; also `title`. Grid not marked `role="img"`/summary (text summary below helps; ok).
- :294-333 dist chart - [P2] `YAxis hide width={0}` + no value labels -> bars unlabeled except in tooltip (touch has no hover; tooltips on tap OK). [P3] DIST_CONFIG duplicated from stats.tsx:445.
- :298 `className="h-42 w-full"` - ok token.
- :306 `round1` defined here (bottom :596) and in measures.tsx:75 and year-review inline `Math.round(r.sets*10)/10` -> shared.
- :335-352 top exercises - [P2] shows "3×" meaning sessions; unclear -> "3 sessions"; non-clickable (stats' "Favorite exercises" are links to /exercises/:id) inconsistent -> link.
- :373-377 `trendConfig` rebuilt each render (not memoized) -> useMemo; resets Recharts config context.
- :381-390 `fmt` closure; `LabelList` `fontSize={10}` (:~433) and `fill="var(--color-text-secondary)"` — [P1] 10px text below the 12px type floor (text-2xs); chart labels hardcode fontSize -> 12. Same in year-review.tsx:~230.
- :391-415 metric switcher - [P1] `h-7` (28px) buttons, tap target far under 40px, no `aria-pressed`. Segmented control on a mobile screen -> `h-9 md:h-7` at least, preferably shared SegmentedControl / Radix ToggleGroup (library-first rule: Radix toggle-group or tabs, not hand-rolled).
- :408 - [P3] `(["time","volume","sets"] as Metric[])` -> `Object.keys(METRIC_LABELS)` typed const array.
- :430 `LabelList … className="num"` on SVG text — Tailwind class on SVG text works; fine.
- :451-453 `{unit === "kg" ? "kg" : "lbs"}` - [P3] bypasses `unitLabel(unit)`; "lbs" vs "lb" inconsistent with stats.tsx (`unitLabel`).
- :485-520 TotalsSlide share - [P2] `ShareButton variant="ghost" size="icon" label={null}`: Button `icon` = size-8 (32px) -> below touch min; verify ShareButton aria-label when `label={null}` (outside group).
- :524, :551 `Stat` card `rounded-md bg-surface-2 p-3` x2 within file + year-review.tsx:340 duplicate `Stat` -> shared `StatTile`. PR count tile (:524-535) is a hand copy of Stat without delta -> use Stat.
- :539-566 `Stat` delta colors only pos/neg + ▲▼ glyph; "vs last month" repeated 4x clutter; `delta === 0` duplicates stats.tsx Delta -> shared.
- :541 `fmtDelta={(d)=>String(d)}` identity repeated -> default param.
- :569-591 `Slide` - [P2] exact duplicate of year-review.tsx:359 `Slide` and near-dup of stats.tsx `Section` (which uses shadcn Card) -> single shared `ReportSection`. [P3] `overflow-hidden rounded-md bg-surface` + `p-4`.
- :596 `round1` bottom-of-file const used above — fine.
- States: loading/empty/no-data OK; error missing; month with data but prior month absent -> deltas vs 0 show ▲ huge (no "no prior data" handling) [P2].

## screens/year-review.tsx

- :45,60-66 - [P0] same `isLoading || !data` eternal-Loading-on-error bug. 
- :34 `MONTHS` const fine. :35 `monthLongFmt` fine.
- :71-85 `years` derived by `new Date(startedAt).getFullYear()` — fine.
- :87 `activeYear` default `years[0]` OK.
- :94-109 year picker - [P1] `h-9` chips, no aria-pressed, same as monthly. If one year only, still a picker of 1 chip (noise) -> hide when `years.length===1`.
- :112-120 - [P2] empty copy references "n=0" in frog voice only; fine.
- :164-184 hero stats - [P2] `Stat` has `testId` only on first; fine. Active time/volume no delta vs prior year (monthly has deltas) -> inconsistent; ok.
- :189-203 most productive month - [P3] `text-lg font-semibold` heading style on a non-heading; fine.
- :206-250 regions chart - [P1] bar labels `fontSize={10}` (below 12px floor). `YAxis hide width={0}` ok. `Math.round(r.sets*10)/10` -> shared round1.
- :253-272 top exercises - [P2] no links, "{n}×" jargon -> "n sessions"; duplicate with monthly -> shared `TopExercisesList`.
- :275-307 PRs - duplicate of monthly :248-279 (see above). `slice(0,20)` with title count `review.prEvents.length` -> user sees "Personal records · 57" but 20 rows, no "show all" -> add "+37 more" text.
- :310-318 streak slide - [P3] single number in a whole Slide; fine.
- :319-336 calendar - [P1] `MonthDots` 12 mini grids; cells ~10px, color-only, `div` no labels -> `role="img" aria-label="{Month}: {n} workout days"` on each MonthDots wrapper. `grid-cols-3 sm:grid-cols-4` ok.
- :340-357 `Stat` duplicate (see monthly). :359-381 `Slide` duplicate.
- Year picker `px-4` vs monthly `px-3` inconsistent.

## screens/calendar.tsx

- :19-21 `monthShortFmt`, `WEEKDAYS` ["Su","Mo",…] hardcoded English weekday abbreviations, duplicated in report-calendar.tsx:35 -> `Intl.DateTimeFormat(undefined,{weekday:"narrow"})` / shared util. Hardcoded `["", "M","", "W","","F",""]` row labels (:~97) English-only.
- :41-60 `monthCells` + `Cell` type duplicated in components/report-calendar.tsx:11-31 (only param differs) and `dayKey` dup -> import the report-calendar version (add `firstWeekday` param) into calendar.
- :107 `const now = new Date()` recomputed every render; `useState` init ok. [P3]
- :111-114 - [P0] `useAllSessions()` loading/error ignored (`data = []`): while loading the grid shows an empty calendar and StreakCard shows "No workouts yet"; on error looks like a user with no history. -> `isLoading` skeleton, `isError` retry.
- :148-160 arrow-key effect - [P2] hijacks ArrowLeft/Right globally on this route, even when a Dialog (day sheet) is open or a Radix control focused (only INPUT/SELECT/TEXTAREA excluded; `contentEditable`, `[role=dialog]`, buttons/Radix Select not) -> skip when `sheetDay != null` or `e.defaultPrevented` or modifier keys held. [P3] `(e.target as HTMLElement)` cast.
- :162-174 `retroLog` - [P1] no try/catch, no pending state: failure is an unhandled rejection with no UI; double-tap creates two sessions (button not disabled while awaiting). Per AGENTS "errors actionable" -> pending flag + `userFacingRepoError` toast/inline error. Also `repo.startSession()` then `updateSessionStartedAt` is non-atomic (orphan session on 2nd failure).
- :185-187 - [P2] header `justify-between` with one child; leftover -> remove. No `BackButton` (tab root, ok).
- :190-231 pager - [P1] `IconButton title="Previous"/"Next"` no `aria-label`; `cal-zoom` `<button>` is bare-text with only `hover:text-soft` and no resting background (violates no-bare-button rule; also tap target = text height ~24px). -> give it a `bg-translucent` resting fill, `h-10`, `aria-label`. `title` strings not Title Case for context ("Previous month"/"Previous year" depending on view).
- :203-207 - [P2] zoom toggle semantic: `aria-pressed`/`aria-expanded` missing.
- :270-370 MonthGrid - [P1] day buttons `aspect-square` in `grid-cols-7 gap-1` at 390px ≈ 48px OK (>=40). Future-without-sessions rendered as `div` with `opacity-40` — [P1] `opacity-40` on `text-faint` text fails contrast; cells for today/future not announced. 
- :310-316 - [P0/P1] day button has no accessible name beyond the number ("14"); `title` isn't reliable -> `aria-label={`${formatDate(...)}${has?`, ${n} workouts`:""}`}`. Today not marked `aria-current="date"`.
- :317-325 - [P2] today-with-workout uses `bg-accent-hover` (hover token as state), today-no-workout uses `bg-active`: the 4 states (workout/today/both/empty) differ only by tone -> add non-color cue (ring or dot for today; count badge exists for multiple).
- :343-349 count badge - [P1] `text-[9px]` (below 12px floor; arbitrary size), `min-w-3`, `rounded-xs` ok. -> `text-2xs` and enlarge badge.
- :386-455 YearGrid - [P1] `style={{...}}` inline sizes with JS consts (`YEAR_CELL`=11, `YEAR_GAP`=3) — inline styles instead of tokens; `text-[9px]` x2 (:398, :417) below floor; cells are `div`s with `title` only (no a11y, no touch interaction) -> the grid is invisible to screen readers; provide a text summary (already shows total) plus `role="img" aria-label` on the scroller. Doc comment says cells intentionally non-interactive; but then month cell tapping requires zoom-out: ok.
- :417-421 month label column `width: YEAR_CELL*2` overlapping subsequent week columns? text overflow hidden none -> labels may overlap on short months; verify visually.
- :436-451 `opacity-40` future empty cells; `INTENSITY_BG` uses `bg-accent/35`,`bg-accent/65` — [P1] opacity-modifier colors rather than tokens; contrast of level 1 vs surface-2 low in day theme; legend (:459-466) swatches are bare `span`s with `className={bg}` + inline size — `span` is inline so width/height ignored unless display set! `<span style={{width,height}}>` with no `inline-block`/flex parent: parent is `flex` so items are flex children (blockified) OK.
- :457 legend "Less/More" - [P3] fine.
- :467-533 DaySheet - [P1] `Button variant="outline" size="lg"` ok; in-Dialog wrapper OK. Dialog opened only after `sheetDay` set; `onOpenChange` closes. [P2] `DaySheet` receives `onClose` and Link `onClick={onClose}` fine. Empty sessions copy ok.
- :485-488 - [P2] `sessions` list for a *future* day offers "Log a workout" — future days w/o sessions can't be tapped (div), good; past OK.
- :512-514 `StatusRing progress={0.5}` for partial: magic; fine.
- States: loading ✗, error ✗, empty (no sessions) partial via StreakCard text, day sheet ✓ (empty/non-empty), view month/year ✓.

## screens/measures.tsx

- :1-26 imports - [P3] mid-file import block after `const COMPARE_NONE` (imports at :12 and :18 split by a const) -> hoist all imports; biome organizeImports likely ignored.
- :60 `useMeasurements()` - [P0] no loading/error handling at all; failed fetch shows empty trend "No data yet — log a value above" and editor blank; typing then upserts over an unloaded day's entry (data-loss risk: `entry` undefined -> `upsert` with `patch` only for that key is a patch so ok, but photo path `entry?.id ?? upsert(...)` could create a dup row for the same date if the list hasn't loaded). Gate editor on `isSuccess`.
- :110-131, `commit()` - [P1] `upsert.mutate` no `onError`; failed saves silent. Field `onBlur` commits; optimistic? No feedback (no saved flash). Also unmounting before blur (route change) loses edits.
- :143-153 intro `p.text-2xs` ok.
- :215 Editor container `rounded-md mt-4 bg-surface p-4` fine.
- :224-236 date input - [P1] `Input h-11` but Input base is `h-8` + `border border-field` (allowed: text-field line). `type=date` has `max={localDate()}`; no `name`, no `autoComplete="off"`. Label `htmlFor` ok. `className="num h-11 w-44"` ok. Native date picker visual inconsistent but acceptable.
- :238-251 fields grid: 16 `Field`s all visible at once; [P2] long form, no grouping headers (Body / Upper / Lower), wide vs half layout encoded by `wide`. `key` includes date to remount (good). Fields lack `autoComplete="off"`, `name`, `enterKeyHint`. `inputMode="decimal"` ✓. Placeholder absent. Suffix `absolute` span ok.
- :241-250 `<img src alt="Progress" loading="lazy" className="h-16 w-16 object-cover">` — [P2] missing `width/height` attrs (CLS) though sized by classes; `rounded` missing (square corners = old identity? 0px ok by tokens but others use rounded-sm) -> add `rounded-sm`.
- :257, :832 photo `<label>` bare file-input buttons: `bg-translucent` resting fill ✓, `h-11`; but not keyboard-focusable (input `hidden` = display:none) — [P0] keyboard users cannot reach "Add progress photo"/"Replace" -> use `sr-only` input + `focus-within:ring`/label with `tabIndex`, or a Button that triggers `inputRef.click()`. Duplicate label markup x2 (:257, :832) -> `PhotoPickButton`.
- :259 `capture="environment"` forces camera on mobile, prevents choosing from library on some browsers -> remove `capture` or offer both.
- :270-292 `onPhotoPicked` - [P1] `resizePhoto` awaited with no try/catch (HEIC/createImageBitmap failure -> unhandled rejection, no message); upload `mutate` no error UI; no progress/pending indicator. `resizePhoto` is a copy of components/machines.tsx's (comment :866 admits "mirrors") -> shared `lib/image-resize.ts`.
- :330-420 Trends - [P1] metric chips: 16 chips, `h-9`, scroller; same chip duplication; no `aria-pressed`.
- :331 `const del = useDeleteMeasurement()` + inline confirm (:444-470): destructive confirm via inline swap OK; but "Delete" confirm button `Button size="sm"` (<40px?) and the row `IconButton danger` 40px ok. After setConfirmId no focus management; Cancel `ghost sm`.
- :408-438 chart header: `latest` "—" fine.
- :445-480 list - [P2] each row `<li className="flex items-center">`, `rowClass` used ✓; unbounded list (no virtualization >50 entries; daily weigh-ins → hundreds) -> `content-visibility:auto` or show recent 30 + "Show all".
- :478 `title="Delete entry"` IconButton no `aria-label` -> add; [P1] destructive delete of a row triggers a double-step; ok.
- :512-523 `Button variant="ghost" size="icon"` = 32px; `title="Share as image"` no aria-label; `ShareNetwork` icon. -> `aria-label`, size `icon-lg` on touch.
- :518-542 share-confirm Dialog: `Continue` label vague -> "Create Image" / "Share Image"; two Dialogs/stage. Copy "turns into a shareable image" ok.
- :548-554 comment says "no chart library (CLAUDE.md: minimal deps)" — [P1] contradicts AGENTS.md "Library components first… shadcn charts" and every other screen uses shadcn `ChartContainer`/Recharts (already in the lazy stats chunk; measures is lazy too). TrendChart (:556-648) is a hand-rolled SVG line chart: no tooltip/touch scrubbing, no y-axis, hard-coded W/H/pad, `fontSize="9"` (below floor), `stroke="var(--color-bg-active)"` baseline line (a "line"; brand forbids lines except text-field line), `fill="var(--color-text-secondary)"`, no hover/tap value readout, accessible name generic "Measurement trend" with no data. -> replace with shadcn `ChartContainer` + `LineChart` like findings.tsx `TrendChart` (consider extracting a shared `TrendLine` chart: findings.tsx:282 already implements the identical shape).
- :577 `h-[110px]` arbitrary -> `h-28`. 
- :596 `t0`... `const x = (t: number)` shadows i18n `t` from `useVoice()` (:567) inside the function -> naming collision, rename `ts`.
- :653-692 PhotoStrip - [P1] `PhotoThumb` `button` `size-20` (80px) ✓, no `aria-label` (img alt provides text "Progress 2026-…" raw ISO date) -> `alt` use formatted date. `rounded-sm` ✓, `bg-scrim` date overlay uses `text-ink` over scrim: contrast in light theme? scrim is dark in both; `text-ink` is dark in day -> [P1] low contrast (dark text on dark 32% scrim over photo). Use `text-white`-equivalent token (e.g. `text-on-scrim`) — check theme for token.
- :672-686 Dialog for viewer: photos list not paginated; all thumbs fetch signed URLs on mount (`useProgressPhotoUrl` per thumb; N requests) -> lazy.
- :738-745 `PhotoImg` `<img>` no `width/height`; fallback `div` ok. 
- :764-775 PhotoViewer `onDelete` - [P1] runs mutate then `onClose()` immediately; no error handling, and `keepsData` path vs delete path ok. Confirm UI is inline; fine.
- :800-824 compare Select - [P2] `Select.Trigger` with `aria-label` ✓ and wrapped in `<span>` containing visible text "Compare with" (label not associated) — duplication; ok.
- :820 `COMPARE_NONE` sentinel comment fine.
- :829-857 action row - [P2] `pt-3` leftover from removed border (`border-t`?) in :236 `pt-3` also suggests a removed divider; harmless.
- :866 `resizePhoto` copy (see above); `canvas.getContext('2d')` fallback returns original file silently (HEIC unsupported -> uploads huge file).
- Dates: `localDate()` hand-formats YYYY-MM-DD (:78-84) -> `localDateKey` exists in core and is used by calendar.tsx -> reuse (duplicate).
- States: loading ✗, error ✗, empty trend ✓, no photos ✓ (strip hidden), confirm-delete ✓, share confirm ✓, viewer ✓, upload pending ✗.

## components/charts/body-heatmap.tsx

- [P1] DEAD CODE: `BodyHeatmap` is exported but imported nowhere (rg: only human-body-heatmap used by stats.tsx:31 and home.tsx:5). Its comment block (:1-21) still describes the old frog-figure; tests in body-paths.test.ts keep `PART`/`VIEW_REGIONS` alive only for lib/share/graphics.ts (canvas) -> delete body-heatmap.tsx (218 lines) if the share painter is the only remaining user of body-paths; also delete the duplicated chips/readout/`formatSets`. If kept, it duplicates chip+readout UI from human-body-heatmap.tsx:140-175 verbatim.
- :56-79 hardcoded `strokeWidth={0.8}`, `fontSize="9"` (below floor).
- :95-105 `role="button" tabIndex=0` on `<g>` with `aria-label="{region} region"` raw enum key (e.g. "chest region") -> ok but part of dead code.
- :104 `transition: "fill-opacity 150ms"` inline style without reduced-motion exemption (global rule catches `transition-duration` ✓).
- :200-209 chips `h-7` (28px).

## components/charts/human-body-heatmap.tsx

- :13-36 PALETTE: `color-mix(in srgb, var(--chart-1) X%, var(--color-bg-page))` computed at module load as strings with CSS vars -> OK and theme-safe.
- :43 `BODY_COLOR = "var(--color-bg-hover)"` fine.
- :72-88 `Figure` `<Model>` from react-body-highlighter: [P1] a11y — library SVG has no `role`/`aria-label`/title; interactive muscles are click-only `onClick` (no keyboard). The chips below are the keyboard alternative ✓ (only when `interactive`). The non-interactive Home teaser has no text alternative at all -> wrap in `role="img" aria-label="Muscles trained, front and back: <summary>"`.
- :78 `style={{ width: "100%", aspectRatio: "100 / 200" }}` / `svgStyle` inline -> tailwind `w-full aspect-[1/2]`.
- :80-82 caption "Front"/"Back" `text-2xs` ✓.
- :99 `max` default: `Math.max(1, …)` ✓.
- :112 `freq` bucketing ✓. 
- :113-124 `data` recomputed each render, `Model` receives new array each render -> memoize (`useMemo`).
- :140-175 chips: `h-7` (28px) tap target on mobile (it's the keyboard/touch alternative for region selection) -> `h-9 md:h-7`; no `aria-pressed`; `isSel` branch drops `transition-colors` (inconsistent). Only the selected region's readout appears at far right via `ml-auto`, wrapping on narrow screens.
- :171 `selected` readout lacks `aria-live="polite"`.
- :179-183 `formatSets` duplicate of body-heatmap & stats `formatCount`.
- [P3] State `selected` isn't reset when `muscleSets` changes (week offset change keeps stale selection) -> fine but readout may mislead; key by testId.
- [P3] Header comment says "(stats hub, M8)" and references decisions; ok.

## components/charts/body-paths.ts / body-paths.test.ts

- body-paths.ts - [P3] comment :1-21 references `body-heatmap.tsx` as the interactive consumer (dead). If BodyHeatmap is deleted, update. Exports `PART` as `Record<string,string>` (stringly typed; typo => `undefined` path) -> `as const` keyed type. Test file ok (not reviewed beyond existence).

## components/report-calendar.tsx

- :11-31 `Cell`/`monthCells`/`dayKey` duplicated in screens/calendar.tsx:35-60 (see above).
- :35 `WEEKDAYS` English hardcoded duplicate.
- :50-75 `MonthHeatGrid` - [P1] cells `div` with color-only state, no per-cell label; day number visible but "has workout" conveyed only by tone (surface-2 vs accent) -> add `aria-label`/sr-only "workout". `bg-surface-2 text-faint` -> low contrast numbers (faint = text-secondary token, ok).
- :56-63 header cells no `scope`; fine (div grid). Square cells `aspect-square` with no rounded (0px) while other cells use `rounded-xs` (MonthDots) and calendar.tsx cells have none -> inconsistent corner usage across calendar renderings; pick `rounded-xs`.
- :87-110 `MonthDots` `gap-px` (1px gaps = hairline lines look), `rounded-xs` ✓; no label; `<div>` per cell x ~365 per year fine.
- No `testId` passed by monthly-report -> unused prop? (MonthHeatGrid's `testId` never supplied) [P3].

## components/report-promo.tsx

- :19-27 `dismissed()` reads legacy `sbl:` prefix; comment: "Safe to drop one release after 2026-07-28" — [P2] stale (today is 2026-11-04) -> remove legacy read.
- :34 `new Date()` evaluated each render; `sessions.some` O(n) on each render x2 -> memo.
- :43-47 magic: `now.getDate() <= 7`, `getMonth() === 11` fine.
- :70 `hidden` Set state + localStorage ✓.
- :119-146 PromoCard - [P1] outer `div` is a container with `Link` + `IconButton`; fine. `rounded-md` ✓. IconButton `title="Dismiss"` no `aria-label` -> add; `X` icon no aria-hidden. Link has no `aria-label`; its content label+sub is accessible name ✓. Focus ring on Link: global `:focus-visible` ✓.
- :125 `bg-accent-soft` card with `text-ink` / `text-soft` on accent-soft: verify contrast in night mode.
- [P2] `Sparkle` for monthly and `CalendarDots` year: ok Phosphor.
- [P2] when both show, stacking fine. No loading state (returns null) ✓ appropriate.

## components/streak-card.tsx

- :20-23 `computeStreak(...Date.now())` run every render, no memo -> `useMemo`.
- :26-31 rest copy: "No workouts yet" / "Trained today" fine; `"· {rest}"` hard-coded interpunct.
- :34 `rounded-md bg-surface p-4` + `className ?? ""` template -> use `cn`.
- :36-39 `Flame` icon decorative no `aria-hidden` -> add; heading is a `div` not heading (fine, label).
- :45 `<p>` composed of 3 spans, number alone `num text-2xl` ✓ tabular.
- [P3] frog-voice text: "Consistency, n=${weeks}" — number inside a joke register; AGENTS: "numeric data is never inside a joke". `n=${weeks}` is data in frog copy -> move number out.
- States: no data ✓, pending ✓, loading ✗ (parent passes `starts`; while `useAllSessions` loads it shows "No workouts yet" falsely) -> accept `loading` prop.

## components/train-findings-card.tsx

- :9 `useFindingsData` error ignored; `isLoading` -> returns null (layout shift when it pops in) -> reserve height / skeleton; on error shows "Log 2 sessions…" fallback (failure-as-empty) -> branch `isError` to hide card.
- :13-17 `computeFindings` runs again here AND in findings.tsx (full recompute, expensive over all sessions) with no shared cache -> move to a `useFindings()` query-derived hook with `select` memo.
- :40-46 trend body: `{trend.verdict.toLowerCase()}` inside `num` span (not a number); `(` `)` + conditional string -> fine but jsx whitespace hack `{" "}(`.
- :84-96 `Link` card: no hover state (`transition-colors` w/o hover) - [P1] card looks static; no chevron affordance -> add `hover:bg-surface-hover` + `CaretRight`. Filename/comment says "Train" but rendered on Home (home.tsx:100); stale naming -> rename `home-findings-card` or fix comment.
- :88 `ease-(--ease-out-quad)` OK.
- :94 `Flask` icon no aria-hidden. 
- Frog-voice: `"…sessions of any exercise and it will reconsider."` fine; `<span className="num text-ink">2</span>` hardcoded threshold 2 (also findings.tsx `/2`, `/10`) -> constants from core.

---

## States inventory

| Screen | Loading | Empty | Error | Modal/sheet | Onboarding |
|---|---|---|---|---|---|
| stats | text only, no status role | ✓ banner (but sections still render) | ✗ renders as empty (P0) | – | – (copy only) |
| findings | text ("Analyzing…") | ✓ | ✗ renders as empty (P0) | ✓ TrendSheet, ConditionSheet | countdown rows ("On the way") ✓ |
| monthly-report | text only | ✓ | ✗ eternal Loading (P0) | – | – |
| year-review | text only | ✓ | ✗ eternal Loading (P0) | – | – |
| calendar | ✗ (shows empty calendar + "No workouts yet") | partial (no sessions in day ✓; whole-account ✗) | ✗ (retroLog failure unhandled too) | ✓ DaySheet | – |
| measures | ✗ | ✓ trend empty, photos hidden | ✗ (mutations silent) | ✓ share confirm, share sheet, photo viewer, inline delete confirms | – |
| report-promo (Home) | n/a (null) | n/a | ✗ | – | – |
| streak-card | ✗ (false "No workouts yet") | ✓ | ✗ | – | – |
| train-findings-card (Home) | null (layout shift) | ✓ fallback | ✗ (failure shown as 'log 2 sessions') | – | ✓ countdown |
| human-body-heatmap | n/a | all-neutral figure | n/a | – | – |

## Cross-cutting (fix once in shared code)

1. **Query error/loading boundary for data screens (P0).** All six screens treat `isError` as empty/loading. Add a shared `QueryState`/`ScreenState` component (`components/ui/query-state.tsx`: loading skeleton with `role="status"`, error with `text-neg` message through `userFacingRepoError` + retry Button, empty slot) and use it in stats, findings, monthly-report, year-review, calendar, measures, streak-card, train-findings-card. Report screens: `if (isLoading || !data)` must become explicit `isError` check.
2. **Chip/segmented control (P1).** Hand-rolled in stats.tsx:`Chips`, monthly-report:133 & :400, year-review:97, measures:396, human-body-heatmap:155, body-heatmap:200, share-sheet. Heights 28–36px < 40px touch, no `aria-pressed`, template-literal classNames. Create `components/ui/chip-group.tsx` (Radix ToggleGroup per library-first rule): `h-10 md:h-8` (or `h-9`), `aria-pressed`/`role=radiogroup`, resting `bg-translucent`, selected `bg-accent-soft text-accent-ink`.
3. **Shared report section/stat/delta (P2).** `Slide` (monthly, year), `Section` (stats), `SectionLabel` (findings), PhotoStrip h2 are one component; `Stat` duplicated (monthly, year), `Delta` (stats, monthly Stat). Extract `components/ui/section.tsx` + `stat-tile.tsx` + `delta.tsx`; share `PrRow` list (monthly/year), `TopExercisesList`.
4. **Calendar utilities (P2).** `monthCells`/`Cell`/`dayKey`/`WEEKDAYS` duplicated between calendar.tsx and report-calendar.tsx; unify (with `firstWeekday` param, `Intl` weekday names). `localDate()` in measures duplicates `localDateKey`.
5. **Number/format helpers (P2).** `formatCount`/`formatSets`/`Number.isInteger(x)?x:x.toFixed(1)`/`round1`/signed-percent `pctChange>0?"+":""` repeated across ~8 places; move to `lib/format.ts` (`formatCount`, `round1`, `formatSigned`) and use `Intl.NumberFormat` compact for axis ticks (stats.compactNumber vs report-format.compactVolume).
6. **Icon-only buttons (P1).** `IconButton`/`Button size=icon` with only `title=` in stats (week prev/next), calendar (prev/next), report-promo (dismiss), measures (delete, share). Make `IconButton` require `aria-label` in its TS type (replace `title` usage; derive `title` from it), and set `aria-hidden` on Phosphor icons via a single wrapper/default prop. Also `Button size="icon"` (32px) lacks the 40px touch bump `IconButton` has -> `size-10 md:size-8` in button.tsx `icon`.
7. **Minimum type size (P1).** `text-[9px]` (calendar x3), SVG `fontSize={9|10}` (measures, body-heatmap, monthly/year LabelList) are below the 12px `text-2xs` floor. Add a chart label size token (12) and ban arbitrary `text-[Npx]`.
8. **Chart wrapper (P2).** Every chart repeats `ChartContainer` + `margin {top:4,right:4,left:0,bottom:0}` + `accessibilityLayer` + axis props (`tickLine={false} axisLine={false}`), `DIST_CONFIG` duplicated (stats, monthly) with a text-color token as series color, and inconsistent `role="img"`/`aria-label` use. Provide `components/charts/` wrappers (`BarSeriesChart`, `TrendLineChart`) and a `--chart-2` muted token for "previous"; replace measures.tsx hand-rolled SVG chart with the shared line chart (findings.tsx `TrendChart` is the template). Drop dead `body-heatmap.tsx`.
9. **Dialog/sheet focus & open lifecycle (P2).** findings/measures/calendar conditionally mount `<Dialog open>` so exit animation and focus-return are lost, and Radix warns on missing Description. Make shared `Sheet` helper taking `open` + last-value retention, with `aria-describedby` default.
10. **Hover-less link cards (P1).** `ReportButton` (stats), `TrainFindingsCard`, measures photo thumb have no `hover:` state; add a shared `NavCard` (hover:bg-surface-hover, CaretRight) or `rowClass()`.
11. **Failed mutations are silent (P1).** calendar `retroLog`, measures `upsert/delete/upload/resizePhoto`, all lack try/catch/onError. Add a mutation `onError` default in the app QueryClient (toast via `useVoice` register + `userFacingRepoError`) and pending-disable on creating actions.
12. **Hidden file inputs not keyboard-reachable (P0).** measures.tsx:257 & :832 `input.hidden` (display:none) inside a `<label>`; extract `FilePickButton` using `sr-only` input + `focus-within` ring (also components/machines.tsx per comment).
13. **Stale/legacy (P2/P3).** report-promo `sbl:` fallback past its stated expiry; train-findings-card name vs placement; threshold magic numbers (2, 10) duplicated in UI; `t()` calls with identical human/frog args in findings.tsx:513,538; `title` strings used as tooltips on touch.
14. **Frog voice vs data (P3).** streak-card puts `n=${weeks}` inside joke copy; findings frog strings embed percentages ("the frog approves") — AGENTS says numbers are never inside a joke. Move numerals into a separate `num` span outside the register.
