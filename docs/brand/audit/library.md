# Audit: library group

Files: screens/library.tsx, screens/exercise-detail.tsx, components/{exercise-editor,machines,attach-machine,machine-catalog-picker,exercise-filter,anatomy-ui}.tsx (all under apps/web/src). Review-only; nothing else edited.
Greps run: outline-none, transition-all, off-scale radii, hex/rgb, raw palette colors, lucide, any-casts, div/span onClick: **all clean** except the `border border-field` textareas noted below. No lucide, no `...` three-dot literals, no `any`.

## screens/library.tsx

- library.tsx:636 - [P1] raw `<textarea className="border border-field ... px-2 py-1 text-xs">` (no radius token, no h/focus style, hand-built copy of Input chrome; same copy at exercise-editor.tsx:648 and machines.tsx:204) -> add `Textarea` to `components/ui/input.tsx` (same classes as Input: `rounded-sm border border-field bg-sunken px-3 py-2 text-sm text-ink outline-none placeholder:text-faint focus-visible:border-focus`) and use it in all 3 places.
- library.tsx:634 - [P2] placeholder "One exercise name per line" lacks `…`/example -> `"One exercise name per line, e.g. Zercher Squat…"`; textarea has no `aria-label` -> add `aria-label="Exercise names"`, `spellCheck={false}`, `autoComplete="off"`, `name="names"`.
- library.tsx:650 - [P1] raw `<input type="checkbox" className="size-4 accent-(--color-accent-mark)">` (also :979). 16px target, native widget, not themed -> shared `Checkbox` (shadcn/Radix checkbox) or at min wrap label in a 40px row (`min-h-10`). Same in ExerciseRow metric toggles (:979).
- library.tsx:316-331 - [P1] "Yours" toggle is a bespoke `<button>` `h-8` (32px) on a mobile-first filter row, tone toggle duplicated with exercise-detail.tsx:172/289/387, exercise-editor.tsx:800 (SegmentedButton), anatomy-ui.tsx:70 (tier chips) -> extract one shared `ToggleChip`/segmented component (h-10 on touch, `md:h-8`) in components/ui and use everywhere (see Cross-cutting).
- library.tsx:313-330 - [P3] `t("Yours","Yours")` pointless voice call, same string both registers -> plain `Yours`. Same at :501 `t("Favorites","Favorites")`.
- library.tsx:341 - [P2] wrapper has `rounded-md` placed before `mt-4` (class order only) -> fine; but loading/empty/error branches live inside the card while "Retry" is `variant="outline" size="sm"` (32px) -> `size="lg"` on touch.
- library.tsx:342-346 - [P2] loading is text only "Loading…" -> acceptable but no `role="status"`/`aria-live`; add `role="status"`.
- library.tsx:347-365 - [P2] error text `text-neg` has no `role="alert"`. Add.
- library.tsx:372-479 + 485-537 - [P1] ExerciseRow list copy-pasted **5 times** (muscle group, search flat, recent, favorites, rest), each passing the same 9 props (:395-408, :418-430, :460-473, :492-505, :511-522). -> one `renderRow(ex, {groupMuscle, flat})` helper (or `<ExerciseList items flat groupMuscle .../>`) and one `<BandHeader label count/>` for the 3 identical `<header className="flex h-8 ...">` blocks (:382, :452, :482).
- library.tsx:341/385 - [P1] `<ul>` has `[&>*+*]:mt-0.5` 2px row gap -> a "line" separator by gap; fine per row convention. But `<header>` band labels are static `h-8` (32px) while toggle button inside (:385-393) is only 32px tall (collapse header) -> exempt by convention, OK. However muscle-group header is `<header>` not heading; no `aria-expanded` on toggle (:385) -> add `aria-expanded={!collapsed.has(group.key)}`.
- library.tsx:394,453,483 - [P3] `tracking-widest uppercase text-2xs` section label repeated 14x across group (also :751,:776,:1214, machines.tsx:23, attach-machine.tsx:57,:69, machine-catalog-picker.tsx:89, exercise-editor.tsx:428,:473,:521,:762, exercise-detail.tsx:457,:533,:703) -> add `SectionLabel` component / `@utility eyebrow` in theme.css.
- library.tsx:296-310 - [P2] `ExerciseEditor` mounted only when `editorTarget` truthy, then `open={!!editorTarget}` always true -> Radix close animation never runs and `open` prop is redundant; either keep mounted with `open`, or drop the conditional. Also `exercise-editor` reset effect depends on `open` flip, which never flips here (mount each time) -> works only by accident.
- library.tsx:615-627 - [P1] disabled trigger conveys reason only via `title` (not available on touch/not a11y-reliable) -> visible hint text under button when `!libraryLoaded`, or `aria-describedby`.
- library.tsx:608-626 - [P2] "Bulk add" is `variant="ghost" size="sm"` (32px) in header row beside 40px? primary `Button` default md (32px). OK parity; but ghost is `bg-secondary/60` weak at rest. Acceptable per brand.
- library.tsx:697-714 - [P1] failure notice dismiss is a literal `×` text glyph in a bare `<button className="px-1 text-faint hover:text-neg">` with `title="Dismiss"`: no resting background (violates no-bare-buttons), ~20px target, no `aria-label`, not Phosphor. -> `<IconButton danger aria-label="Dismiss" title="Dismiss"><X className="size-4"/></IconButton>`. Same bug: library.tsx:1150-1161 (tag remove ×), machines.tsx:330-336 (setting remove ×).
- library.tsx:698 - [P2] `<p role="status">` containing a button; role=status on interactive container -> move button outside the status node.
- library.tsx:740-747 - [P0] `DialogTrigger` Info button: `p-1` (~24px) bare icon, no resting background, no `aria-label` (only `title`), on every muscle header -> `<DialogTrigger asChild><IconButton aria-label={`Best for ${...}`}><Info/></IconButton></DialogTrigger>`.
- library.tsx:751-754 - [P3] `<h3>` under dialog title with no `<h2>` between; fine because DialogContent title. OK.
- library.tsx:782-797 - [P3] `BestForMuscle` computes `ratings`/`ranked` on every render of every group header even when dialog closed (sorts whole library per header render) -> compute inside dialog content child component (only mounted when open).
- library.tsx:803-815 - [P3] inner callbacks shadow the `t` voice function: `(t) => t.muscle === muscle` (:785, :838), `exercise.tags?.map((t)=>` (:957), `(exercise.tags ?? []).map((t)=>` (:1144), `METRIC_TYPES.map((t)` (:1233) -> rename to `tag`/`target`.
- library.tsx:836-878 - [P1] ExerciseRow header `div` has `transition-colors ... hover:bg-surface-hover` but is not itself interactive; only the name text is a button -> hover implies whole row clickable. Make the whole name+thumb region the toggle button, or drop hover.
- library.tsx:880-897 - [P1] row toggle `<button>` `disabled={pending}`, tap target = name text only, height ~20px (single line text-sm) -> expand hit area (`py-2 -my-2`, `min-h-10`). No `aria-expanded`/`aria-controls` -> add `aria-expanded={expanded}`.
- library.tsx:898 `saving…` ok.
- library.tsx:899-915 - [P2] inline badges `shared`/`yours` hand-rolled spans with `rounded-sm` vs `rounded-xs` inconsistent; `ui/badge.tsx` exists -> use `Badge`. Lowercase copy "shared"/"yours" vs Title Case elsewhere.
- library.tsx:916-921 - [P1] FavoriteButton (anatomy-ui) + IconLink arrow: IconLink has only `title`, no `aria-label` -> add `aria-label`. Link is the only way to open the detail (name toggles expand) - the 40px IconLink is fine.
- library.tsx:930-950 - [P3] decorative `<span className="size-1 bg-accent" />` dot (also :956) is a hand-drawn bullet; `Barbell` icon reused for both equipment AND machine (:933, :942) -> distinct icon for machine (e.g. `Gear`/`Wrench`); ensure `aria-hidden` on both Barbell icons (Phosphor icons default no aria-hidden? they render `<svg>` without role; add `aria-hidden` via shared wrapper).
- library.tsx:938-945 - [P3] `EQUIPMENT_LABELS[exercise.equipment as keyof typeof EQUIPMENT_LABELS]` cast duplicated in exercise-detail.tsx:136; `exercise-editor` uses `EquipmentDisplayKind` -> add `equipmentLabel(key)` helper in core.
- library.tsx:964 - [P2] expanded panel `rounded-sm bg-surface-2 px-4 py-2 pl-10`: `px-4` then `pl-10` conflict (redundant); radius on a full-width inset block inside an overflow-hidden card -> drop `rounded-sm`.
- library.tsx:979-993 - [P1] metric checkbox rows 16px target, `label` is `text-xs` (see checkbox above); `m.type` raw enum shown ("number") -> label it.
- library.tsx:1033-1076 - [P1] Archive confirm Dialog nested inside the expanded row `li` with `content-visibility:auto` + inside a memoized list of ~900 -> `Dialog` mounts per expanded row only (OK), but Cancel is `variant="ghost"` and confirm `primary`; archive is destructive -> use `variant="danger"`? Brand: primary one per view. Keep; but copy "It's hidden…" uses straight apostrophe `It's`/`can't` (:1030, :1017, etc.) -> curly `’` throughout (guideline) - applies to whole group (grep `'` in JSX text).
- library.tsx:1000-1030 - [P2] shared-row notice says "RLS-immutable" in comment: stale (no RLS since Convex; AGENTS.md says Convex functions are the boundary). Same stale term exercise-detail.tsx:809. -> reword "immutable (ownerId null)".
- library.tsx:1139-1195 - [P1] `TagEditor`: tag chip `rounded-sm` remove `×` glyph (see above); `Input className="h-6 w-24"` = 24px input on mobile (below 40px, violates tap-target); `placeholder="+ tag"` no aria-label; comma handling does setTagDraft then addTag reading stale `tagDraft` (addTag uses closure `tagDraft`, which is the OLD value) -> BUG: typing "abc," calls `setTagDraft("abc,")` then `addTag()` which trims the previous state ("ab"), so adds "ab" and drops "c"? (exercise-editor.tsx:addAlias already fixed by taking `raw`). -> `addTag(raw = tagDraft)` and call `addTag(e.target.value)`.
- library.tsx:1165-1180 - [P3] `tagsRef.current = exercise.tags ?? []` assignment during render (write ref in render) -> ok-ish; React 19 lint prefers effect.
- library.tsx:1198-1201 - [P3] `METRIC_TYPES` raw values rendered in Select (`number`, `scale`) lowercase, not Title Case.
- library.tsx:1224-1226 - [P2] metric name `Input` has no `aria-label`/`name`, placeholder lacks `…`. Add `aria-label="Metric name"`.
- library.tsx:1246-1252 - [P2] `Select.Trigger` for metric type has no `aria-label`.
- library.tsx:1253 - [P3] `<ul className="rounded-md mt-3 [&>*+*]:mt-0.5 overflow-hidden bg-surface">` same list chrome repeated: machines.tsx:30, attach-machine.tsx:61, machine-catalog-picker.tsx:127, exercise-detail.tsx:477,:561 -> `ListCard` component.
- library.tsx:1260 - [P1] metric rows: `Row interactive={false}` + `IconButton danger` with only `title="Delete metric"` and **no confirmation** (destructive) -> `aria-label`, and confirm/undo. Also machines.tsx:238 delete machine immediately with no confirm; library.tsx:1160 tag remove OK (low stakes).
- library.tsx:1205-1210 - [P2] MetricsSection/MachinesSection have no loading or error state (`useMetrics`/`useMachines` default `[]`, failures render as empty) -> violates "failed query must never render as empty"; read `isError` and show error + retry.
- library.tsx:274 - [P3] `pb-20 md:pb-6` ok per convention.
- library.tsx:1 whole - [P2] 1279 lines in one screen file; split BulkAddDialog/BestForMuscle/ExerciseRow/TagEditor/MetricsSection into `components/library/*`.
- library.tsx:123-128 - [P3] `CV_ROW` inline style object ok.
- library.tsx:326 - [P3] hover on selected state removed - fine.
- library.tsx:285-292 - [P3] Dialog `Retry loading library` button appears on header row only when failed, duplicate of the in-list retry (:355) -> remove one.

## screens/exercise-detail.tsx

- exercise-detail.tsx:93-100 - [P1] `useExercise` `isError` ignored: failed fetch falls through to "Exercise not found." (renders failure as empty/not-found); `useRecordsData` failure silently renders empty charts/records/history ("No records yet") -> destructure `isError`, show error + retry for both.
- exercise-detail.tsx:98-104 - [P1] loading is bare text; whole screen blocked on `recLoading` (records for ALL sessions) even though exercise header could paint -> render header on `exercise`, show skeleton/"Loading…" only in tabs.
- exercise-detail.tsx:108-117 - [P2] `Link ... className="mt-2 inline-block text-xs text-accent-ink"` is a bare text link with no resting background; fine for inline nav links but this is the only action on the not-found screen -> use `<Button asChild>`-style or `rowClass`; also 18px target.
- exercise-detail.tsx:131-137 - [P3] header chip line prefixes `·` hand-built per span (`<span>· ...</span>`) -> join array with ` · `.
- exercise-detail.tsx:142 - [P2] `h1` `text-lg font-semibold tracking-tight` no `text-wrap: balance`/`break-words`; long custom names overflow flex (has `min-w-0` on parent, add `break-words`).
- exercise-detail.tsx:163-186 - [P0] tabs implemented as plain buttons: no `role="tablist"/"tab"`, no `aria-selected`, no panel association; `h-9` (36px) on a mobile screen. -> use Radix Tabs (library-first rule) or add roles + `h-10`; tab `t` shadows voice `t` (:164 `(["summary",...] as Tab[]).map((t)=>`) -> rename; ternary label chain :178-183 -> a `TAB_LABELS` record.
- exercise-detail.tsx:164 - [P3] `as Tab[]` cast, define `const TABS: Tab[]`.
- exercise-detail.tsx:162 - [P2] tab state `useState` not in URL (`?tab=`) - not deep-linkable (guideline); same for `range` (:228) and `metricKey`.
- exercise-detail.tsx:282-297 - [P1] metric chips `h-9` (36px), horizontal-scroll chips without `role`/`aria-pressed`, selected state conveyed by color only -> `aria-pressed`, `h-10` touch.
- exercise-detail.tsx:384-398 - [P1] range selector `h-8` (32px), no `aria-pressed`, text-2xs (12px). Same chip pattern, 3 copies (see Cross-cutting).
- exercise-detail.tsx:308-318 - [P2] empty chart: `data-testid="summary-chart"` duplicated on empty div and chart (intentional). `h-42` ok (Tailwind v4 spacing). `role="img"` + `aria-label` ok.
- exercise-detail.tsx:331-360 - [P2] recharts: `stroke="var(--color-y)"` token OK; `strokeWidth={1.5}`; no `isAnimationActive={false}` -> line animates on mount; honor reduced motion (set `isAnimationActive={!reduceMotion}`). Axis tick font: relies on chart.tsx.
- exercise-detail.tsx:310 - [P2] "No data yet." `t(...)` frog copy sits in the data panel (split rule: data area is "sacred, never goofy"): chart/records empty states use frog voice "The frog refuses to speculate" in the stats panel (:318, :466, :522) -> that is an "empty state" edge so allowed; but keep numeric text plain. OK. Flag P3.
- exercise-detail.tsx:355 - [P3] `latest == null || !metric ? "—"` em-dash placeholder fine.
- exercise-detail.tsx:408-420 - [P3] `RecordsSparkline`/`recordsSparkline` computed even when records tab share unused -> acceptable.
- exercise-detail.tsx:456-472 - [P1] `ShareButton ... size="icon"` = 32px (size-8) on touch; `label={null}` - verify it sets `aria-label` (check share-sheet.tsx:ShareButton) -> ensure `aria-label="Share records"`.
- exercise-detail.tsx:461 - [P3] `filename` slug built inline `.toLowerCase().replace(/\s+/g,"-")` (also machine-catalog-picker `slug`) -> shared `slugify` in lib/utils.
- exercise-detail.tsx:487-499 - [P3] `<CaretRight>` decorative without `aria-hidden` (all Phosphor icons in group lack `aria-hidden` on decorative use: exercise-detail.tsx:164..., library.tsx:386-390, :1109). Add via an icon wrapper or `aria-hidden` default (phosphor `IconContext.Provider value={{ "aria-hidden": true }}` at app root, once).
- exercise-detail.tsx:520-547 - [P1] Set-records disclosure toggle: bare full-width text button (exempt by convention) but no `aria-expanded`; 20px tall target -> `min-h-10` + `aria-expanded`.
- exercise-detail.tsx:559-575 - [P2] Row `<Link className={rowClass()}>` OK. Quote: `{r.reps} reps` pluralisation for 1 rep ("1 reps") -> pluralize.
- exercise-detail.tsx:587-596 - [P1] History empty text lacks `role`; OK. `HistoryTab` has no loading/error state of its own - an errored records query shows "No sessions with this exercise yet." (empty-for-failed). Fixed once at the screen level (see :93).
- exercise-detail.tsx:603-609 - [P2] history session `<li className="bg-surface">` not rounded while sibling list cards use `rounded-md overflow-hidden` -> inconsistent; add `rounded-md overflow-hidden`.
- exercise-detail.tsx:604 - [P2] hand-built row instead of `rowClass()` (`px-4 py-2`, no fixed height) -> `rowClass()`.
- exercise-detail.tsx:620-640 - [P3] set row `w-5` for set number: `10ᴸ` overflows at 2+ digits -> `min-w-5`.
- exercise-detail.tsx:662-675 - [P2] frame images: `key={url}`, `<img>` has no `width/height` (CLS) and `alt={exercise.name}` identical for every frame -> `alt={`${exercise.name}, step ${i+1}`}`, add `width/height` (or `aspect-square`). `bg-white` hardcoded on a span (also anatomy-ui.tsx:156, exercise-editor.tsx:1048) intentional for line art -> define `bg-art` token or comment-justify once; `bg-black` exercise-editor.tsx:1042 same.
- exercise-detail.tsx:682 - [P2] steps `key={step}` duplicate steps would collide -> key `${i}-${step}`.
- exercise-detail.tsx:709 - [P3] straight apostrophe `Why it's rated` -> `’`.
- exercise-detail.tsx:717-722 - [P3] `ACTION_RATINGS.find` per render of every rating, while `ratingsForExercise` already returns note/citations? (library `BestForMuscle` uses `r.note`/`r.citations` straight off `ratingsForMuscle`) -> inconsistent; use the data already on `r` if available.
- exercise-detail.tsx:780-852 - [P0] hand-rolled ⋯ dropdown: fixed full-screen invisible `<button>` backdrop (`aria-label="Close menu"`, `tabIndex={-1}`) + absolute `.floating` panel; no Escape handling, no focus trap/return, no `role="menu"`, no arrow-key nav, can clip on narrow screens; library-components-first rule says use Radix DropdownMenu (also used by session BlockMenu per AGENTS.md - check whether a shared one exists and reuse). IconButton lacks `aria-label` (`title="More"` only) and no `aria-haspopup`/`aria-expanded`.
- exercise-detail.tsx:803-815 - [P2] menu items `py-1.5` (~30px) < 40px tap target (menu item exemption is hover bg only; height still should be 40px on touch). `text-xs`, `size-3.5` icons.
- exercise-detail.tsx:812-825 - [P2] `disabled:hover:bg-transparent` ok.
- exercise-detail.tsx:787-799 - [P1] `duplicate()` closes menu then awaits `mutateAsync` with no pending state, no error handler (rejection unhandled -> uncaught promise) and navigates only on success; no feedback while saving -> try/catch + disable item + toast/voice error via `userFacingRepoError`.
- exercise-detail.tsx:851 - [P2] `ExerciseEditor` mounted unconditionally inside MoreMenu for every detail view -> it runs `useExercises()`, `useMachines()`, `useLastSets`, `useExercise` even when closed (hooks run regardless of `open`) = 4 extra queries on every detail load -> mount only `{editing && <ExerciseEditor/>}` (as library does) or split content into an inner component.
- exercise-detail.tsx:860-952 - [P3] `maxVal`/`sumVal`/`heaviest`/`setVol`... metric tables (≈100 lines) belong in `packages/core` (framework-free domain logic) or `lib/exercise-metrics.ts`; `M_BEST_TIME` and `M_LONGEST_TIME` have identical `compute` -> one metric. `sumVal` local `t` shadows nothing but is confusing.
- exercise-detail.tsx:1020-1040 - [P3] `formatPrValue`/`metricFull`/`metricTick`/`formatSet` all hand-format numbers and units ("reps", "/h") -> `Intl.NumberFormat`/shared formatters; `${n} reps` with n=1 -> "1 reps".
- exercise-detail.tsx:75 - [P3] `RANGE_LABELS` "3 months" etc fine; not Title Case ok.
- exercise-detail.tsx - [P2] no `<title>`/document-title update.

## components/exercise-editor.tsx

- exercise-editor.tsx:422-424 - [P2] Dialog = sheet; `autoFocus` on Name input at :432 -> on mobile pops keyboard immediately and covers sheet; use only when `mode==="create"` and desktop (`matchMedia('(pointer:fine)')`).
- exercise-editor.tsx:427-437 - [P1] "Name" label is `<span>` not `<label htmlFor>` (Input has `aria-label` so named; but the visible label isn't clickable). Use `<label htmlFor=...>` + `id`; same for every `<span className="text-2xs text-faint">label</span>` above a control: SegmentedField (:754-766 no group semantics), MusclePicker (:884), JointActionPicker (:921), AliasChips (:958), MediaField (:1018), LabeledSelect (:866) -> `<label>` or `role="group" aria-labelledby`.
- exercise-editor.tsx:436 - [P3] placeholder `Zercher Squat` should end with `…`; `name`, `autoComplete="off"`, `spellCheck={false}` missing on Name/alias/numeric fields.
- exercise-editor.tsx:446-458 - [P1] duplicate-warning `Open the existing one` is a bare `<button className="underline">` text button (no resting bg, ~18px target) -> `Button size="sm"` or `Link`. Also this should be an `<a>`/`<Link to>` (navigation) rather than a button+navigate (cmd-click guideline). Message lacks `role="status"`.
- exercise-editor.tsx:473,521,597... - [P3] eyebrow section labels duplicated (see library). Inconsistent: section 1-3 use `pt-4` for spacing only (separator-by-space ok).
- exercise-editor.tsx:545-555 - [P2] Measurement type `hint` "locked — has logged sets" lowercase fragment; explain fix: "Locked: this exercise has logged sets."
- exercise-editor.tsx:604-629 - [P1] numeric `Input` fields have `inputMode="numeric"` but `type="text"`; no `aria-label` (only adjacent `<span>` w/o association): reps min/max/rest are unnamed inputs -> `aria-label="Target reps minimum"` etc. `placeholder="8"` ok. Raw `parseInt` on possibly empty. `–` (en dash) between inputs ok.
- exercise-editor.tsx:632-637 - [P3] straight apostrophes `Doesn't` / `Trainer's` / `How it's performed` (:523) -> curly.
- exercise-editor.tsx:645-649 - [P1] raw textarea (see library.tsx:636); placeholder has em-dash example OK, lacks `…`; no `aria-label`.
- exercise-editor.tsx:672-700 - [P2] tier rows: per-muscle `LabeledSelect` has no label (the neighbouring span isn't associated) -> pass `aria-label`; `LabeledSelect` has no `aria-label` prop at all (only visual `label` span) → every `Select.Trigger` in the editor is unnamed to AT unless `label` passed (equipment/machine/etc. pass `label` but as non-associated span; "+ muscle"/"+ action" selects have neither). Add `aria-label` plumb-through + `htmlFor`.
- exercise-editor.tsx:704-722 - [P1] footer: Cancel/Save inside scrolling body? Footer is within `DialogContent` children below the form column; not sticky -> on a long form (Reference + Advanced open) Save scrolls off-screen on phone. Make the footer sticky (`sticky bottom-0 bg-raised pb-[env(safe-area-inset-bottom)]`) or move to DialogContent footer slot.
- exercise-editor.tsx:707-714 - [P3] warn copy "Not shared — includes a machine or demo photo." fine.
- exercise-editor.tsx:740-749 - [P1] CollapsibleSection toggle: `aria-expanded` missing, `<button>` text-only 40px tall OK; caret icons not `aria-hidden`. Library-first: use Radix `Collapsible`/`Accordion`.
- exercise-editor.tsx:763 `SegmentedButton` - [P1] no `aria-pressed`, no role=radiogroup -> use Radix ToggleGroup (type="single") — library-first; 3rd copy of toggle-chip tone (see Cross-cutting).
- exercise-editor.tsx:832-858 - [P3] `LabeledSelect` with `value=""` + Radix: comment explains controlled "" trick; but Radix Select with `value=""` shows placeholder OK. Fine.
- exercise-editor.tsx:886-905 - [P2] each `LabeledSelect` "+ muscle" renders a full-width (`w-full`) trigger inside a `flex-wrap` chip row → the add control becomes 100% width, wrapping onto its own row -> pass `triggerClassName="w-32"`.
- exercise-editor.tsx:990-1010 (`Chip`) - [P1] remove `X` button: `size-5` (20px) target, `title="Remove"` only (no `aria-label`, and not naming which chip) with no resting background -> `aria-label={`Remove ${children}`}`, 32-40px hit area (`size-8`), tone bg. Chip is hand-rolled; `ui/badge.tsx` exists.
- exercise-editor.tsx:1013-1027 `MediaField` - [P2] `<img alt="Exercise demo">` w/o width/height; `<video controls>` (biome-ignore for captions acceptable) `bg-black` hardcoded -> token (`bg-scrim`?) or comment; `bg-white` hardcoded.
- exercise-editor.tsx:1052 - [P1] file input hidden inside `<label>`; label has `cursor-pointer` but no keyboard focus path (input `className="hidden"` = `display:none`, not focusable) -> keyboard users cannot add media. Use `sr-only` input + `focus-within:` ring on label (same bug in machines.tsx:217-228 and :307-327).
- exercise-editor.tsx:1062 - [P3] `Remove` clears media w/o confirm (edit mode immediately deletes server media) -> undo/confirm.
- exercise-editor.tsx:239 - [P3] `mechanic as Mechanic | null`, `exerciseType as ExerciseType` casts (:157,:158); `(v || null) as Tier | null` (:690) ok-ish; `LabeledSelect onChange={(v)=>setExerciseType(v as ExerciseType)}` (:556) -> type guards.
- exercise-editor.tsx:300 - [P3] `onMediaPicked` swallows resize errors into one message; fine. Cleanup: none for object URLs; fine (no object URLs).
- exercise-editor.tsx:361-383 - [P1] `create.mutateAsync(...).catch(() => {})` then `onCreated`/closing sheet; on failure user input is lost silently (sheet already closed; relies on `useCreateExercise` failure notice). Documented; P3.
- exercise-editor.tsx:116-145 - [P2] editor runs 6 queries on mount (useExercises (whole library), useMachines, useLastSets, useExercise, useExerciseMediaUrl...) even when `open=false` because callers mount it unconditionally (exercise-detail MoreMenu; check session/routine callers) -> `if (!open) return null` wrapper component or conditional mount.
- exercise-editor.tsx:151-165 - [P3] 18 `useState` draft fields + one-shot sync effect (appliedRef) - consider `useReducer`/form lib; resets use effect-with-ref pattern; works.
- exercise-editor.tsx:1 whole - [P2] 1077 lines; split Chips/Pickers/MediaField into separate files. `classifyMedia`/`VIDEO_MIME` (:56-75) belongs in `lib/photo.ts`.
- exercise-editor.tsx:40 - [P3] `resizePhoto` imported from `@/lib/photo` here but machines.tsx has its own duplicate `resizePhoto` (see machines.tsx:344).
- exercise-editor.tsx:448 - [P2] copy: `Matches an existing exercise, "…"` straight double quotes -> curly `“…”`.

## components/machines.tsx

- machines.tsx:344-357 - [P1] **duplicate** `resizePhoto` (identical body to `lib/photo.ts`, whose header comment even says "Mirrors the pattern in components/machines") -> delete local copy, `import { resizePhoto } from "@/lib/photo"`.
- machines.tsx:145 - [P3] `export function MachineEditor` exported but only used in this file -> un-export.
- machines.tsx:18-45 `MachinesSection` - [P1] no loading/error state (prop `machines` defaults `[]` in parent) -> empty list indistinguishable from failed fetch; pass `isLoading/isError` or read `useMachines()` here.
- machines.tsx:23 - [P3] heading "My gym — machines" -> "My Gym: Machines"? (Title Case rule) ; copy line "Photos: shoot your own machine." fragmentary.
- machines.tsx:44 - [P3] `setExpandedId(expandedId === m.id ? null : m.id)` fine.
- machines.tsx:78-95 - [P2] custom machine name/brand `Input`s have no `aria-label`/`name`; placeholder "…or custom machine name" leads with ellipsis, lacks example; "Brand" placeholder is not an example. `className="w-28 shrink-0"` brand field + Add button in one row at 390px: name input squeezed ~100px -> stack on `max-sm`.
- machines.tsx:121-141 - [P1] MachineRow toggle: `px-2` (row template uses `px-4`) -> misaligned vs rest of Library rows; hand-built instead of `rowClass()`; no `aria-expanded`; machine settings summary `truncate ml-auto` fine.
- machines.tsx:184-193 - [P0] "+ setting" `Input className="h-6 w-48 text-2xs"` = 24px tall text input on a touch screen, below the 40px floor; placeholder `+ setting (e.g. Seat height)` no `aria-label`; only adds on Enter — **no add button**, and on mobile keyboards "Enter" may be "return" w/out discoverability -> add visible `Add` Button, `enterKeyHint="done"`.
- machines.tsx:195-207 - [P1] raw textarea + `defaultValue` + `onBlur` save (silent save w/o feedback), `placeholder="Setup notes (grip, position…)"` ok; no `aria-label`; uncontrolled so a refetch won't update. See Textarea cross-cutting.
- machines.tsx:210-221 - [P2] `<img className="h-16 w-16 object-cover">` no `width/height` attrs; alt = machine.name ok.
- machines.tsx:217 - [P1] `<label className="rounded-sm flex h-8 ...">` file picker: 32px, hidden input not keyboard-focusable (see exercise-editor), `capture="environment"` forces camera on mobile and blocks gallery choice on some browsers -> drop `capture` or offer both.
- machines.tsx:231-240 - [P0] "Delete" machine: destructive, one tap, **no confirmation or undo**, `variant="danger" size="sm"`. -> confirm dialog (reuse the Archive confirm pattern).
- machines.tsx:292-299 SettingRow - [P0] value `Input h-6 w-20` (24px) numeric field; no `aria-label` (label span is a `<span className="w-32 truncate">`, unassociated); `Number(raw)` blocks "1." intermediate decimals (typing "1." -> Number("1.")=1 stored → caret/display jumps, input shows `1` removing the dot) and "-" prefix -> keep string draft state, parse on blur.
- machines.tsx:305-329 - [P1] per-setting photo label `h-6` (24px), `px-1.5`, hidden input not focusable; `title` only for a11y name; the `<img>` inside label `h-5 w-5` thumbnail tiny; nested label+img alt `${s.label} setting` fine.
- machines.tsx:330-336 - [P0] remove-setting `×` glyph button: bare, no bg, `p-1` (~22px), `title` only, **no confirm**, deletes a setting + its photo ref permanently -> `IconButton danger aria-label`, X icon.
- machines.tsx:262-290 - [P3] `catch {}` swallows upload failure silently with comment "leaves the setting untouched" - user gets no error -> surface via the repo-error notice (AGENTS.md: errors must not be swallowed).
- machines.tsx:305-308 - [P3] key by `s.label` (user-editable?) labels are unique by construction (checked on add); ok.
- machines.tsx:160 - [P3] unhandled rejection if `createImageBitmap`/`resizePhoto` throws in `onPhotoPicked` (machine-level, line 156-163): no try/catch (unlike SettingRow) -> wrap.
- machines.tsx:101-103 - [P3] `settingsSummary` computed identically in attach-machine.tsx:88-91 -> shared `machineSettingsSummary(machine)` helper; and both define a local `MachineRow` component (different shape) with same name as each other -> rename.

## components/attach-machine.tsx

- attach-machine.tsx:54 - [P3] dialog title `Attach a machine — ${blockName}` ok (em dash in title string; brand copy avoids em dashes in chat only).
- attach-machine.tsx:56-72 - [P2] when `machines.length===0` no explanatory text, only catalog picker -> add "No machines in your gym yet. Search the catalog below." Query loading/error not handled (`useMachines` default `[]`).
- attach-machine.tsx:35-48 - [P0] `pickFromCatalog` awaits `createMachine.mutateAsync` with **no try/catch**: rejection = unhandled promise, dialog stays open with no feedback -> catch, show inline error, keep dialog open; also disable picker rows while creating (double tap creates two machines).
- attach-machine.tsx:57,69 - [P3] eyebrow labels as `<p>` not headings; `…or search the catalog` leading ellipsis -> "Or search the catalog".
- attach-machine.tsx:96 - [P1] row `h-10 ... md:h-8` ok 40px touch; hand-built row not `rowClass` (44px) -> `rowClass()`; `px-2` vs `px-4` mismatch.
- attach-machine.tsx:85-113 - [P3] duplicated `MachineRow` / summary (see machines.tsx).

## components/machine-catalog-picker.tsx

- machine-catalog-picker.tsx:24-26,134 - [P3] `slug`/`resultTestId` only for test ids; fine but `slug` also duplicates other slug code (exercise-detail.tsx:461) -> lib/utils `slugify`.
- machine-catalog-picker.tsx:42-52 - [P1] `isPending` on a disabled/idle query: when `searching` is false and query is disabled `isPending` is true forever (TanStack v5 pending for disabled). Condition `searching && isPending` guards it, OK; but `isError && ...` banner shows even when not searching (category list error) fine.
- machine-catalog-picker.tsx:56-60 - [P3] debounce via useEffect+setTimeout; fine (no new dep). `setQuery("")`/`setDebounced("")` double state.
- machine-catalog-picker.tsx:73-85 - [P1] search `Input` lacks `aria-label` (placeholder only), no `type="search"`, `autoComplete="off"`, `spellCheck={false}`; icon `top-2` hard-coded vs exercise-filter uses `top-1/2 -translate-y-1/2` -> unify; `MagnifyingGlass` not `aria-hidden`. Placeholder lacks `…`.
- machine-catalog-picker.tsx:88-105 - [P2] category chips `h-8` (32px) on touch, `overflow-x-auto` row with no scroll affordance/fade; `aria-pressed` n/a (they navigate). `cat.replace(/-/g, " ")` repeated (:101, :146) and lowercase labels -> `categoryLabel()` helper + Title Case.
- machine-catalog-picker.tsx:106-117 - [P1] error banner: `Retry` `variant="ghost" size="sm"` 32px; no `role="alert"`; message "Check your connection." ok.
- machine-catalog-picker.tsx:119-127 - [P2] "Searching…" no `role="status"`. Loading state when `categories` loading: nothing shown (empty browse list) and category query error silently empty -> add isError handling for `useMachineCategories`.
- machine-catalog-picker.tsx:127 - [P3] result list unvirtualized; server-limited? confirm cap on `useMachineCatalogSearch` (867 rows possible with empty-ish query; category browse may return 100+ rows).
- machine-catalog-picker.tsx:141-152 - [P1] result row `h-10 md:h-8` with `truncate` inner span but `flex` children without `min-w-0` on button content: category chip `shrink` not prevented (long category squeezes) -> `shrink-0` on chip; `pickLabel` text (`add to my gym`, lowercase, 12px) as the trailing affordance is bare text -> use `Plus` icon + aria-label; `text-2xs` OK.

## components/exercise-filter.tsx

- exercise-filter.tsx:107,132-137 - [P2] `autoFocus` prop forwarded (used by the session picker); guideline: avoid on mobile -> gate with `(pointer: fine)`.
- exercise-filter.tsx:131-138 - [P1] search Input: no `aria-label`, `type="text"` (use `type="search"`, `inputMode="search"`, `enterKeyHint="search"`, `autoComplete="off"`, `spellCheck={false}`), no clear (×) affordance; icon `MagnifyingGlass` lacks `aria-hidden`. Placeholder has `…` good.
- exercise-filter.tsx:142-164 - [P1] three `Select.Trigger`s (`w-28`, `w-32`, `w-28`, fixed widths) have no `aria-label` and rely on placeholder/value text: "All regions"/"All muscles" give implicit names but not for AT -> `aria-label="Region"` etc. Fixed widths + `flex-wrap` fine at 390 but selects height? `Select.Trigger` height from ui/select (check ≥40px on touch).
- exercise-filter.tsx:27-37,60-65 - [P3] `primaryMuscleKey`/`primaryTier` is domain logic (grouping rule) living in a component file and imported by library.tsx; `groupByPrimaryMuscle` already in core -> move to `packages/core/src/domain/` beside it (AGENTS.md "framework-free domain logic", "one rule"). `primaryTier` only used by its own test + filter.
- exercise-filter.tsx:99-215 - [P3] `ALL` sentinel `"all"` collides with a possible key named "all"; use `"__all__"`.
- exercise-filter.tsx:147-163 - [P3] `region as (typeof MUSCLE_REGIONS)[number]` cast twice -> type-guard `isRegion`.
- exercise-filter.tsx:171 - [P3] "Other" muscle option only when `!region`; fine.
- States: filter state (query/region/muscle/equipment/tier/yours) is `useState` in library.tsx, not in URL; back-navigation from detail loses the filters -> persist in `searchParams` (guideline: URL reflects state). 

## components/anatomy-ui.tsx

- anatomy-ui.tsx:68-83 - [P1] tier-filter chips `h-10` but `px-2` and no radius class (global button radius) fine; `aria-pressed` present; label text `text-2xs` 12px; the "Exercise quality:" prefix is a plain span, not a group label -> wrap in `role="group" aria-label="Exercise quality filter"`. Active state conveyed by bg only (+ aria-pressed) ok. Hover state missing on these chips (guideline: buttons need `hover:`) -> add `hover:bg-surface-hover`.
- anatomy-ui.tsx:33-39 - [P3] doc comment says "the active chip is outlined" but active is `bg-accent-soft` (old identity/line leftover; brand has no outlines) -> fix comment.
- anatomy-ui.tsx:17-26,29,41-47 - [P3] tier class tables duplicated: `TIER_NAME_CLASS` and `TIER_LEGEND_ITEMS[].className` encode the same S/A/B/C->text class mapping twice (and "unrated" = `UNTIERED_NAME_CLASS` literal repeated as `"text-faint italic"`) -> derive legend classes from `tierNameClass`.
- anatomy-ui.tsx:110-126 - [P1] `TierBadge`: `text-[10px]` off the type scale (min is `text-2xs` 12px) and `size-4` (16px) badge; `rounded-xs` ok; tier C has no bg (invisible badge: letter only) -> use `text-2xs`, `size-5`; `title={`${tier} tier`}` only (no aria-label; `title` on span not exposed on touch) -> `aria-label`/visually-hidden "Tier S". `bg-accent text-accent-fg` token `accent-fg` verify exists in theme.css (other places use `text-on-accent`); `text-ink` on `bg-accent-soft` vs `text-accent-ink` used elsewhere -> check tokens.
- anatomy-ui.tsx:146-182 - [P2] `ExerciseThumb` `bg-white` hardcoded + no `rounded`: thumbs are square while rest of app uses rounded-sm/md -> add `rounded-sm overflow-hidden`; `<img>` has `alt={name}` (decorative next to the name text → redundant; use `alt=""` when name is rendered adjacent) and no `width/height`; sm size `size-6` (24px) thumbnail unreadable. `decoding="async"` missing.
- anatomy-ui.tsx:169-178 - [P3] `Barbell` `aria-hidden` used here (good), but not elsewhere in group -> consistency (see cross-cutting).
- anatomy-ui.tsx:197-217 - [P3] `JointActionRatings` is a `<span>` with block-ish flex; contains no tier any more (comment claims "S Knee extension" tiers) -> stale comment (:185-187). Takes structural `exercise` type duplicating `ratingsForExercise` param -> import type.
- anatomy-ui.tsx:221-253 - [P0] `FavoriteButton`: bare icon button `p-1` (~24px target), **no resting background** (violates no-bare-buttons + 40px logging-adjacent), only `title` (no `aria-label`), no `focus-visible` style, disabled = `opacity-50` -> rebuild on `IconButton` with `active={favorite}` + `aria-label` + `aria-pressed`. Comment ("plain icon button rather than a menu ... bundle budget") is the excuse; IconButton is already in the eager bundle.
- anatomy-ui.tsx:236 - [P3] `title` swaps text based on state while `aria-pressed` also toggles -> double-announce "Unfavorite X, pressed"; use constant `aria-label={`Favorite ${name}`}` + `aria-pressed`.
- anatomy-ui.tsx:263-299 - [P2] `ExerciseRibbon` (used only in session.tsx:2087) duplicates the library ExerciseRow header (thumb + name + JointActionRatings + machine line, library.tsx:861-960) -> compose `ExerciseRow` from `ExerciseRibbon` or delete duplication; machine line duplicated 3x (anatomy-ui:285, library:942, machines/attach `brand · name` format) -> `machineLabel(machine)` helper in core.
- anatomy-ui.tsx:301-319 - [P3] `JointActionChips` `px-1` chips `rounded-xs truncate` w/o `shrink-0`; used only by library.tsx `BestForMuscle`.
- anatomy-ui.tsx:101-108 - [P3] `TierBadge` returns null when `tier` null; fine.
- anatomy-ui.tsx:1 - [P3] mixed concerns file (tier encoding, thumbs, favorites, ribbon); acceptable.

## States inventory

| Screen / surface | Loading | Empty | Error | Modal / sheet | Notes |
|---|---|---|---|---|---|
| Library list (library.tsx) | yes text "Loading…" | yes (none / no match) | yes (retry) | editor sheet, bulk add, best-for, archive confirm | recent/favorites bands omit when empty (ok) |
| Library: Custom metrics | NO | yes (hidden when 0) | NO (failure = empty) | none | P1 |
| Library: My gym machines | NO | yes (hidden when 0) | NO (failure = empty) | none | P1 |
| Catalog picker | yes "Searching…" | yes "No matches" | yes (retry) | n/a | category list error unhandled |
| Attach machine dialog | NO | NO (no copy for 0 machines) | NO (create throws unhandled) | dialog | P0 |
| Exercise detail | text only, blocks on records | yes (not found, records, history, howto) | NO (error = "not found"/empty) | ⋯ menu, editor sheet | P1 |
| Exercise detail tabs: summary/history/howto | partial (howto only) | yes | NO | n/a | |
| Exercise editor sheet | partial (placeholder from list row, no spinner for media) | n/a | media errors + dup warning only; save errors swallowed | itself | create/edit modes both handled |
| Bulk add | yes (disabled while library loading) | yes (button disabled) | yes (failure notice, retry library) | itself | |
| Onboarding | n/a in this group | | | | |

## Cross-cutting (fix once in shared code)

1. **Bare/tiny icon & text-glyph buttons** (`×`, Info, Favorite, tag/setting/chip remove, bulk-failure dismiss): library.tsx:707,:740,:1150; anatomy-ui.tsx:221; machines.tsx:330; exercise-editor.tsx:996 -> all must be `IconButton` (+`aria-label`); extend `IconButton`/`iconButtonClass` with a `size="sm"` (tone fill, still ≥32px, ≥40px touch) and make `aria-label` required via TS (`title` is not a label).
2. **Toggle-chip / segmented control** hand-built 6x (library.tsx:316 "Yours", exercise-detail.tsx:164/282/384, exercise-editor.tsx:SegmentedButton, anatomy-ui.tsx tier chips, machine-catalog-picker category chips): one `ToggleChip`/`ToggleGroup` (Radix ToggleGroup) in components/ui with `aria-pressed`, `h-10 md:h-8`, hover state; Tabs -> Radix Tabs.
3. **`Textarea`** missing from ui/ (3 raw copies with `border border-field`): add alongside Input.
4. **`Checkbox`** missing (raw `<input type="checkbox" accent-...>` 3x): add shadcn/Radix Checkbox with 40px label row.
5. **Hidden file inputs** (`className="hidden"` inside `<label>`) are keyboard-inaccessible (machines.tsx x2, exercise-editor.tsx:1058): add a `FilePickerButton` ui component using `sr-only` input + `focus-within` ring; drop forced `capture`.
6. **Icon a11y**: Phosphor icons used decoratively without `aria-hidden` across the group; set once via `IconContext.Provider value={{ aria-hidden: true }}` at app root (and require `aria-label` on the button, not `title`).
7. **Dropdown menus**: exercise-detail ⋯ menu is hand-rolled (backdrop button + absolute panel); use Radix DropdownMenu shared with session BlockMenu/routines menus (library-first rule), 40px items on touch, Escape/arrow keys/focus return.
8. **Failed-query-as-empty**: MetricsSection, MachinesSection, attach dialog, exercise-detail (exercise + records), catalog categories, history tab. Shared `<QueryState isLoading isError onRetry>` wrapper (loading `role="status"`, error `role="alert"` + retry, `userFacingRepoError` text) instead of per-screen copies.
9. **Unhandled promise rejections / swallowed errors** at mutateAsync boundaries: attach-machine.tsx pickFromCatalog, exercise-detail.tsx duplicate(), machines.tsx photo pick (:160), swallowed upload catch (:287); route through `userFacingRepoError` (lib/repo-error.ts) as AGENTS.md prescribes (settings/import-card still raw per that note).
10. **Destructive actions with no confirm/undo**: delete machine, remove setting, delete metric, remove exercise media; use the library's archive-confirm Dialog pattern as a shared `ConfirmDialog`.
11. **Duplicate code**: `resizePhoto` (machines.tsx vs lib/photo.ts), `settingsSummary`/`MachineRow` (machines vs attach-machine), machine "brand · name" label x3, tier class tables x2, `EQUIPMENT_LABELS[... as keyof ...]` cast x2, `slug` x2, 5x ExerciseRow list blocks, 3x band headers, 14x eyebrow label (`SectionLabel`), 6x `rounded-md overflow-hidden [&>*+*]:mt-0.5 bg-surface` list card (`ListCard`).
12. **Domain logic in UI files**: `primaryMuscleKey`/`primaryTier` (exercise-filter.tsx) beside `groupByPrimaryMuscle` in core; metric tables/format helpers in exercise-detail.tsx (`maxVal`, `METRICS_BY_TYPE`, `formatSet`...) to core/lib; `classifyMedia` to lib/photo.
13. **Typography**: straight `'`/`"` in UI copy throughout group (use `’`/`“”`); `text-[10px]` in TierBadge off scale; placeholders without `…`; Title Case labels (lowercase `yours`/`shared`/`add to my gym`); no `aria-label`/`name`/`autoComplete`/`spellCheck` on any text input in the group.
14. **Tap targets < 40px on touch**: `h-6` inputs (machines.tsx:190,:303,:307; library.tsx:1182), `h-8`/`h-9` chips (exercise-detail, machine-catalog-picker, library "Yours"), 32px `size="sm"` buttons used for Retry/Archive/Bulk add -> add `max-md` touch sizes to `Button` (`sm`: `h-10 md:h-8`) as IconButton already does.
15. **Stale comments / old identity**: "RLS-immutable" (library.tsx:1000, exercise-detail.tsx:809), "active chip is outlined" (anatomy-ui.tsx:33), `JointActionRatings` comment about tiers (anatomy-ui.tsx:185), "(Option B)", "Note 15/16", "D2" release-note refs in comments; no grass/sage/0px identity leftovers found.
16. **URL state**: library filters and exercise-detail tab/range/metric live in `useState`; persist in search params.
17. **Reduced motion**: recharts line animation in exercise-detail not disabled; all `transition-colors` are fine; `float-in` handled in theme (verify the `reduce` block covers `float-in`).
18. **ExerciseEditor mounted unconditionally** in exercise-detail MoreMenu (runs 6 queries while closed): make editor content a child rendered only when `open`.
