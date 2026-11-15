# Audit: routines group

Files: `screens/{routine-edit,routines,programs,trainer,train}.tsx`, `components/routine/{adjust-field,routine-set-type-cell}.tsx` (all under `apps/web/src/`). Review-only; line numbers are approximate (±3).
Clean greps: no hardcoded hex/rgb, no raw tailwind palette colors, no `transition-all`, no `rounded-(xl|full|lg)`, no lucide, no `...` three-dot literals, no `<div onClick>`. Routes all `lazyRoute`. Good.

## screens/train.tsx
- train.tsx:14 - [P2] `Training` h1 and whole page has no loading/error for `useActiveSession` (`active` undefined while loading → "Resume" appears late, layout jumps) -> render skeleton/disabled Start until `isSuccess`, or show nothing extra; on `isError` show plain error line (text-neg) so a failed query doesn't read as "no active session".
- train.tsx:36-43 - [P3] dead ternary: `active ? "Start empty workout" : "Start empty workout"` -> `starting ? "Starting…" : "Start empty workout"`.
- train.tsx:21,26,50,70 - [P1] all buttons are `size="md"` = h-8 (32px) on a touch screen; Start/Resume are the primary path -> use `size="lg"` (h-10) for Resume/Start and the 3 entry-point buttons.
- train.tsx:20-22 - [P2] entry points (Programs/Trainer/Exercises) are navigation but are `<Button onClick={navigate}>`: no cmd/middle-click, wrong semantics -> `<Link>` styled with button classes (export a `buttonClass()` from ui/button.tsx, or wrap `<Button asChild>`-equivalent). Same for `Compass/Sparkle/Barbell` rows.
- train.tsx:66 - [P2] 3-col grid `grid-cols-3` at 320-375px with icon+label + `justify-start` truncates/wraps ("Exercises") -> `grid-cols-1 sm:grid-cols-3` or stacked Rows (use shared `Row`).
- train.tsx:44 - [P3] started time `text-2xs text-faint` is the only place the resume state is explained; `self-center` stacks oddly on mobile (flex-col) -> put above buttons.
- train.tsx:15-20 - [P3] icons lack `aria-hidden` (decorative next to a label) - app-wide, see Cross-cutting.

## screens/routines.tsx
- routines.tsx:67-68 - [P0] `useRoutineFolders()`/`useRoutines()` ignore `isLoading`/`isError`: a failed fetch renders the "No routines yet. Build one…" empty state (AGENTS.md: a failed query must never render as empty); loading flashes the same empty state -> destructure `isPending/isError/refetch`; show "Loading…" and an error + Retry (`userFacingRepoError`).
- routines.tsx:36-60,225-260,350-395 - [P1] two hand-rolled popup menus (`useFlippableMenu`, absolute div, `shadow-md`, `bg-surface`, `rounded-sm`) with no outside-click/Esc close, no focus management, no `role="menu"`, no keyboard nav, and a `getBoundingClientRect` + magic height constants -> replace with a Radix DropdownMenu (add `@radix-ui/react-dropdown-menu` via shadcn `dropdown-menu`, collision-aware, closes on outside/Esc). Deletes `useFlippableMenu`, `FOLDER_MENU_HEIGHT`, `ROUTINE_MENU_HEIGHT`, `MenuItem`.
- routines.tsx:240,369 - [P1] menu uses `shadow-md` + `rounded-sm` instead of the shared `floating` utility (routine-edit menus use `floating`, rounded-md). Inconsistent surface -> use `floating`.
- routines.tsx:459 - [P1] `MenuItem` h-9 (36px) < 40px touch target; no `focus-visible` styling beyond global outline (ok) -> `h-10`.
- routines.tsx:89-94,229-236,357-367 - [P1] icon buttons are bare `<Button variant="ghost" size="icon">` (32px) instead of shared `IconButton` (40px touch/32 desktop) -> use `IconButton` (+ `Toolbar` already used). Same for `DotsThree` -> consider `Dots`.
- routines.tsx:97 - [P2] header `New routine` is `size="sm"` outline (32px) fine on desktop, below 40px on touch; it's the page's primary action -> `variant="accent"` or `primary`, `size="lg"`.
- routines.tsx:199-205 - [P2] folder header toggle is hover-only bg (`hover:bg-surface-2`) with no `aria-expanded` -> add `aria-expanded={open}`; AGENTS.md exempts disclosure toggles for resting bg.
- routines.tsx:202-212 - [P2] caret/folder icons lack `aria-hidden`.
- routines.tsx:250-262 - [P1] destructive delete uses `window.confirm` (also routines.tsx:399, routine-edit.tsx:727, trainer.tsx:924,949) -> shared confirm Dialog (Radix AlertDialog/Dialog already vendored) with plain-language copy; native confirm is unstyled, blocks, ignores voice registers, and straight quotes `"…"` -> curly “…”. No undo window either.
- routines.tsx:263-282 - [P1] rename input: no Enter-to-save, no Escape-to-cancel, no Cancel button, empty name silently closes, `name` state not reset when `folder.name` changes, `className="h-8"` overrides to 32px -> use a Dialog like New folder or Enter/Esc handlers + Cancel; default `h-10` on touch.
- routines.tsx:272-278 - [P2] `Input` has no `aria-label`; placeholder-only labels (also 157 "Folder name", routine-edit.tsx:774 "Routine name", 926 note, 855 trainer search) -> add `aria-label`, `name`, `autoComplete="off"`, and placeholder ending in `…` with example ("Folder name…" / "e.g. Push day…").
- routines.tsx:160 - [P3] `autoFocus` inside Dialog is fine on desktop but pops keyboard on mobile; acceptable for a single-input dialog.
- routines.tsx:151-190 - [P2] duplicated create-folder logic (Enter handler and Create button copy the same 3 lines) -> single `submit()` and wrap in `<form onSubmit>`.
- routines.tsx:158,162,276 - [P2] `createFolder.mutate`, `rename`, `duplicate`, `move`, `del` have no error handling (fire-and-forget; failure silently reverts) -> `onError` toast/voice error line, or rely on global mutation error handler (verify it exists).
- routines.tsx:309-326 - [P1] `startRoutine` try/finally with no catch: a failed `startRoutineSession` becomes an unhandled rejection and the user sees nothing -> catch → show `userFacingRepoError` inline on the card (text-neg).
- routines.tsx:353-356 - [P2] Start button `size="sm"` 32px on a primary action; Start+menu on one row at 320px with long name leaves ~100px for name (truncates, ok) -> `size="lg"` on touch is too wide; keep sm but ensure ≥40px via `h-10 md:h-8` override or move to `lg`.
- routines.tsx:324-336 - [P2] card is a `<div>` with no navigation; tapping routine name does nothing (edit is buried in ⋯) -> make the name area a `Link` to `/routines/:id/edit` (or Row).
- routines.tsx:362-376 - [P3] Edit menu item doesn't call `menu.close()` before navigating (harmless) - inconsistent with others.
- routines.tsx:384-404 - [P2] Move dialog options are bare `<button className="hover:bg-surface-2">` with no resting bg; current folder only marked by text colour (no check/aria-current) -> use `rowClass()`/Row + `Check` icon + `aria-current`. Also "No folder" lacks current marker when `folderId===null`.
- routines.tsx:99 - [P3] empty-state CTA duplicates header "New routine" (fine) but uses `outline`; make `accent`.
- routines.tsx:218-221 - [P3] folder name `<span>` has no `truncate min-w-0` → long folder names overflow the row.
- routines.tsx:340 - [P3] `data-testid` keyed by name (collides with duplicate names) - test concern, leave.
- routines.tsx:106 - [P2] "Routines" section label `text-2xs tracking-widest uppercase`: caps label repeated ~14× across group (see Cross-cutting).
- routines.tsx:1-32 - [P3] stale comments referencing "no shared Popover component in this app yet" -> delete with DropdownMenu migration.

## screens/routine-edit.tsx
- routine-edit.tsx:274-283 - [P1] `useExercises` failure is only handled in the paste dialog; `useRoutineFolders` has no error/loading state (Select silently shows only "No folder"); picker dialog (`grouped.length === 0` → "No exercises match your search") renders a failed/loading library as "no match" (AGENTS.md rule) -> in picker: branch `libraryFailed` → error+retry, `!libraryLoaded` → "Loading…" before the empty message.
- routine-edit.tsx:355-396 - [P2] state set during render (`if (seeded) { setName…; setDrafts… }`): works but is a render-phase update; also `exerciseTypeOf(byId.get(...))` runs before `exercises` is loaded (byId empty → every exercise silently typed `weight_reps`, so a cardio/bodyweight routine gets wrong fields AND save() will null out its duration/distance targets) -> gate seeding on `libraryLoaded` (add to `draftReady`/`seeded` condition) — data-loss risk, treat as P1.
- routine-edit.tsx:727 - [P1] `window.confirm` with straight quotes `"Paste workout"` -> shared confirm dialog, curly quotes.
- routine-edit.tsx:747 - [P1] save error shows `e.message` raw (`error instanceof Error ? e.message : "Unknown error"`) - the one spot AGENTS.md says must go through `userFacingRepoError` -> use it.
- routine-edit.tsx:752-772 - [P1] header action row: Cancel + "Save routine" both `size="md"` (32px); on 375px with the h1 "Edit routine" is tight. No unsaved-changes guard on Cancel/back/route change (draft with many sets lost silently) -> `useBlocker` or confirm when dirty; `size="lg"` for Save. No BackButton (other sub-screens have one) → add `BackButton to="/routines"` for parity with programs/trainer.
- routine-edit.tsx:758 - [P3] dead `TODO(lessons)` comment -> remove or track.
- routine-edit.tsx:774-783 - [P2] Input fixed `h-10` ok; no `aria-label`, `name`, `autoComplete="off"`, placeholder should end with `…`.
- routine-edit.tsx:786-800 - [P2] folder `Select.Trigger` has no `aria-label`; no loading state for folders.
- routine-edit.tsx:926-933 - [P1] exercise note Input `h-8` (32px) on touch; unlabeled; "Exercise note (shows every session)" is placeholder-only → add aria-label, `h-10 md:h-8`.
- routine-edit.tsx:855-900 (set rows) - [P1] `-mx-3 px-3 ... si % 2 === 0 ? "bg-surface" : "bg-surface-2"` zebra inside a `bg-surface` card: full-bleed bands inside a rounded-md card with `p-3` produce square corners poking at card edge (corners must be 4/8/12/16/24; band needs `rounded-sm` or card needs `overflow-hidden`) -> add `overflow-hidden` on card or `rounded-sm` on bands.
- routine-edit.tsx:~895 - [P1] `SetMenu` uses `<Button variant="ghost" size="icon">` (32px) and `ExerciseMenu` uses `IconButton` - inconsistent; both below/at 40 only via IconButton -> `IconButton` in `SetMenu` too. Same for Dismiss `X` buttons (1227,1258,1288) → `IconButton`.
- routine-edit.tsx:1498-1690, 1700-1777 - [P1] `ExerciseMenu` and `SetMenu` (and `RoutineSetTypeCell`) are three more hand-rolled popups: full-screen invisible `<button aria-label="Close menu">` backdrop, no Esc, no focus trap/return, no `role=menu`, no keyboard arrows, items 28px high (`py-1.5 text-xs`) far below 40px -> migrate all (+ routines.tsx menus) to one shared Radix DropdownMenu wrapper in `components/ui/dropdown-menu.tsx`; items `h-10 md:h-8`.
- routine-edit.tsx:1523,1709 - [P2] `itemCls` duplicated twice verbatim, remove-item class duplicated twice (1677, 1767), bilateral/unilateral option list `[["bilateral",…],["unilateral",…]] as const` copied 3× -> extract `LATERALITY_OPTIONS` + shared `MenuItem`.
- routine-edit.tsx:1556 - [P3] `Flame text-warn` - `--color-warn` is aliased to text-primary (theme.css:283); fine but icon "warn" colour is just ink; keep or drop colour.
- routine-edit.tsx:1590-1600 - [P2] `text-2xs font-normal normal-case tracking-normal` overrides inside a label that inherited nothing - legacy of uppercase parent; remove overrides.
- routine-edit.tsx:942-1160 - [P2] one 220-line inline set-row JSX block inside `.map` inside `.map`; the unilateral and bilateral Reps/“to max” blocks are near-duplicates (1030-1090). The L and R AdjustFields both write the same `s.reps` (two inputs, one value — editing one visually edits both; misleading UI, comment 1056 admits) -> collapse to one field labelled "Reps per side" until a schema column exists; extract `<SetEditor>` component.
- routine-edit.tsx:1045,1081 - [P1] "max" `Field` inputs have `title` but no `aria-label`; `placeholder="max"`; width `w-14` & boxless (no visible field affordance, `Field` is transparent) - the only visible hint is placeholder → unlabeled for screen readers and nearly invisible; same for duration (1103), distance (1120), RIR (1138,1149) -> add `aria-label` each (`Reps max`, `Duration mm:ss`, `Distance`, `RIR min/max`) and a resting `bg-surface-2 rounded-sm`.
- routine-edit.tsx:1138-1152 - [P2] two RIR boxes both `placeholder="RIR"` and a bare `–`; label only visually via 2xs text; set inputMode ok.
- routine-edit.tsx:1103 - [P2] duration `inputMode="numeric"` but placeholder `mm:ss` needs `:` → on iOS numeric keypad has no colon; use `inputMode="text"`/`"numeric"` + pattern, or accept plain seconds.
- routine-edit.tsx:80-86 (AdjustField) see below.
- routine-edit.tsx:1186 - [P3] `text-warn` for unmatched message = same as primary ink; no warn visual distinction -> add icon (`Warning`) so it's not colour-only.
- routine-edit.tsx:1196-1240 - [P1] unmatched row: 3 actions on one row; Pick/Create `size="sm"` 32px; dismiss `X` 32px; no confirm needed. -> 40px on touch.
- routine-edit.tsx:1227-1260,1288 - [P2] dismiss buttons `Button size="icon"` should be `IconButton`.
- routine-edit.tsx:1243-1254 - [P3] `<li>` truncation of unparsed text; fine. `ul` lacks list semantics concern none.
- routine-edit.tsx:1316,1371 - [P2] picker/paste `DialogContent className="max-h-[80vh] overflow-y-auto"` - DialogContent already scrolls (dialog.tsx has `scrollRef`); redundant, and `80vh` should be `dvh` for mobile browser chrome.
- routine-edit.tsx:1335 - [P2] `Matching "{pickFor.rawName}"` straight quotes → curly; also `"Bench press 4x8"` in paste copy (1406-1410) and inside strings (use `×`/“ ”).
- routine-edit.tsx:1358-1372 - [P1] picker list buttons are `h-10` but have only `hover:bg-surface-2` (no resting bg; this IS a selectable list in a dialog → use `rowClass`/Row). Also no virtualization/`content-visibility` for ~900-exercise library (guideline >50 items): grouped list renders every exercise → add `content-visibility:auto` per group or cap with search.
- routine-edit.tsx:1343 - [P3] `autoFocus` on ExerciseFilterBar in a dialog opens mobile keyboard immediately covering list -> drop on touch (`!matchMedia("(pointer: coarse)")`).
- routine-edit.tsx:1418-1427 - [P1] hand-rolled `<textarea>`: `focus:outline-none` + only `focus:border-focus` (1px colour change, weak but it IS the text-field line so allowed), `rounded-sm border border-field` duplicated from `Input`; no `aria-label`, `name`, `spellCheck`, no `autoComplete`; placeholder contains literal newlines & no `…` -> add `Textarea` to ui (copy of Input classes) and label it. `px-2 py-1.5` vs Input `px-3`.
- routine-edit.tsx:1429 - [P2] `pasteError` / library error `<p>` lack `role="alert"`/`aria-live="polite"` (also 786 `error`, `routine-detail-status`, train.tsx error, trainer none) → add `role="alert"`.
- routine-edit.tsx:1437-1450 - [P3] Parse button label switches to "Loading…" / "Library unavailable" — fine.
- routine-edit.tsx:1458 - [P3] `attachMachineFor != null && list[attachMachineFor] && <MachineAttachDialog open={attachMachineFor != null}…>` redundant `open` expr.
- routine-edit.tsx:56 - [P3] imports `Link` from phosphor (icon) — shadow-prone name vs react-router `Link`; rename `Link as LinkIcon`. Used at ~1062.
- routine-edit.tsx:106-110 - [P3] stale comments (superset/"failure"/drop mentions, "PR body", "mid-rewrite on another branch"). `supersetGroup` still carried through DraftExercise but never edited (documented, ok).
- routine-edit.tsx:150-158,343,... - [P3] `crypto.randomUUID()` used for UI keys while core exports `newId()` (AGENTS: IDs via newId) -> `newId()`.
- routine-edit.tsx:208 - [P3] `e?.exerciseType as ExerciseType | undefined` any-style cast; `(s.setType as SetType)` at seed; `(EXERCISE_TYPES as readonly string[])` -> type guard helper.
- routine-edit.tsx:335 - [P2] `const id = newId()` / `const name` inside `patchExerciseField` shadow component-scope `id` and `name` (route id / routine name) → rename `forkId`, `forkName`; shadowing here is a latent bug magnet.
- routine-edit.tsx:315-335 - [P2] ~60-line fork-queue logic embedded in the screen; extract hook `useExerciseForkQueue` (not mechanical; flag for later).
- routine-edit.tsx:779-784 - [P3] large comment about flex-basis fine.
- routine-edit.tsx:948-960 - [P2] set rows' remove has no confirm/undo (immediate `Remove set` / `Remove exercise` destroys typed targets) → undo toast or confirm (guideline: destructive needs confirmation/undo).
- routine-edit.tsx:1159 (Add set) - [P2] `Button ghost sm` (32px) -> `size="lg"`/outline h-10 for primary repeated action.

### Dead-state checks in routine-edit
- `Cancel` navigates away with no dirty guard (P1 above). `saving` disables Save but not inputs (P3).
- Empty state: zero exercises shows nothing but two buttons (P2) -> add "No exercises yet" line; Save disabled with no explanation.

## components/routine/adjust-field.tsx
- adjust-field.tsx:80-90 - [P0] `<input>` has `focus:outline-none` and the only focus replacement is `focus:text-accent-ink` (a colour change of the value text; global `:focus-visible` outline is removed by `outline-none`). Keyboard focus is invisible against `text-ink`→`accent-ink` for a tiny contrast delta -> remove `focus:outline-none`, add `focus-visible:underline decoration` or put `focus-within:ring`-style on the wrapper: `focus-within:outline` (2px `--color-border-focus`) on the container div.
- adjust-field.tsx:80 - [P1] input has no label association: the `<span>` label isn't a `<label>`; no `aria-label` -> make the wrapper a `<label>` or add `aria-label={label}`; add `name`, `autoComplete="off"`, `enterKeyHint="next"`, `type` stays text with inputMode (ok).
- adjust-field.tsx:78 - [P1] input text-2xl/lg with `bg-transparent` and no box: comment says "obviously-typeable boxed field, accent-underlined" but neither a box nor underline exists → rework: wrapper already `bg-surface-2`; add the 1px field line? (only allowed on text fields: use `border-b border-field` on the input row) or leave and fix comment.
- adjust-field.tsx:98-110 - [P1] delta chips: `px-1.5 py-1 text-2xs` ≈ 24px high, 8 chips for weight — far under 40px on the logging path; wrap on 320px; no `aria-label` ("Add 5") (screen reader reads "+5"/"−15" fine but minus sign uses hyphen `-15`) -> `h-10 min-w-10 md:h-8`, use `−` (U+2212) in label, `aria-label={`${d>0?"Add":"Subtract"} ${Math.abs(d)}`}`; 8 chips × 40px wraps to 3 rows: use horizontal scroll or two rows of 4.
- adjust-field.tsx:101 - [P3] chip `bg-accent-soft/70` hover opacity modifier on token ok.
- adjust-field.tsx:56-60 - [P2] hint `truncate` (e.g. "same as set 2") okay; `text-2xs` (12px) is the smallest size and used for primary labels — below readable on mobile for label/units. See cross-cutting.
- adjust-field.tsx:61 - [P2] `num` + `placeholder="—"`; `placeholder` not ending `…`; fine for numeric.
- adjust-field.tsx:10-16 - [P3] stale comment ("session.tsx is mid-rewrite on another branch", "PR body") and duplicated-by-design with session; track dedupe.
- adjust-field.tsx:30-38 - [P3] `applyDelta` locale: `parseFloat("12,5")` (decimal-comma keyboards) → NaN → treated as 0; `onValueChange` accepts any text, no sanitising. Use shared `parseFloatOrNull` from lib/format.
- adjust-field.tsx:117-125 - [P3] exports consts `WEIGHT_DELTAS/REPS_DELTAS/REPS_DELTAS_COMPACT`: all used (routine-edit). OK. `AdjustFieldProps` export unused elsewhere → un-export.

## components/routine/routine-set-type-cell.tsx
- routine-set-type-cell.tsx:35-46 - [P1] trigger is a bare-text button (`num min-w-3 text-left text-2xs` number/marker) with no resting background — violates "buttons never bare text"; tap target ~12×16px (!), `title="Set type"` only, no `aria-label`/`aria-haspopup`/`aria-expanded` -> `h-10 min-w-10 rounded-sm bg-surface-2` (or h-8 md) + `aria-label={`Set ${index+1} type`}`.
- routine-set-type-cell.tsx:47-60 - [P1] fixed full-screen "Close menu" backdrop button with `tabIndex={-1}`, `onMouseDown preventDefault` everywhere; no Esc/focus return/roles. Same as menus above → shared dropdown. Items `py-1.5 text-xs` ≈ 28px < 40px.
- routine-set-type-cell.tsx:62 - [P2] `Check` icon without `aria-hidden`; `tabular-nums` redundant with `num`.
- routine-set-type-cell.tsx:12-21 - [P3] stale comment, and duplicate of `components/ui/set-type-cell.tsx` (imports `markerColorClass` only) → dedupe once session lands.
- routine-set-type-cell.tsx:37 - [P2] `onMouseDown={(e) => e.preventDefault()}` on every menu button (copied from session's focus-keeping hack) breaks focus on click and is pointless in this screen.

## screens/programs.tsx
- programs.tsx:44-60 - [P1] `Chip`: `h-8` (32px), no `rounded-*` at all → square corners (brand: corners on scale; every other control is `rounded-sm`); duplicated in trainer.tsx `Segmented` (h-9, `flex-1`) and equipment chips (h-8, line 238) → one shared `Chip`/`ToggleChip` in ui/ with `rounded-sm h-10 md:h-8`, `aria-pressed`.
- programs.tsx:47-60 - [P2] `bg-translucent` resolves to `--color-bg-subtle` (theme.css:258) – misnomer but a visible resting bg: OK.
- programs.tsx:90-130 - [P2] three filter rows each `overflow-x-auto pb-0.5` with no scroll affordance/`snap`; chips don't wrap → hidden options on 320px with no fade. Use `flex-wrap`. Filter state is `useState` only (guideline: URL reflects filters) → `useSearchParams`.
- programs.tsx:78-80 - [P2] `ProgramCatalog` lazy ok; no loading state needed (static catalog). Empty state exists (`filtered.length === 0`) but uses `t()` with `py-8 text-center`; fine.
- programs.tsx:172 - [P3] class order `rounded-md block` (non-canonical) → `block rounded-md`; same trainer.tsx:762 `rounded-md absolute`.
- programs.tsx:176-192 - [P2] card meta uses 4 separate spans + literal `·` spans (screen readers read "dot") -> single `<p>` joined text, or `aria-hidden` separators. Also in header 232-247.
- programs.tsx:170 - [P2] card uses `bg-surface p-4` Link with `hover:bg-surface-hover` – fine (has resting bg). `Row` not used (these are cards; ok).
- programs.tsx:214-222 - [P0] `useExercises()` error/loading: `generated` null when `exercises.length === 0` — a FAILED library fetch shows "Loading your exercise library…" forever, Save stays disabled with no reason (violates failed-query rule) -> read `isError` and show error + retry; also a legitimately empty library loads forever.
- programs.tsx:224-242 - [P1] `save()` `await materialize.mutateAsync` has no try/catch → unhandled rejection, no error UI; also no success feedback besides navigation -> catch and show `userFacingRepoError` (text-neg, role=alert).
- programs.tsx:237 - [P2] "Save program" label while saves to `/routines` as a folder; fine. `t()` wraps only pending text; inconsistent voice usage (pending text via `t`, idle via plain) – ok.
- programs.tsx:252-264 - [P2] "Program not found" "Back to programs" Link is bare text `text-xs text-accent-ink` – no resting background (AGENTS: no bare-text buttons; a link styled as text is arguably allowed, but this is the only action on that screen) → use button-styled Link.
- programs.tsx:250 - [P2] `if (!entry)` return occurs after hooks – ok.
- programs.tsx:285-318 - [P3] preview block duplicated with trainer.tsx `GeneratedPreview` (same reps formatting, same markup, rest suffix differs) → extract `<ProgramRoutinePreview>` component + `formatRepRange()` helper (also duplicated at trainer.tsx ~360 for `ExerciseRow`).
- programs.tsx:299-301 - [P2] `first?.targetReps ?? ""` produces "3 × " with empty reps for timed/cardio exercises → handle duration/blank (`—`).
- programs.tsx:304 - [P2] `${ex.restSec}s rest` fine; `ex.sets.length × reps` uses `×` ok.
- programs.tsx:296 - [P3] `key={r.name}` collides if two routines share a name → index key.
- programs.tsx:104,243 - [P3] `pb-24 md:pb-6` vs train's `pb-20`: inconsistent bottom padding (AGENTS notes `pb-20`).
- programs.tsx:225-240 - [P2] no `aria-busy`/spinner but label changes; fine.
- programs.tsx:269-272 - [P3] Back from detail uses fixed `to="/programs"` (fine).

## screens/trainer.tsx
- trainer.tsx:96 - [P0] `useActiveProgram`: `isLoading ? null` renders blank (no "Loading…" state), and `isError` is not read so a failed fetch falls to `<TrainerOnboarding/>` ("start a new program") while an active program exists — user can then overwrite/duplicate it. -> handle `isError` (error + Retry) and render "Loading…" while pending.
- trainer.tsx:467-476 - [P1] settings trigger labelled "Gear" (icon name leaked into copy); `ghost sm` 32px -> label `Settings`/aria-label, `IconButton` + `Gear` icon, plain-language.
- trainer.tsx:108-132 (`Segmented`) - [P1] option buttons have no `rounded-*` (square), `h-9`, and `flex-1 shrink-0` within `overflow-x-auto` row; `aria-pressed` but not a `role="radiogroup"`; DAYS/MINUTES numbers lack `num`; use shared Chip (see programs) with `h-10`.
- trainer.tsx:230-247 - [P1] equipment toggle chips `h-8` square corners, duplicates Chip again (third copy of the same pill).
- trainer.tsx:142-155 - [P2] local `Field` component (label wrapper, `<p>`, not a `<label>`) shadows the name of `ui/field.tsx` `Field` used in routine-edit — confusing; and controls inside lack label association → rename `FormRow`, render `<fieldset><legend>` / `<label>` and give Segmented `role="radiogroup" aria-label`.
- trainer.tsx:98-104 - [P2] header paragraph + `BackButton` repeated pattern in programs/trainer → shared `ScreenHeader` (cross-cutting).
- trainer.tsx:297-299 - [P2] `GeneratedPreview` recomputes `generateProgram` on every config change synchronously (cheap?) — memoised; fine. Preview only renders `library.length > 0`; when library is still loading/failed there is NO state at all, Start button just disabled silently → show "Loading exercise library…"/error line (failed-query rule). Same `useExercises` in dashboard.
- trainer.tsx:307-330 - [P2] dup of programs preview (see above); `key={r.name}`.
- trainer.tsx:337-356 - [P1] `start()` awaits `materialize.mutateAsync` without catch: failure = unhandled rejection, no UI.
- trainer.tsx:456-461 (dashboard) - [P2] "Loading your next workout…" shown forever when `td.nextRoutine` is undefined for any reason (including failure) → error branch + empty branch (program with 0 routines).
- trainer.tsx:491-509 - [P1] `NextWorkoutCard.startWorkout` try/finally no catch (same as routines.tsx).
- trainer.tsx:511-542 (`applyProgression`, `removeExercise`, `replaceExercise`) - [P1] mutate calls with no confirmation/undo; `removeExercise` and "Don't recommend again" immediately destructive (rewrites the routine). `Remove` has no confirm → add undo toast or confirm.
- trainer.tsx:573 - [P3] `NextWorkoutCard` ~190 lines, 4 near-identical `updateRoutine.mutate({ routineId, patch: buildRoutineInput(routine, exs) })` → single `commit(exs)` helper.
- trainer.tsx:742-775 (`ExerciseRow` menu) - [P1] 5th hand-rolled popup: `rounded-md absolute … shadow-md bg-surface` (not `floating`), no outside-click close, no Esc, `h-9` items, no collision flipping — last row's menu clips at bottom of screen; `MenuItem` is a duplicate of routines.tsx `MenuItem` (different height/classes) → shared DropdownMenu.
- trainer.tsx:751-757 - [P1] menu trigger `Button ghost icon` 32px → `IconButton`.
- trainer.tsx:821-830 (`MenuItem`) - [P2] duplicate (see above).
- trainer.tsx:832-897 (`ReplaceDialog`) - [P1] list buttons `h-10` hover-only bg (no resting) → Row; search Input no `aria-label`/`name`; `muscle` null state "No alternatives available" fine; no loading state for `library`; search not debounced (fine, small); `slice(0, 20)` silently truncates without hint.
- trainer.tsx:855 - [P3] placeholder "Search all exercises…" ok.
- trainer.tsx:905-960 - [P1] `window.confirm` ×2 (doRegenerate/doRemove) with copy; native confirm → shared confirm dialog. `doRegenerate` mutate no error handling. "Training tab" copy: Routines live on the Routines tab now (since 2026-08-08, per routines.tsx comment) → stale copy at ~971 and `confirm` ~950 ("stay in your Training tab") -> "Routines tab".
- trainer.tsx:915-922 - [P2] `useState(() => program.config as unknown as GeneratorConfig)` any-style double cast; no validation of persisted config shape → zod/guard with DEFAULT_CONFIG fallback.
- trainer.tsx:968 - [P2] `Program settings` dialog: `max-h-[60vh]` inner scroll inside already-scrolling DialogContent (double scroll) → remove.
- trainer.tsx:1015-1021 (BW_CONFIG) - fine (uses `var(--chart-1)`).
- trainer.tsx:1033-1050 - [P2] `ProgressReport` returns `null` while `records` undefined (no loading, no error) → silent absence; failed `useRecordsData`/`useMeasurements` hide the whole report without notice.
- trainer.tsx:1055-1070 - [P3] `now` pinned via `useMemo(() => Date.now(), [])` ok.
- trainer.tsx:1105 - [P2] `<h2>` "Progress report" is `text-2xs uppercase` while page `<h1>` "Trainer" has no h2 between; "Your program" is a `<p>` not heading → headings not hierarchical for the dashboard; use h2 for "Your program" and "Progress report".
- trainer.tsx:1129-1139 - [P1] weekly consistency bars: raw `<div style={{height}}>`, `bg-accent` square, no accessible name/value (only tiny `num` count) and no week labels; inline `style` for dynamic height is acceptable but chart is hand-rolled (AGENTS: shadcn chart `BarChart` exists in the file's own imports) → replace with `ChartContainer` + recharts `BarChart` (labelled), or add `role="img"` with `aria-label`. `Math.max` recomputed inside map (O(n²)) → hoist.
- trainer.tsx:1285-1320 (`SetsPerRegionBars`) - [P1] hand-rolled horizontal bars with inline `style` percentage; band + bar differentiate by colour only (`bg-pos` vs `bg-accent`) with no text/pattern cue besides the legend, which colours text `text-pos` ("green band") — colour-only info; no semantics (`role=meter`/`progress`) → add `role="meter" aria-valuenow/min/max` per row or use shadcn BarChart.
- trainer.tsx:1112 - [P3] `h-42` custom height class (exists? Tailwind v4 dynamic spacing yes) ok.
- trainer.tsx:1180 - [P2] `Stat` totals: hours rounded `Math.round(durationMs/3_600_000)h` shows "0h" for short programs; value `num` ok.
- trainer.tsx:1215 - [P3] `text-pos` used for "green band = 10–20 recommended" → "green" is the Fern accent while `pos` is the teal success colour (`--color-success-*` is #016869 teal!) → copy says green, UI is teal; fix text to "teal"/"highlighted band" or use accent token consistently. Brand check: `pos/15` band alpha ok.
- trainer.tsx:1237 - [P3] `FlagBadge` has `Check` icon without `aria-hidden`.
- trainer.tsx:1140 - [P3] chart `accessibilityLayer` ok; tooltip `Number(v).toFixed(1)` fine; `dot r:2.5` fine.
- trainer.tsx:42-44,125 - [P3] `Intl` date formatting uses `undefined` locale ok.

## States inventory

| Screen | Loading | Empty | Error | Modal/sheet | Onboarding | Notes |
|---|---|---|---|---|---|---|
| train | no (active session pending shows Start only) | n/a | start error only (inline, ok); `useActiveSession` error unhandled | – | – | |
| routines | **missing** (flashes empty) | yes (no routines/folders), per-folder "Empty folder" | **missing** (reads as empty) | New folder dialog, Move dialog, rename inline, native confirm ×2 | empty state = first-run CTA | menu popups hand-rolled |
| routine-edit | seed loading line yes; library load only in paste dialog; folders none | zero exercises: no message | detail broken yes; library failed only in paste; save error raw | picker dialog, paste dialog, ExerciseEditor, MachineAttachDialog, native confirm | – | picker lacks loading/error |
| programs list | n/a (static) | yes (no filter match) | n/a | – | – | filters not in URL |
| program detail | "Loading your exercise library…" | not-found yes | **missing** (infinite loading) | – | – | save has no error UI |
| trainer | **missing** (renders null) | n/a | **missing** (falls through to onboarding) | Settings dialog, Replace dialog, native confirm ×2 | yes (questionnaire + preview) | report hides itself silently when records absent |
| trainer dashboard | "Loading your next workout…" (forever on failure) | no routines: unhandled | none | – | – | |

## Cross-cutting (fix once in shared code)
1. One shared Radix `DropdownMenu` wrapper (`components/ui/dropdown-menu.tsx`, items `h-10 md:h-8`, `floating` surface, Esc/outside/keyboard/collision) to replace 6 hand-rolled popups: routines.tsx ×2 (+`useFlippableMenu`), routine-edit.tsx `ExerciseMenu`/`SetMenu`/`RoutineSetTypeCell`, trainer.tsx `ExerciseRow`. Shared `MenuItem` (3 copies now).
2. Shared confirm dialog hook (`useConfirm`) replacing 5× `window.confirm` (routines ×2, routine-edit, trainer ×2), curly quotes, voice-aware, ideally with undo toast for removals.
3. Shared `Chip`/`ToggleChip` (programs `Chip`, trainer `Segmented`, trainer equipment chips) with `rounded-sm`, `h-10 md:h-8`, `aria-pressed`; currently square corners.
4. `Button` size scale: `md`/`sm`/`icon` are 32px with no touch bump (only `IconButton` has 40px touch). Add `h-10 md:h-8` behaviour (or `touch` variants) to `Button` and migrate bare `Button size="icon"` usages to `IconButton`.
5. `Textarea` in ui/ (copy of `Input` classes) + label/`name`/`autoComplete` defaults; `Input`/`Field` call sites need `aria-label` enforced (placeholder-only labels everywhere).
6. Shared `<QueryState>`/pattern for loading → error(+Retry via `userFacingRepoError`) → empty so list screens stop rendering failed/loading as empty (routines, routine-edit picker, program detail, trainer, train).
7. Shared `ScreenHeader` (BackButton + h1 + subcaption) — programs/trainer duplicate it, routine-edit/routines/train don't use BackButton at all.
8. Shared `ProgramRoutinePreview` + `formatRepRange()` (duplicated in programs.tsx, trainer.tsx ×2).
9. Small-caps label class (`text-2xs font-medium tracking-widest uppercase text-faint`) repeated ~14× → `<Eyebrow>`/utility; `text-2xs` (12px) used for labels, values and units – below comfortable mobile size; consider `text-xs` min for data labels.
10. `aria-hidden` on decorative Phosphor icons next to text (none in this group have it); consider a default in an icon wrapper or lint rule.
11. Fire-and-forget mutations (`duplicate`, `move`, `del`, `rename`, `createFolder`, `updateRoutine` in trainer) have no error surface; add a global MutationCache `onError` → voice error line.
12. Replace `crypto.randomUUID()` UI keys with `newId()`; remove stale "PR body / mid-rewrite" comments in routine components; dedupe `routine-set-type-cell` + `adjust-field` with session equivalents when the session branch lands.
13. Filter/UI state not in URL (programs filters, picker query) — `useSearchParams`.
14. Native `autoFocus` use: guard for coarse pointers.
