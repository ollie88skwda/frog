# Audit: session group

Scope: `apps/web/src/screens/session.tsx` (4689 lines, read fully), `components/session/*`, `post-save-summary.tsx`, `session-photos.tsx`, `share-sheet.tsx`, `conditions.tsx`, `lesson.tsx`. Format: `path:line - [SEV] issue -> fix`. Paths relative to `apps/web/src/`. Line numbers from the tree at audit time.

Legend: P0 broken/inaccessible, P1 clear violation, P2 polish, P3 nit.

---

## screens/session.tsx

### Bugs / state correctness
- session.tsx:1673 - [P1] `FinishOverlay` is always mounted (rendered whenever `session` exists), so `const [endAt] = useState(() => Date.now())` freezes at screen-mount time, not at finish. `finish-duration` shows `mount - startedAt - pausedMs` and never ticks. -> compute `endAt` when the dialog opens (`useEffect` on `open` -> `setEndAt(Date.now())`) or just use `Date.now()` inside render guarded by `open`. Same staleness for `titleDraft/notesDraft/startedDraft` seeded once from props: reset them on open.
- session.tsx:2866 + 3278 - [P1] failed query rendered as empty. `useGhost` error: `ghostLoading` is false on error, Spotlight mounts with `ghost=[]`, `hasGhost=false`, so "Last time" row silently vanishes and fields stay blank. -> destructure `isError`, show a one-line `text-neg` "Couldn't load last time" + retry above the Spotlight (or in the last-time slot), still let the user log.
- session.tsx:2843 - [P1] `useExercises()` in `ExerciseSpotlight` / `SessionScreen` ignores error/loading: `exercise` undefined -> `type` silently falls to `"weight_reps"` (line ~2991), so a cardio/timed exercise renders weight+reps fields while the query is loading or failed. -> gate Spotlight on `exercisesLoaded` and show the same error/retry pattern as `ExercisePicker`.
- session.tsx:446-456 - [P1] `repo.recordsData()` has no `.catch`; a failure is an unhandled rejection and `history`/`prSnapshot` stay null forever (PR detection and Growth silently disabled, "Best —" shown as if no data). -> catch, set an `historyError` flag, surface in Growth ("Couldn't load history") and keep PR checks off explicitly.
- session.tsx:1025-1039, 1065-1070, 1119-1125 - [P1] `void repo.updateSet(...)`, `repo.deleteSet(...).then(ok, () => {})`, `deleteSessionExercise(...).then(ok, () => {})` swallow every failure; edits/deletes to a committed set can fail with no feedback and local state diverges. -> route through the existing `set-sync-error` banner (a `failedOps` list) or at least reconcile local state on rejection; never `() => {}`.
- session.tsx:1213-1219 - [P2] `onEditStart` fire-and-forget `void repo.updateSessionStartedAt` with optimistic cache write, no rollback on failure. -> `.catch` -> invalidate `["session", id]`.
- session.tsx:960-967 - [P2] dead code: `nextGroupId` is defined then `void nextGroupId` to dodge lint, comment claims it feeds `structureInput` (it does not). -> delete both lines.
- session.tsx:230-235 - [P2] `formatRest` duplicates `formatMMSS` (`lib/format.ts:58`), and `mmss` in `rest-stopwatch.tsx:7` duplicates it again. -> use `formatMMSS` everywhere; delete `formatRest`, `mmss`.
- session.tsx:256-261 - [P3] `fieldLabel` ternary `TYPE_FIELDS[type].weight ? "Reps" : "Reps"` identical branches; `type` param unused. -> return `"Reps"`, drop param.
- session.tsx:1991 - [P3] `ordinal()` local helper while `lib/share/ordinal.ts` exists. -> reuse/export a single formatter.
- session.tsx:2866 - [P3] `useLastNote(...)` called, result discarded (comment says notes moved out). -> remove call (wasted request per exercise).
- session.tsx:4046-4066 + 4261-4290 + 4326-4360 - [P2] four near-identical "stepper + big input" blocks (main field, weight-right, reps-left/right) and three copies of jump rows; testids differ. -> extract `<StepperField>` / `<JumpRow>` (keep testids via props).
- session.tsx:2200-2208 - [P3] `tabular-nums` redundant with `num`. Same at rest-stopwatch.tsx:57.
- session.tsx:3600-3606 / 4388-4392 - [P2] `sessionStorage` read/write without try/catch (throws in Safari private/storage-denied) and inside a `setState` updater (side effect in updater, double-invoked in StrictMode). -> `lib/` helper with try/catch; write in an effect.
- session.tsx:4464 - [P2] `h-13` is not a defined spacing token in theme.css (Tailwind v4 derives `--spacing` multiples, works, but 52px is off the 8/40/48 control scale). -> `h-12` (48) or `size="lg"` + `h-12`.

### Frog rules
- session.tsx:1442-1470, 1480-1490 - [P1] header `Button size="lg"` (40px) ok, but `Routines` ghost `size="sm"` is 32px (not on logging path; fine) and `SessionDurationControl` button is `h-8` (32px) on the logging header (4625). -> `h-10` for `session-clock`; give it a resting fill in unpaused state (currently `text-soft` bare text, `hover:` only) -> add `bg-secondary/60`.
- session.tsx:4625-4632 - [P1] bare-text button at rest (clock, unpaused). -> `bg-surface-2` resting fill.
- session.tsx:2478-2498 - [P1] `MarksBand` buttons: `done`/`warmup`/`todo` have no resting background (text glyph only) and are `py-2.5` ~ 36px tall, tap targets <40px on the logging path. Disabled `todo` buttons look identical to enabled. -> `min-h-10 bg-surface-2` for tappable, `bg-surface-2/50` for todo; `rounded-sm` gaps via `gap-1`.
- session.tsx:2480,2505 - [P2] text glyphs `●○✓ᴸᴿ⌨↺🔗▲▴▾⋯` used as icons (lines 2484, 2491, 2713, 4095, 4230, 4259, 4312, 4315, 4369, 4397, 4473, 2206). Rule: Phosphor icons only; emoji `🔗` is a P1 (renders per-OS emoji font, not Geologica). -> Phosphor `Link`/`LinkBreak`, `ArrowCounterClockwise`, `DotsThree`, `CaretUp/Down`, `Check`, `Circle`/`Dot`; for L/R use plain "L"/"R" text. Drop decorative `⌨` (4090-4097) entirely; it is misleading (suggests a button) and has `aria-hidden`.
- session.tsx:4093-4097 - [P2] decorative ⌨ glyph occupies a flex slot on every field; remove.
- session.tsx:2489-2496,4240 - [P1] type sizes `text-[7px]`, `text-[9px]`, `text-[44px]`, `text-[52px]`, `text-[28px]` (2489, 2495, 4240, 4065, 4270, 4334): illegible sub-10px sizes and arbitrary values off the theme scale (scale is 12/13/15/17/20/22/28). -> 7px/9px: use `text-2xs` (12px) or drop the tag; big inputs: add `--text-display`(44) to theme or use `text-2xl` (28) + a single `@theme` token; never <12px.
- session.tsx:4240-4244 - [P2] "ALREADY LOADED" hard-wrapped with `<br/>`, ALL CAPS literal; the pill is non-interactive filler. -> remove or sentence-case "Pre-filled".
- session.tsx:2710, 4190 - [P1] `size-9` (36px) buttons on the logging path (set options `⋯` and set details). Tap target <40px. Bare bespoke buttons duplicate `IconButton`. -> `<IconButton>` (40px touch).
- session.tsx:4227 - [P1] `last-time-reset` `size-7` (28px) button; glyph `↺`. -> `IconButton` with Phosphor `ArrowCounterClockwise`, aria-label.
- session.tsx:372-380 - [P1] RIR segments `h-10` ok; RPE `<select>` (404-420) is a native bordered select with `focus:outline-none` + `border border-field`: not the shared `ui/select.tsx`. -> use `Select` from `ui/select` (radix) or at least `Input`-style classes with `focus-visible:border-focus`; native select needs explicit bg/color (it has bg).
- session.tsx:4281,4293,4343,4352 - [P1] jump buttons `h-8` (32px) on logging path in per-side rows. -> `h-10`.
- session.tsx:2520-2536 - [P2] `EdgeDots`: fixed rail at `right-1`, `pointer-events-none`, tiny `size-1` (4px) dots, under the mobile tab bar z-index risk; non-interactive position indicator duplicating the "N of M" label at 3199. -> remove or make it `aria-hidden`; `size-1`→`size-1.5` at min.
- session.tsx:4396-4398 - [P1] `Growth ▴/▾` bare tinted `text-2xs` pill, 24px tall tap target, uses glyph caret. -> `Button size="sm"` with Phosphor `CaretUp/CaretDown`, `aria-expanded`.
- session.tsx:4251-4262 - [P1] `weight-link-toggle` ~20px tall tap target, emoji. -> `Button size="sm"` (32) minimum, ideally `h-10` on logging path; Phosphor link icon.
- session.tsx:3230-3241 - [P1] `{override} only` chip `py-0.5` ~20px tall, jargon "only". -> `h-8` Button sm, label "kg override".
- session.tsx:1892-1905 - [P1] picker "Yours" filter: `h-8` (32px) touch, no `rounded-sm` (renders square: unspecified radius), `bg-translucent` fill ok. -> `rounded-sm h-10 md:h-8` or `Button`.
- session.tsx:2181-2210 - [P2] switcher list rows `bg-surface`/`bg-accent-soft` rows butted with no radius, `min-h-12` ok. Wrap in `rounded-md overflow-hidden` or use `Row`/`rowClass` (ui/row.tsx) per shared-chrome rule.
- session.tsx:2060-2117 - [P2] `PickerRow` bespoke row + history toggle (36px wide hit area, `px-3`, no resting fill, `hover:` only). -> `rowClass` / `IconButton`; toggle needs `aria-label="Show last session"`, currently `title` only.
- session.tsx:2570-2580 - [P1] `ExerciseSettingsMenu` hand-rolled popover menu (fixed full-screen backdrop button + absolutely positioned div) instead of a library menu (no Radix dropdown vendored; repo has `@radix-ui/react-select` only). Same pattern: `SetActionsMenu` (2687), `SessionDurationControl` (4640), `conditions.tsx RowMenu`. No focus trap, no Esc to close, no arrow-key nav, no `role="menu"`, first-item focus lost, backdrop is a `tabIndex=-1` button. Cross-cutting: see below. -> add vendored shadcn `dropdown-menu` (Radix) and replace all four.
- session.tsx:2591 - [P2] menu `max-h-80 min-w-56` ok; may clip below viewport on small phones when opened from top-right near bottom: acceptable, but no collision handling. (Solved by Radix.)
- session.tsx:2598,2619,2644,2690 - [P2] menu items `py-1.5 text-xs` ~ 30px rows: tap target <40px (set options is on logging path). -> `min-h-10 text-sm`.
- session.tsx:2383-2400 - [P1] `GrowthBars` is a hand-rolled recharts chart outside `ui/chart.tsx` (shadcn chart exists), `fontSize={9}` (<12), `radius={0}` (square bars off corner scale, use `[4,4,0,0]` radii), custom `shape` re-renders raw `<rect>` with `stroke`/`strokeDasharray` (a line; rule: no lines), `stroke="var(--color-text-secondary)"` on axis. -> use `ChartContainer`/`ChartConfig` from `components/ui/chart`, `Bar radius={4}`, today bar = lighter fill with no dashed stroke, tick `fontSize` 12, `aria-label`/`role="img"` + visually hidden text summary for a11y.
- session.tsx:2401-2415 - [P2] growth chart has no accessible text alternative. -> `role="img"` + `aria-label` summarizing "Top set per session, last 6".
- session.tsx:1437-1460 - [P1] icon-only mic `Button` has `title` but no `aria-label`; `Finish` ok (text). `title` is not reliably announced. -> add `aria-label`. Same: 2576 (Exercise options), 2709 (Set options), 4080/4106/4189/4226 (timer, plates, details, reset), 4625 clock (has text), 2099 history toggle.
- session.tsx:1437-1452 - [P1] mic status message `role="status"` span is always rendered (empty) with `absolute top-full right-0` and `floating` only when message; fine, but not `aria-live`-polite explicit and overlaps header; on a 390px phone the message extends past the right edge? (`right-0` anchored, `whitespace-nowrap` -> long message "Microphone blocked — allow mic access in your browser settings." overflows left off-screen). -> `max-w-[calc(100vw-2rem)] whitespace-normal`, or a toast.
- session.tsx:1370-1395 - [P2] `set-sync-error` banner and `PrBanner` both `fixed top-28`/`top-44` hardcoded offsets; stacking by magic numbers. -> single toast region.
- session.tsx:1388 - [P1] sync error banner `role="status"` for an error; use `role="alert"`. Same 3241 copy-error (`role="status"` for error), 1384.
- session.tsx:1361-1415 - [P2] `rounded-md pointer-events-auto ... shadow-lg` hand-rolled panel; use `floating` utility (theme.css) not `shadow-lg`. Same pr-banner.tsx:503 (`rounded-sm bg-raised shadow-lg`).
- session.tsx:1470-1490 - [P2] stats line text `text-xs text-faint`; `--color-faint` aliases `text-secondary`, ok contrast. `volume.toLocaleString()` hardcoded locale usage OK-ish; use `Intl.NumberFormat` helper shared (`formatNumber`) for consistency (1479, 1702).
- session.tsx:1748-1768 - [P1] native `<input type="checkbox">` styled with accent only, inside `label`; the app has `ui/switch.tsx` (Radix). 4528 likewise. -> `Switch` (or a vendored shadcn `checkbox`), tap target 16px currently (`size-4`) inside a padded label (label is the hit target; OK but the checkbox itself is 16px).
- session.tsx:1731-1745, 4500-4510 - [P1] textarea `border border-field ... focus:outline-none focus:border-focus`: border is allowed (text field), but `focus:` not `focus-visible:`; `outline-none` replaced by border colour change only (contrast of `--color-border-field` vs `focus` ok). Acceptable per brand (field line), but the guideline wants a ring: the global `:focus-visible` outline rule (theme.css) is **overridden** by `outline-none`. -> drop `focus:outline-none`, use `focus-visible:border-focus` (matches `ui/input.tsx` which keeps `outline-none` too; see Cross-cutting).
- session.tsx:1738,4505 - [P3] placeholder `"// note"` is code-comment cruft; other placeholders lack `…` (`"Workout"`, `"0"`, `"reps"`). -> `"Add a note…"`, `"e.g. 100"`.
- session.tsx:1722-1731 - [P1] Finish dialog "Title"/"Start" labels are `<span>` not `<label>`; inputs unlabeled for AT (`Input` at 1717, 1722 inside `div`). -> wrap in `<label>` or `htmlFor`. Same: warmup weight (2294), voice-picker search (2025, no label/aria-label), picker search, RPE select (404, label is a `<span>`), `plate-sheet ManagePlates`.
- session.tsx:2025-2031 - [P2] `autoFocus` in dialogs on mobile (ExerciseFilterBar, voice search, warmup weight, metric input 4543): pops keyboard immediately on a phone. Guideline: avoid on mobile. -> drop on touch (`!matchMedia("(pointer:coarse)")`).
- session.tsx:2010-2040 - [P2] `VoiceMatchPicker` no loading/empty issue; list `rounded-md overflow-hidden bg-surface` with `[&>*+*]:mt-0.5` spacing hack (also 1964, 1951). -> `gap-0.5 flex-col`.
- session.tsx:1951 - [P2] `rounded-md overflow-hidden` — order of classes fine; `[&>*+*]:mt-0.5` repeated 3x; extract list wrapper.
- session.tsx:1970 `Create "{query}"` - [P2] straight quotes in copy -> curly quotes `“…”`.
- session.tsx:1912 - [P3] "No exercises yet — add one in Library." plain text; link to `/library` (`<Link>`), currently dead text.
- session.tsx:2236 - [P3] `Square` icon used as "Finish" glyph; Phosphor `Stop`/`FlagCheckered` conveys intent better; fine.
- session.tsx:4065 - [P1] number inputs use `inputMode` but no `name`, no `autoComplete="off"`, no `aria-label` (visible label is a sibling `span`, not associated). -> `aria-label={label}` + `autoComplete="off"` + `enterKeyHint="done"`.
- session.tsx:4062-4063 - [P2] `onKeyDown` Enter just `preventDefault()` — Enter does nothing; should blur the field (`e.currentTarget.blur()`) so the keyboard closes.
- session.tsx:4050 `readOnly` on duration while timer runs but no `aria-readonly`/visual cue. P3.
- session.tsx:3246-3252, 4225 - [P2] `title` tooltips carry the only description of behaviour (`Using a per-exercise weight unit override — tap to clear`); touch users never see titles. -> visible label or aria-label.
- session.tsx:3175-3182 - [P2] `exercise-header` button is the exercise-switch trigger but has no `aria-haspopup="dialog"`; caret `CaretDown` w/o aria-hidden. Phosphor icons need `aria-hidden` throughout (none set except 4093). -> pass `aria-hidden` (global fix: wrapper or lint).
- session.tsx:3200-3230 - [P2] subheader row with 4 chips (position, rest avg, machine, unit override) `flex min-w-0` but no wrap: overflow on 360px. -> `flex-wrap`.
- session.tsx:3274-3292 - [P2] `Loading…` spinner text for ghost is plain `<p>`; no `role="status"`. Same 1349, 1904, 2142.
- session.tsx:2478 + 2491 - [P2] MarksBand each mark exposes only a glyph; no accessible name (`aria-label="Set 3, done"`). Only `data-state` attr. -> `aria-label`, `aria-current="step"` on current.
- session.tsx:2500 - [P3] `Medal` icon on mark `size-2.5` (10px), unreadable; no aria.
- session.tsx:4140-4153 - [P2] touch swipe handlers on wrapper `div` (`onTouchStart/End`) for switching exercise: gesture-only (alternate exists via switcher, OK) but conflicts with horizontal scroll in the Growth chart and with iOS back-swipe; no `touch-action` guard. -> keep, but ignore swipes starting on inputs/chart; also no keyboard alternative on desktop (arrow keys). P3.
- session.tsx:3185-3193 - [P3] `text-xl font-extrabold` — `extrabold` (800) maps to nothing in `@theme` weights (normal 410/medium 600/semibold 600/bold 700). `font-extrabold` falls back to Tailwind default 800 which Geologica variable supports; inconsistent with the weight tokens. -> `font-bold`. Used at 3188, 4161, 4166, 4172, 4177, 4225, 4234, 4237, 4313-4316, 4397, 4503 etc.
- session.tsx:408 - [P2] `text-faint`/`tracking-widest uppercase` eyebrow classes repeated >15x as raw strings (`text-2xs font-medium tracking-widest text-faint uppercase`, some `font-bold`/`font-extrabold`/`tracking-wide` variants = three inconsistent versions). -> single `Eyebrow` class/utility.
- session.tsx:4160-4180 - [P2] `rounded-xs` pills `bg-secondary text-warn`: `--color-warn` is `text-primary`, so "warn" is just ink; ok but misleading name.
- session.tsx:1355 - [P1] `Retry` button labels: bare "Retry" fine; error copy "Couldn't reach the server. This session may still be there." no next step beyond Retry (acceptable).
- session.tsx:1344-1355 - [P2] loading state is bare tiny `text-xs` text; no skeleton; full-screen-height jump. Acceptable but matches nothing elsewhere. -> shared `<LoadingState/>`.
- session.tsx:2150 - [P3] `ExerciseSwitcher` empty-state `li` unreachable-ish; fine.
- session.tsx:1566-1572 - [P2] `FinishOverlay` confirm-discard: first click arms, never auto-disarms (if user keeps dialog open and changes mind) and sits next to Save; no undo. Discard is destructive (deletes session): acceptable confirm, but destructive red button + Save primary adjacent at 32px (`size="sm"`) on a logging-adjacent flow -> `size="lg"` buttons, stack on mobile, auto-reset `confirmDiscard` after 4s / on blur.
- session.tsx:1825-1832 - [P2] Save/Discard `size="sm"` 32px primary action of the whole screen. -> `size="lg"`.
- session.tsx:1688 - [P3] `labelCls` const duplicates eyebrow.
- session.tsx:1692-1699 - [P2] FinishOverlay summary `pb-3` with no line; fine.
- session.tsx:1777-1800 - [P1] structural-change choice rendered as two `Button`s toggling `variant` primary/outline (a radio group semantically) with no `aria-pressed`/`role="radiogroup"`. -> `aria-pressed`.
- session.tsx:372-380 - [P2] RIR segment toggles: has `aria-pressed`, but label "RIR" is a plain `span`, group has no `role="group" aria-label`.
- session.tsx:372 - [P2] `onMouseDown={(e) => e.preventDefault()}` copy-pasted on 16 buttons to keep input focus: harmless but also kills focus on click and breaks keyboard-less accessibility expectations; extract into a `keepFocus` prop spread.
- session.tsx:4060-4066 - [P1] `focus:outline-none` on the hero inputs with no focus replacement (hero field sits in a `bg-surface` container with no visible focus state). Keyboard/AT users cannot see which field is active; only the caret. -> `focus-within:ring`-equivalent: add `focus-within:bg-sunken` on the wrapper + `outline-2` via `has-[:focus-visible]`. Same 4270, 4334 (`focus:outline-none`).
- session.tsx:2104-2109 - [P3] `transition-transform` on caret ok (explicit property).
- session.tsx:1463 - [P2] Routines nav is a `Button onClick={() => navigate("/routines")}` -> should be a `<Link>` (Cmd-click). Guideline: links for navigation. -> `Button asChild`-like or `Link` with button classes.
- session.tsx:1479 + 1702 - [P3] `volume.toLocaleString()` duplicated stat string; extract `formatSetsVolume`.
- session.tsx:3588 - [P3] `frog.growth-open.${sessionId}` storage key literal; document in storage-keys registry.
- session.tsx:2560-2680 (`ExerciseSettingsMenu`) - [P2] opens `WarmupDialog` nested inside the `span.relative` that wraps menu — a Dialog (portal) inside positioned wrapper OK; but menu `open` state remains after dialog; fine.
- session.tsx:3076-3098 - [P3] `MachineChip` is `max-w-full self-start` in a `flex` row without `min-w-0`; may push siblings.
- session.tsx:1000-1025 - [P3] `saveSet` calls `repo.updateSet` per field change from `submitEdit` (up to 2 calls per row, no batching) fine.

### Old-identity leftovers / stale comments
- session.tsx:1-26 - [P3] header comment is a feature changelog (scope notes) that belongs in DECISIONS.md; several claims stale (e.g. "custom per-exercise metrics moved to edit sheet" while live sheet also has them).
- session.tsx:4136-4158 - [P3] stale comment `// Contract: ... never from the routine target` fine; `RestDock`-era references in `rest-countdown.tsx`.
- session.tsx:4054 etc. - no hardcoded hex found (`rg '#[0-9a-f]{3,6}'` clean in this file).
- session.tsx:2391 - [P3] `stroke="var(--color-text-secondary)"` token via var (acceptable) but bypasses chart config.

### rg sweeps (session.tsx)
- `transition-all`: none. `outline-none`: lines 408, 1744, 4065, 4270, 4334, 4508 (6; all `focus:outline-none`, see above). Raw palette colours (`text-red-` etc.): none. `rounded-(lg|xl|2xl|full)`: none. `animate-`: none in this file (`animate-pulse` in rest-stopwatch). `<div onClick`: none. `text-white`: none here.
- `rounded-*` ordering: `rounded-sm flex ...` leading position everywhere (cosmetic).
- Decorative Phosphor icons lack `aria-hidden` (all ~45 usages).

---

## components/session/machine-chip.tsx
- machine-chip.tsx:54-67 - [P2] button label "+ add machine" uses literal `+` and lowercase; icon only when machine set. -> Phosphor `Plus` icon, "Add machine".
- machine-chip.tsx:59 - [P2] `title` only description; `aria-label` for chip when truncated.
- machine-chip.tsx:150-157 - [P1] `Command.Input` `border border-field ... focus:outline-none` -> same cross-cutting; `autoFocus` on mobile dialog. Missing `aria-label` (Command has `label` prop only for list). -> `aria-label="Search machines"`.
- machine-chip.tsx:144 - [P2] items `min-h-10 ... data-[selected=true]:bg-surface-hover` — fine tap target; no resting background (list item, exempt).
- machine-chip.tsx:179-195 - [OK] error state handled with retry (good). Loading: `isPending` guards the empty copy, but no explicit "Searching…" indicator -> add.
- machine-chip.tsx:128-139 - [P1] `pickFromCatalog` awaits `createMachine.mutateAsync` with no try/catch: failure = unhandled rejection, dialog stays open with no feedback (and `onSelect` is `void`). -> catch, show `text-neg` inline error + retry; disable item while pending.
- machine-chip.tsx:24 - [P3] `machineLabel` exported from a component file, imported elsewhere? (`rg machineLabel`: only used here) -> unexport.
- machine-chip.tsx:17 - [P3] `slug()` duplicates machine-catalog-picker's helper (comment admits); dedupe into lib.
- machine-chip.tsx:148 - [P2] title `Machine — {blockName}` em dash in UI copy. Fine per product, but guidelines prefer simple; P3.

## components/session/plate-sheet.tsx
- plate-sheet.tsx:309-390 - [P2] `DialogContent` reused as "sheet"; fine. `target` rendered raw (`{target} {unit}`) not tabular? has `num` ok.
- plate-sheet.tsx:338-346 - [P2] plate chips are `h-8 min-w-8` non-interactive spans; fine.
- plate-sheet.tsx:353-360 - [P2] "Not buildable..." uses `text-warn` (== ink) so not distinguished from normal text. -> `text-neg` or icon.
- plate-sheet.tsx:366-388 - [P2] "Manage plates & bar" ghost sm 32px; `&` literal in JSX text is fine (JSX allows `&`? `&` followed by space is OK). P3.
- plate-sheet.tsx:410-445 - [P1] inputs have `<span>` labels not `<label>`; plates text input free-text CSV with silent fallback to old plates on invalid input (`p.length ? p : plates`) and silent bar fallback — no validation feedback. -> inline error, `aria-describedby`.
- plate-sheet.tsx:424 - [P3] `cn("flex flex-col gap-3")` with single arg, pointless. -> plain string.
- plate-sheet.tsx:447-457 - [P2] Cancel/Save `size="sm"` 32px. -> `lg` on mobile.
- plate-sheet.tsx:239 - [P3] stale comment "(Hevy defaults)".
- Duplicate `unit` formatting: `{target} {unit}` vs `unitLabel(unit)` used elsewhere ("lb" vs "lbs"?). Inconsistent: session.tsx:2630 `label: "lbs"` vs `unitLabel`.

## components/session/pr-banner.tsx
- pr-banner.tsx:498 - [P1] `fixed top-28 z-30` magic offset overlapping header/sticky; collides with `set-sync-error` (handled via `top-44` in parent — coupling). -> shared toast host.
- pr-banner.tsx:503 - [P2] `shadow-lg` + `rounded-sm` hand-rolled; use `floating` (rounded-md). `float-in` animation is not gated by reduced-motion beyond the global duration override (OK, global rule covers).
- pr-banner.tsx:488-492 - [P2] 4s auto-dismiss on content with `role="status"`: a11y requires pause/hover or longer; guidelines: timed content needs control. `onDismiss` identity changes each render of parent (`() => setPrBanner(null)` inline in session.tsx:1361) so the effect re-subscribes and **resets the 4s timer on every parent re-render** — banner may never dismiss while the user types. -> `useCallback` the dismiss in parent or store in a ref.
- pr-banner.tsx:525-533 - [P1] dismiss button `size-6` (24px), bare icon with `title` only, no `aria-label`. -> `IconButton` + aria-label.
- pr-banner.tsx:518-523 - [P3] frog copy is long (two sentences) in a transient toast. Hmm: "It is, on this occasion, impressed." fine for edge voice; but toast is on the data path (logging a set). Split rule says data path serious; text under `text-2xs`. P3.
- pr-banner.tsx:509 - [P3] "New PR — {name}" unbreakable; `truncate` missing on the name span (long exercise names wrap) -> `line-clamp-1`.
- pr-banner.tsx:507 - [P3] `Medal` no `aria-hidden`.

## components/session/rest-countdown.tsx
- rest-countdown.tsx:1-77 - [P1] **dead file**: `RestDock` and duplicate `mmss` are imported nowhere (`rg RestDock|rest-countdown` finds only the file itself; session.tsx imports `rest-stopwatch`). It also contradicts the shipped model (comment says "countdown", DECISIONS 2026-07-31 deleted it) and carries `text-[26px]`, `md:left-56`, old floating-dock layout. -> delete the file.
- rest-countdown.tsx:51 (if kept) `text-[26px] ... tabular-nums` etc. N/A once deleted.

## components/session/rest-stopwatch.tsx
- rest-stopwatch.tsx:7 - [P3] duplicates `formatMMSS` (lib/format.ts). Comment claims "one formatter" shared with committed-set stamp, but session.tsx uses `formatDurationSeconds`. -> import `formatMMSS`; delete local.
- rest-stopwatch.tsx:45 - [P1] `h-13` + `rounded-md` fine; `role="status"` on an element that re-renders every second: screen readers may announce every tick (status is polite live region; contents change each second). -> `role="timer"` + `aria-live="off"`.
- rest-stopwatch.tsx:51-54 - [P2] `animate-pulse` is infinite motion; global reduced-motion rule shortens duration to 0.01ms but infinite loop remains at 0.01ms (flicker). -> `motion-safe:animate-pulse`.
- rest-stopwatch.tsx:57 - [P3] `tabular-nums` redundant with `num`; `text-2xl` ok.
- rest-stopwatch.tsx:68-74 - [P2] Stop `size="sm"` 32px on logging path. -> `size="lg"`.
- rest-stopwatch.tsx:62-64 - [P3] ticking via `Date.now()` in render; fine.
- rest-stopwatch.tsx:60 - [P3] "after set N · stops on your next set" sentence-case fine; `text-2xs` 12px.

## components/post-save-summary.tsx
- post-save-summary.tsx:353-368 - [P1] full-screen overlay `fixed inset-0 z-50` hand-rolled, not a `Dialog`: no focus trap, no `role="dialog"`/`aria-modal`, no Esc to dismiss, background still tabbable, no scroll lock. -> wrap in `Dialog`/`DialogContent` (full-screen variant) or add the attributes + Esc handler.
- post-save-summary.tsx:362-368 - [P1] dismiss `size-8` (32px) bare icon, no resting background (`hover:` only) and no `aria-label`. -> `IconButton` + `aria-label="Dismiss"`.
- post-save-summary.tsx:364 - [P2] header `px-4 py-3` ignores `env(safe-area-inset-top)`; full-bleed overlay needs safe-area padding (top and bottom). -> `pt-[max(0.75rem,env(safe-area-inset-top))]`.
- post-save-summary.tsx:374-400 (`SlideDeck`) - [P1] dot paginator: `size-2` (8px) buttons, `aria-label="Slide N"`, but tap target 8px (<40) and square dots; `snap-x` carousel has no `role="region" aria-roledescription="carousel"`, no keyboard (arrow keys) handling, no `aria-current` on active dot. `onScroll` runs `setActive` on every scroll event (fine) but reads `scrollLeft/clientWidth` (layout read in handler, OK). -> `size-10` hit area wrapper around 8px visual dot, `aria-current`, `aria-hidden` on off-screen slides (`inert`).
- post-save-summary.tsx:381 - [P3] `ref` for scrollTo; `behavior: "smooth"` ignores reduced-motion. -> check `prefers-reduced-motion` and use `"auto"`.
- post-save-summary.tsx:259,321 - [P2] `Trophy`, `Flame`, `Medal` w/o `aria-hidden`.
- post-save-summary.tsx:262 - [P3] `text-5xl` is not in the theme scale (theme defines up to `2xl`=28px; Tailwind default 3rem used) -> add `--text-display` token. Also `text-lg`/`text-sm` fine.
- post-save-summary.tsx:263,276 - [P3] `#{ordinal}` etc. numerals fine (`num`).
- post-save-summary.tsx:285,309 - [P2] frog-voice copy "Consistency, n=…", "The streak holds, n>0." — voice-only (edge) acceptable; ensure Human register is plain (it is).
- post-save-summary.tsx:130 - [P2] `Date.now()` as `startedAt` fallback when session pending: `ordinalFor` memo recomputes with changing identity? `useMemo` deps `startedAt` changes every render while session pending (Date.now() new each render) -> memo thrash and the `streak` memo too. -> use `session?.startedAt ?? null` and guard.
- post-save-summary.tsx:1-577 - [P1] **loading/error states missing**: `shareDataPending` only disables Share; content renders `#{ordinal}` computed from possibly empty `allSessions` (ordinal wrong/`#1`) and "Workout" title before data arrives; any query error is silently treated as empty (`data = []`) — a failed `useAllSessions` yields ordinal #1 and no streak/PR slides, rendered as fact. -> show a skeleton until core queries settle; on error show retry, and hide ordinal/streak/PR slides rather than fabricating.
- post-save-summary.tsx:226-244 - [P3] computing `last13Weeks` with `weekStart(cursor - WEEK_MS / 2)` hack; fragile near DST. Fine.
- post-save-summary.tsx:41-60 - [P3] `historyVolumeKg` local helper; duplicates volume math with core `volumeKg`? -> core.
- post-save-summary.tsx:386-392 - [P3] ShareButton in SlideShell uses `variant="outline"` `size="sm"` (32px) for the screen's main action. -> `size="lg"`.
- post-save-summary.tsx:331 `<div className="w-full shrink-0 snap-center overflow-y-auto px-6 py-8">` - [P3] 24px px not on 4/8 token (`px-6` = 24, fine).

## components/session-photos.tsx
- session-photos.tsx:82-120 - [P1] photo reorder controls `size-5` (20px) revealed only on hover (`opacity-0 group-hover:opacity-100`): on touch there is no hover, so Move left/right are unreachable and 20px. Remove button `size-5` (20px) `-top-1.5 -right-1.5` bare icon on `bg-bg`. -> always-visible `IconButton`s (40px, or 32 with 44px hit slop), reorder via a menu or drag.
- session-photos.tsx:111,121,186 - [P1] `text-white` hardcoded colour (not a token) on `bg-scrim`; scrim token has fixed black alpha so white is theme-independent but not a token. -> `text-on-action`/new `text-on-scrim` token.
- session-photos.tsx:135 + share-sheet.tsx:248 - [P1] `text-3xs` is **not defined** in theme.css (theme defines `text-2xs` 12px); class generates nothing, falling to inherited size. -> `text-2xs`.
- session-photos.tsx:95 - [P3] `<img src alt="">` decorative, but it's meaningful user photo thumbnail: `alt="Workout photo N"`; no `width/height` (CLS), use `size-full` ok (container has fixed size).
- session-photos.tsx:155-165 - [P2] `alt="Workout"` non-descriptive; `h-40 w-auto` no width/height attrs (CLS). `loading="lazy"` present. -> `alt="Workout photo {n}"`, add `width/height` or `aspect-*`.
- session-photos.tsx:122-137 - [P2] "Add" tile `<label>` wrapping hidden file `<input class="hidden">`: not keyboard focusable (display:none), no accessible name. -> `sr-only` input + `focus-within` ring, or `Button` triggering `inputRef.click()`.
- session-photos.tsx:211-218 - [P1] delete icon `size-6` (24px) bare with `backdrop-blur` (translucent blur surface; fine) no aria-label (title only).
- session-photos.tsx:51-58 - [P2] `await resizePhoto(file, MAX_DIM)` loop uses stale `photos` closure; two rapid picks can drop earlier additions (`onChange([...photos, ...added])` computed from old `photos` after awaits). -> functional update via ref.
- session-photos.tsx:42-48 - [P3] `photosRef.current = photos` assigned in render; fine.
- session-photos.tsx:65 `if (added.length) onChange` — oversized file/decode failure falls back to original `file` (could be 20MB+) with no feedback; no error state at all for the strip. -> size check + `text-neg` message.
- session-photos.tsx:171-196 - [P2] Delete confirm overlay buttons `size="sm"` 32px ; destructive inside photo; acceptable; "Delete photo?" `text-white`.
- session-photos.tsx:149 - [P1] `SessionPhotoCarousel` has no loading/error state: `useSessionMedia` default `[]` -> returns null; failed fetch hides photos silently (empty rendered). -> surface error.

## components/share-sheet.tsx
- share-sheet.tsx:346 - [P1] **hardcoded hex** `useState("#99c195")` (green-night-9 literal) for canvas accent; breaks theme/day mode and violates token rule. -> read `getComputedStyle(documentElement).getPropertyValue('--color-accent-solid')` at paint, or import a core constant if the canvas must stay brand-fixed and document it. (Check lib/share/grounds for the same.)
- share-sheet.tsx:438-452 (`div fixed inset-0 z-50`) - [P1] hand-rolled full-screen modal, same issues as post-save-summary: no `role="dialog"`/`aria-modal`, no focus trap, global `keydown` Esc listener only. Opened from within a Radix Dialog? (history-detail) -> focus conflicts. -> use `Dialog`.
- share-sheet.tsx:453-465 - [P1] close button `size-10` ok but bare (no resting bg, `hover:` only) and `title` only (no aria-label). -> `IconButton` + aria-label.
- share-sheet.tsx:61-80, 100-135, 175-190 - [P1] chip buttons `bg-translucent` fill ok; hero set picker buttons lack `rounded-sm` (first chip set has none, `ChipRow` has) -> inconsistent radii; selected state conveyed by colour only, no `aria-pressed` on `HeroSetPicker`, `ChipRow`. -> `aria-pressed`, `rounded-sm`.
- share-sheet.tsx:61,100 - [P2] horizontally scrollable chip rows `overflow-x-auto pb-1` with no scroll affordance and `scrollbar` styles from theme; ok on touch.
- share-sheet.tsx:206-217 (`PhotoPicker` thumbs) - [P2] `size-16` thumbnail buttons, no aria-label (img `alt=""` inside button => button has no name). -> `aria-label="Use photo N"`. `opacity-40` unselected is not a theme-colour state; contrast fail for unselected (disabled-like). 
- share-sheet.tsx:236-252 - [P2] Camera tile: hidden file input unreachable by keyboard (as above), `capture="environment"` forces camera on some Android and hides gallery pick; label says "Camera" but there's no gallery path besides session photos. P3.
- share-sheet.tsx:266-270 - [P3] helper copy "Pick a photo above" fine.
- share-sheet.tsx:318-336 - [P1] `navigator.share` failure path swallowed silently (`catch {}` comment "no-op"): a real failure (not AbortError) gives no feedback. -> only ignore `AbortError`, otherwise show error + fall back to download.
- share-sheet.tsx:285-300 - [P2] `paintQueue` chain never rejects (inner try/catch) ok; `setPendingFile(null)` inside effect triggers extra render; fine.
- share-sheet.tsx:402 - [P2] `aspect` string `style={{ aspectRatio: aspect }}` inline style; fine (dynamic).
- share-sheet.tsx:410-412 - [P3] preview checkerboard `bg-[repeating-conic-gradient(...)] bg-[length:24px_24px]` arbitrary values; allowed (tokenised var) but a "pattern" -> consider `bg-subtle`.
- share-sheet.tsx:484-492 - [P2] Share `h-14` (56px) / Save `h-10`; off-scale `h-14`; fine but label hierarchy ok. Bottom area uses `max-md:pb-safe-footer` good.
- share-sheet.tsx:421 - [P2] preview canvas has no accessible name; `role="img"` + `aria-label="Share card preview"`.
- share-sheet.tsx:472-480 - [P2] `paintFailed` error is `<p>` without `role="alert"`; disabled Share/Save give no reason while painting (no "Rendering…" status). -> `aria-live`.
- share-sheet.tsx:535-575 - [P2] `ShareButton` `title={disabled ? "Building your card…" : "Share as image"}`; `label` prop `string | null`, size union omits `lg`/`icon-lg` that Button has -> widen/derive from Button props.
- share-sheet.tsx:549 - [P3] when `label===null` icon-only button has only `title`. aria-label missing.
- share-sheet.tsx:28-31 - [P3] `ShareSource` export type fine.
- share-sheet.tsx:259-265 - [P3] `toneFor` unused branches; fine.

## components/conditions.tsx
- conditions.tsx:298-307 - [P1] `ConditionsChip` trigger `h-8` (32px) on session header row, truncate chip; has resting `bg-translucent`. Tap target <40 but not a logging action; acceptable-ish -> `h-10`.
- conditions.tsx:323-326 - [P3] `TODO(lessons)` comment left in JSX.
- conditions.tsx:343-373 - [P2] Add-input `h-10 ... md:h-8`; type chips `rounded-sm px-2 py-1 text-2xs` (~28px tall) tap targets <40; type chips lack `aria-pressed`. Preset chips same size. -> `min-h-10`/`h-8 min-w-10`, `aria-pressed`.
- conditions.tsx:22-27 - [P2] `TYPES` labels use glyphs `# ✓ ✎` as icons (`# Number`, `✓ Yes / No`, `✎ Text`) -> Phosphor icons; “1–10 Scale” en dash ok.
- conditions.tsx:36-48 - [P3] `stressWord` hardcodes seed id logic and label thresholds in UI; fine but `text-warn` == ink so "strained" is not visually distinct from "normal" (`text-faint`). -> use a real warn/neg token.
- conditions.tsx:353 (`createCustom`) - [P1] `await createMetric.mutateAsync` has no catch: failure = unhandled rejection, query text stays, no error shown; also `onQueryKeyDown` calls `void createCustom()`. -> try/catch + inline `text-neg` message.
- conditions.tsx:223-233 - [P3] `commit(...)` `update.mutate(next)` optimistic; no error surface when update fails (value appears saved: "Saved automatically." is shown unconditionally at 412). -> show failure state from `update.isError`.
- conditions.tsx:404-408 - [P2] "Saved automatically." static copy; claim unverified on failure. See above.
- conditions.tsx:486-499 (`NumberField`) - [P1] `<input>` has no label/aria-label (label is sibling `span` in `ConditionRow`), `focus:outline-none`, `autoFocus` with biome-ignore; `inputMode="decimal"` but no `name`/`autoComplete="off"`; unit span `w-6` truncates units like "mg/dL". -> `aria-label={label}`; unit `min-w-6`.
- conditions.tsx:491-492 - [P2] raw `<input>` with the full `border border-field` class string duplicating `ui/input.tsx` (3 copies: 492, 528, 691). -> use `Input` with className overrides.
- conditions.tsx:521-529 (`TextField`) - [P2] `placeholder="…"` (just an ellipsis) meaningless; no aria-label. -> `placeholder="Add note…"` + aria-label.
- conditions.tsx:545-555 (`ToggleField`) - [OK] uses Radix `Switch`; needs `aria-label={label}` (not passed): Switch has no name. -> pass `aria-label`.
- conditions.tsx:571-600 (`ScaleField`) - [P1] 10 buttons `h-7` (28px) in `grid-cols-10`: each ~28px wide at 390px? (width ≈ (390-64-36)/10 ≈ 29px) — tap targets <40px, fill-only meaning (no number labels), `aria-label={`${n}`}` is bare number with no context, no `aria-pressed`. -> `role="radiogroup"` + `role="radio" aria-checked`, `aria-label="Stress 7 of 10"`, `h-10`.
- conditions.tsx:602-614 - [P3] `"not set"` hardcoded; fine.
- conditions.tsx:616-668 (`RowMenu`) - [P1] same hand-rolled menu pattern (fixed backdrop button, no focus mgmt/Esc); `DotsThree` w/ `aria-label` good; `size-8`. Menu items `py-1.5 text-xs`. Menu unmounts but `delete` has no confirmation (`removeCustom` deletes a custom metric — **destructive, immediate, with no confirm/undo**; deletes metric definition across all history). -> confirm step like `SetActionsMenu`.
- conditions.tsx:111 - [P3] `eyebrow` const fourth variant of the eyebrow style.
- conditions.tsx:672-694 (`NotesBlock`) - [P1] textarea no `aria-label`; `focus:outline-none`; same border string duplicate; placeholder “…remembering…” ends with `…` good.
- conditions.tsx:134-148, 151-165 - [P2] `useEffect` + ref juggling (`localRef.current = localValues` in render, `sessionRef.current = session`) — manual sync-by-ref; and `useEffect(() => { if (open) seed })` causes a flash of stale `{}` on first open frame. -> derive from session when closed; seed in `onOpenChange`.
- conditions.tsx:95-125 - [P3] `useDebounced` hand-rolled; `lib/` may already have one (check `rg useDebounce`). If it exists dedupe.
- conditions.tsx:298 - [P2] chip `max-w-full ... truncate` with flex children; `truncate` on a flex container does nothing (needs on span, present at 303).
- Loading/error: [P1] `useSession`, `useMetrics`, `useTrackedConditions` errors ignored: sheet shows "Nothing tracked yet" for a failed metrics query (failed rendered as empty) -> branch on `isError`.

## components/lesson.tsx
- lesson.tsx:14-25 - [P1] `DialogTrigger` icon button: `p-1` + `size-4` icon = 24px tap target, no resting background (`hover:` only), `title` only (no aria-label), unseen dot `size-1` (4px) conveys state with no text alternative. -> `IconButton`-style 40px, `aria-label={lesson.title}`, sr-only "New".
- lesson.tsx:31-34 - [P3] `key={line}` duplicate-line risk; `text-ink-2` token ok.
- lesson.tsx:1-50 - [P3] `justify-self-center` irrelevant in flex context.
- States: no loading/error needed (static content).

---

## States inventory

| Screen / surface | Loading | Empty | Error | Modal/sheet | Notes |
|---|---|---|---|---|---|
| Session (blocks restore) | Yes (plain text, `session-loading`) | Yes ("No exercises yet.", auto-opens picker) | Yes (`session-error` + Retry) | n/a | good; loading is unstyled `<p>` |
| Session ghost / last-time | Yes (`spotlight-loading`) | Yes (row hidden) | **No** (error = empty) | n/a | P1 |
| Session exercises list (type resolution) | No | n/a | **No** | n/a | P1 type falls back to weight_reps |
| PR history (`recordsData`) | No (null) | n/a | **No** (unhandled rejection) | n/a | P1 |
| Set write (logSet) | n/a | n/a | Yes (`set-sync-error` banner + retry) | n/a | edits/deletes not covered |
| Exercise copy-on-write fork | Yes (`copying`) | n/a | Yes (`copy-error`) | n/a | role=status for error |
| Exercise picker | Yes | Yes (3 variants) | Yes (`picker-error`) | Dialog | history preview has loading/empty, no error |
| Voice match picker | n/a | Yes | n/a | Dialog | |
| Voice mic | `listening` pressed state | n/a | Yes (`micMessage`, 2.5s auto-clear) | n/a | message may overflow viewport |
| Exercise switcher | n/a | Yes | n/a | Dialog | |
| Set details sheet | n/a | n/a | n/a | Dialog | no metrics enabled = section hidden |
| Warm-up dialog | n/a | n/a | n/a (silent no-op on invalid) | Dialog | |
| Plate sheet | n/a | Yes ("Enter a weight…") | n/a (silent fallbacks) | Dialog | |
| Machine chip dialog | Partial (`isPending`) | Yes | Yes (retry) | Dialog (cmdk) | pick failure unhandled |
| Finish overlay | Yes (`Saving…`) | n/a | **Partial** (`catch { setSaving(false) }` silently resets, no message) | Dialog | P1: save failure shows nothing |
| Finish photos | n/a | Yes (add tile) | **No** | in Dialog | |
| PR banner | n/a | n/a | n/a | toast | 4s timer bug |
| Post-save summary | **Partial** (Share disabled only) | n/a | **No** | full-screen overlay (non-dialog) | |
| Share sheet | Yes (disabled until blob) | n/a | Yes (`paintFailed`, photo fail) | full-screen overlay (non-dialog) | share() errors swallowed |
| Photo carousel (history) | No | Yes (renders null) | **No** | n/a | |
| Conditions sheet | No | Yes ("Nothing tracked yet") | **No** (also failed saves) | Dialog | |
| InfoTip lesson | n/a | n/a | n/a | Dialog | |
| Onboarding | none in group (InfoTip unseen-dot only) | | | | |

## Cross-cutting (fix once in shared code)

1. **`outline-none` + `focus:` on text controls** (session.tsx 408/1744/4065/4270/4334/4508, conditions 492/528/691, machine-chip 155, plus `ui/input.tsx:11` itself uses `outline-none` + `focus-visible:border-focus`). theme.css has a global `:focus-visible` outline; every `outline-none` overrides it. Decide once: drop `outline-none` from `ui/input.tsx` and add `Textarea`/`NativeSelect` shared components in `components/ui` with `focus-visible:border-focus`; replace the 7 raw copies of `border border-field bg-... px-2 text-sm text-ink placeholder:text-faint focus:...`.
2. **Hand-rolled popover menus** (4 copies: `ExerciseSettingsMenu`, `SetActionsMenu`, `SessionDurationControl`, `conditions RowMenu`, each with a fixed full-screen backdrop `<button>`): add vendored shadcn `dropdown-menu` (Radix) with `min-h-10` items; delete the backdrop pattern.
3. **Hand-rolled full-screen overlays** (`post-save-summary`, `share-sheet`): add a `FullScreenDialog` wrapper over Radix Dialog (focus trap, Esc, `aria-modal`, safe-area padding, scroll lock).
4. **Icon-only buttons need `aria-label` and `aria-hidden` icons**: add a lint rule or make `IconButton` require `aria-label` (TS prop) and force `aria-hidden` on Phosphor icons via a small wrapper/`IconContext.Provider value={{ "aria-hidden": true }}` at the root. Affects ~45 icons here.
5. **`text-3xs` undefined** (session-photos:135, share-sheet:248): add `--text-3xs` or replace with `text-2xs`. Also ban `text-[Npx]` <12 (session.tsx 7px/9px).
6. **Sub-40px controls on logging path**: standardise `Button size="sm"` (32px) usage on mobile — add `h-10 md:h-8` for `sm` or a `touch` size; `IconButton` already does. Offenders: session `size-9`/`size-7`/`h-8` buttons, rest Stop, Finish Save/Discard, MarksBand, PR dismiss, photo controls, lesson trigger.
7. **Glyph-as-icon / emoji** (`⋯ ● ○ ✓ ᴸ ᴿ ⌨ ↺ 🔗 ▲ ▴ ▾ # ✎`): replace with Phosphor icons; emoji `🔗` is a hard violation.
8. **Duplicate helpers**: `mmss` (x2) / `formatRest` vs `formatMMSS`; `ordinal`; `slug`; volume-string; eyebrow class (>4 variants); stepper/jump rows. Create `Eyebrow`, `StepperField`, use `lib/format`.
9. **Failed-query-as-empty pattern** repeats (ghost, exercises, recordsData, conditions metrics, photos, post-save queries): provide a shared `<QueryState isLoading isError onRetry>` and `useQueryErrors` helper to apply `text-neg` + retry consistently.
10. **Unhandled mutation rejections / swallowed catches**: `.then(ok, () => {})` x3 in session.tsx, `createMachine`, `createMetric`, `finish save`. Add a shared `useReportError` toast host (also fixes the stacked `fixed top-28/top-44` banners and PR banner timer bug).
11. **Dead code**: delete `components/session/rest-countdown.tsx` (unused `RestDock`, stale countdown model); delete `nextGroupId`; unexport `machineLabel`.
12. **Hardcoded colour**: `#99c195` in share-sheet:346, `text-white` in session-photos:111/121/186 -> tokens.
13. **Labels**: many `<span>` captions beside inputs (Finish title/start, warmup weight, plates, RPE, conditions fields). Add `Field`/`Label` usage (ui/field.tsx exists) consistently with `htmlFor`.
14. **Font weight tokens**: `font-extrabold` used ~12x but theme weights end at 700; use `font-bold`.
15. **`role="status"` on errors** (session 1384, 3241): use `role="alert"`; timer readouts (`rest-stopwatch`) should not be live regions.
