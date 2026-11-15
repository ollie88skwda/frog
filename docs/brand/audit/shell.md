# Audit: shell group

Files: apps/web/src/{app,main}.tsx, apps/web/index.html, styles/theme.css, components/{app-shell,command-palette,error-boundary,frog-mark,home-hero,import-card}.tsx, components/ui/* (all), screens/{auth,home,settings,profile,history,history-detail,tips,changelog,not-found}.tsx, public/manifest.webmanifest, public/sw.js. Review-only; paths below relative to apps/web/ unless noted.
Greps run: outline-none, transition-all, off-scale radii, hex/rgb, raw palette, lucide (none), `any` (none), `...` literals (none), div/span onClick (none), dead exports (cymbal/grep).

## src/app.tsx
- app.tsx:115 - [P1] `<Suspense fallback={null}>` around ALL routes: every lazy route load (and RequireAuth `isLoaded` false, auth.tsx:110 returns null) paints a blank page, no loading state -> fallback = minimal centered `<FrogMark>` + `role="status"` "Loading…" (eager, tiny) or at least `bg-bg` skeleton; also give `RequireAuth` the same.
- app.tsx:111-169 - [P2] `AppErrorBoundary` wraps the whole tree incl. router: a single screen crash replaces the shell (no nav). Route-level boundary inside `AppShell` Outlet would keep the tab bar -> keyed `<AppErrorBoundary key={pathname}>` around `<Outlet/>` (reuse same component) so navigating away recovers without a reload.
- app.tsx:161 - [P2] NotFound lives inside `RequireAuth`, so a signed-out user hitting a bad URL is bounced to /auth; acceptable. No finding beyond noting.
- app.tsx:87-92 - [P3] no global `QueryCache.onError`; failed queries only surface where screens handle them (see Cross-cutting).
- app.tsx:99 - [P3] comment names `__frog` in prose; fine (bracket rule is for DECISIONS.md only).

## src/main.tsx
- ✓ pass. (`test-hooks` import is the gated E2E bridge.)

## index.html
- index.html:5 - [P2] viewport lacks `viewport-fit=cover`; app uses `env(safe-area-inset-bottom)` (app-shell.tsx:127,136, theme `pb-safe-footer`) and `apple-mobile-web-app-status-bar-style=black-translucent` (:18). Without `viewport-fit=cover` the insets are 0 on iOS and content sits under the translucent status bar in standalone mode -> add `viewport-fit=cover` and add top inset padding (`pt-[env(safe-area-inset-top)]`) to the page wrapper/`AppShell`, or switch status-bar-style to `default`.
- index.html:13,71 - [P2] theme-color hardcodes `#191513`/`#fcf9f4` (matches `--color-bg-page` night/day today, but duplicated in 3 places: index.html:13, :71, manifest). Add one comment noting source or generate; also add `<meta name="color-scheme" content="light dark">` so pre-hydration canvas isn't white flash in night (theme.css only sets color-scheme after CSS loads; there is also no inline `<style>` for bg before JS) -> add `<meta name="color-scheme" content="light dark">`.
- index.html:51-73 - [P3] pre-paint script uses `var` and `localStorage` without try/catch: throws in Safari private/blocked storage and the whole script dies (theme never set, `data-theme` missing -> every token undefined, unstyled app) -> wrap in try/catch with `root.dataset.theme="green"; root.dataset.mode = matchMedia(...)` fallback. Legacy `theme` migration block is dead weight once old users have migrated; remove after a release window.
- index.html:7 - [P3] no `<link rel="preload" as="font" type="font/woff2" crossorigin href="/fonts/Geologica-variable-latin.woff2">` (theme.css:15 font-face, `font-display: swap`) -> add preload; first paint otherwise FOUT's against Avenir fallback. (Font file path not verified under public/: `ls public` shows `fonts/` exists.)
- index.html:6 - [P3] `<title>` static "Frog": no per-route titles anywhere (no `document.title` in src) -> add `useDocumentTitle` or set in each screen; screen-reader/tab history unusable.
- index.html: [P2] no skip link / `<main>` landmark has no id; add `<a href="#main" class="sr-only focus:not-sr-only …">Skip to content</a>` in AppShell and `id="main"` on `<main>` (app-shell.tsx:127).
- index.html:30,43,45 - [P3] "Frog — a training lab notebook" uses em dash; tolerated by og check; leave.

## styles/theme.css
- theme.css:2-529 - [P1] **stale/unused tokens**: `--space-10/12/16`, `--dur-fast/base/sidebar`, `--ease`, `--radius-control/chip/panel/menu/dialog/checkbox`, `--color-translucent`, `--color-brand`, `--color-warn`, `--font-weight-*` partly; only some used. Verify and delete orphans (e.g. `rg -- '--space-1[026]|--dur-|--radius-(chip|panel|menu|dialog|checkbox)'`). `--color-warn: text-primary` means "warn" == ink: session.tsx uses `text-warn` for warm-up marker, which is indistinguishable from body text (set-type-cell.tsx:17, session.tsx:2477,2604,2740) -> give warm-up its own tone or stop calling it warn.
- theme.css:233-236 - [P1] `--color-soft`, `--color-faint`, `--color-ink-2` all alias the SAME `--color-text-secondary` (#5d4f4a); `faint` is used for 2xs hints, placeholders and disabled-looking copy. Hierarchy flattened by design but names lie -> either collapse to one token or restore a real tertiary (`--color-text-disabled` #786c63 is only 4.0:1 on day-1 and fails AA for 12-13px text, so do NOT use it for copy; keep faint=secondary). Document the alias in the file header.
- theme.css:169,246 - [P2] `--color-text-disabled:#786c63` on `--color-bg-page:#fcf9f4` ≈ 4.5:1 borderline; on disabled `bg-hover` (#ece5da) (button.tsx:46 `disabled:bg-hover disabled:text-disabled`) ≈ 3.7:1 -> OK for disabled (exempt by WCAG) but verify with better-colors; no change required.
- theme.css:253-254 - [P3] `--radius-2xl/3xl: var(--r-xl)` remap hides misuse: `rounded-2xl`/`rounded-3xl` silently become 24px. Grep shows none in group; leave but delete to make misuse fail loudly.
- theme.css:343-346 - [P2] `font-size: 16px !important` on coarse pointers for ALL inputs/selects/textareas: overrides `text-xs/2xs` inputs (settings Input, `Field`, import file input). Intentional (iOS zoom) but `!important` inside `@layer utilities` beats Tailwind sizing everywhere -> OK; note `Field` (`text-sm`=15px) is then 16px on touch; fine.
- theme.css:362-364 - [P2] `@utility commit-flash` and `float-in` animate box-shadow/translate+scale; `commit-flash` animates `box-shadow` (non-compositor) -> per rules "transform/opacity only": swap to an `::after` overlay with opacity. `float-in` uses `scale(0.99)` + `translateY(2px)`: ok. Both neutralised by the reduced-motion block (:327-329).
- theme.css:330 - [P2] reduced-motion rule sets durations to 0.01ms but does not set `scroll-behavior:auto` nor `animation-iteration-count:1`; dialog.tsx:33 uses `behavior:"smooth"` in JS regardless of motion preference -> in dialog.tsx check `matchMedia("(prefers-reduced-motion: reduce)")` and use `"auto"`.
- theme.css:204-206 - [P3] `forced-colors` block sets `border:1px solid CanvasText` on button/input/select: contradicts "no borders" only in forced-colors (fine; document). Does not cover `[role=option]`, switch, chips.
- theme.css:296 (`:where(...[class*="rounded"])…corner-shape: squircle`) - [P3] attribute substring selector over every element with `rounded` in class; perf nit on huge lists. Acceptable; flag only.
- theme.css:246-249 - [P2] `* { border-color: border-field }` base + `button { border: 0 }` OK. But no global `overscroll-behavior`/`html` rubber-band rule (`overscroll-behavior: none` in `@media (pointer: fine)`) -> add. No `overscroll-behavior: contain` on dialog content (dialog.tsx:59) -> add `overscroll-contain` to the scroll div (:84).
- theme.css:30-72 - [P3] `--neutral-day-*`/`--green-*` ramps duplicated as raw hex also re-listed in `--color-*` blocks (:78-:172): the second layer hardcodes hex again instead of `var(--neutral-day-1)`. Two sources of truth for the same values -> point `--color-*` at the ramp vars.
- theme.css:395-398 - [P3] `.rbh polygon` selector outside any layer (unlayered beats layers) fine.
- theme.css:7-9,20-23 - [P2] only a latin subset font shipped (`Geologica-variable-latin.woff2`); no `unicode-range`, so `ᴸ`/`ᴿ`/`⌘`/`ⓘ`/`·` glyphs fall back to the system font mid-row (set side markers in history-detail.tsx:495). Verify they render at matching weight; else swap markers for `L`/`R` text in Badge-like chip.

## components/app-shell.tsx
- app-shell.tsx:67-78 - [P0] sidebar theme toggle: icon-only `<button>`, no `aria-label` (only `title`), `p-1` (~24px) bare button with only a hover background (no resting bg), violates tap/no-bare rules, bespoke -> `<IconButton aria-label="Toggle theme" title="Toggle theme" onClick={toggle}>` (icon: Sun/Moon, `aria-hidden`).
- app-shell.tsx:70 - [P2] label says "Toggle theme" but the action is binary Day/Night while settings has 3-way Device/Day/Night; toggle overwrites Device preference silently -> label `Switch to {night?"day":"night"} mode`.
- app-shell.tsx:60 - [P1] sidebar uses `w-56 shrink-0` and `max-md:hidden`; at md the content is `max-w-2xl` so wide screens leave dead space; fine. Not an issue.
- app-shell.tsx:81-83 - [P3] "Workspace" eyebrow label `tracking-widest uppercase text-2xs` (14+ copies repo-wide) -> shared `SectionLabel`/`@utility eyebrow`.
- app-shell.tsx:84-119 - [P1] desktop nav only exposes 4 of ~12 destinations (Library, History, Findings, Calendar, Measures, Settings, Tips, Changelog are reachable only via ⌘K or Profile tiles); sidebar nav items `h-8` fine on desktop. Settings has no persistent entry on desktop (only Profile gear icon). -> add Library/History/Findings/Settings to NAV or a second group (desktop only).
- app-shell.tsx:24-29 - [P3] `key: null` field on every NAV item + `{key && <kbd>}` (:115) is dead code (bare shortcuts removed 2026-08-07 per AGENTS). Command palette also still lists `shortcut: "L"/"H"/"F"` (command-palette.tsx:69,75,81) which are NOT bound anywhere -> **lying keycap hints**. Remove `key`, `shortcut` and their kbd render.
- app-shell.tsx:121-124 - [P2] "⌘K for commands" hint shown even on non-Mac (Ctrl+K works) and `⌘` + `K` needs `&nbsp;`; on desktop only -> detect platform: `navigator.platform` capability guard -> `Ctrl K`. Also palette unreachable on touch (no visible trigger on mobile tab bar): add search IconButton in headers or Profile.
- app-shell.tsx:127 - [P1] `<main>` is the scroll container (`overflow-y-auto`) inside `h-dvh` flex: route changes do not reset scroll (no ScrollRestoration/scrollTo in repo), so navigating from a scrolled list to a detail keeps the scroll offset -> add effect on `pathname` that sets `mainRef.current.scrollTo(0,0)` (skip on back/forward if wanting restoration).
- app-shell.tsx:127 - [P2] no `id="main"`, no skip link; also add `tabIndex={-1}` so focus can be moved to main after navigation.
- app-shell.tsx:136 - [P1] mobile tab bar is `fixed` over content; `max-md:pb-[calc(5rem+env(...))]` compensates but every screen ALSO adds `pb-20 md:pb-6`/`pb-24` (23 occurrences in screens) -> double clearance (≈160px dead space, noted in AGENTS e2e bullet). Remove per-screen `pb-20 md:pb-6` and rely on shell (or vice versa).
- app-shell.tsx:136 - [P2] `float-in` on the persistent nav replays its entrance animation on every AppShell mount (login, after crash recovery) -> drop `float-in` from the tab bar (not a floating layer entrance).
- app-shell.tsx:131-135 - [P3] stale comment "square corners hold the 0px-radius design language" -> old identity leftover; actual style is `.floating` (rounded-md). Fix comment.
- app-shell.tsx:111,158 - [P1] unseen-changelog dot `size-1.5 bg-accent` is square (no `rounded-full`) and conveys state by color only, no text alternative -> `rounded-full`, add `<span className="sr-only">New changelog entries</span>`; same bespoke dot in settings.tsx:969.
- app-shell.tsx:139-173 - [P1] tab links: `title={label}` only; when inactive, label is `max-w-0 opacity-0` so visible label is gone but still in a11y tree (hidden by width, not display) -> fine for SR; but icons lack `aria-hidden`. Add `aria-hidden` to `<Icon>` (also :109). Active-state `aria-current="page"` is provided by NavLink for isActive but the Training forced-active case (`forceActive`) passes no `aria-current` -> set `aria-current={(forceActive??isActive)?"page":undefined}`.
- app-shell.tsx:163 - [P1] `transition-all` on label (animates max-width = layout, not compositor) -> `transition-[max-width,opacity]`; layout shift per tab tap. Prefer fixed-width tabs with label always shown (5xl phones) or animate with transform only. No reduced-motion variant besides the global rule (OK).
- app-shell.tsx:146 - [P1] tab target `h-11 px-3` inactive width = 22px icon + 24px = 46px ✓ (≥40). OK.
- app-shell.tsx:42-56 - [P3] `useMemo` over a 4-item map with `undefined as boolean | undefined` cast; simplify: compute `trainTo`/`trainActive` once and spread. Not memo-worthy.
- app-shell.tsx:18-22,178 - [P3] `Suspense fallback={null}` for palette fine; palette chunk only prefetches "after mount" per comment but nothing triggers prefetch (React.lazy loads only on first render, which happens immediately here since `<CommandPalette/>` renders always) ✓.

## components/command-palette.tsx
- command-palette.tsx:136 - [P1] `focus:outline-none` on `Command.Input` with no replacement; the field is boxless, no visible focus indicator -> acceptable only because it is the sole focus target; add a caret/underline `focus-visible:bg-hover` or keep and document. (Flag per rule: outline-none without replacement.)
- command-palette.tsx:127-133 - [P1] mobile: dialog is `top-[18%] w-full max-w-lg` with no `mx-4`/inset: on a 360px phone content touches both edges, rounded corners clipped by viewport -> `w-[calc(100%-2rem)]`; no `overscroll-contain` on list; items `h-8` (32px) on touch -> `h-10 md:h-8`.
- command-palette.tsx:131-132 - [P1] hand-rolled overlay/content duplicates `DialogContent` chrome (scrim, `float-in`, shadow, z-50) instead of shared Dialog; acceptable because cmdk needs `Command.Dialog`, but z-index (50) collides with the dialog overlay (also 50) and Select content is 60 -> define z scale tokens.
- command-palette.tsx:142-153 - [P2] identical long group-heading class copy-pasted twice (and again eyebrow style) -> hoist `const GROUP = "…"` or a `@utility`.
- command-palette.tsx:55-108 - [P2] 12 nav items each repeat `action: () => navigate(path)`; build from `{label, icon, to, keywords}` and derive action. Nav list duplicates app-shell NAV (labels/icons) -> share a `NAV_ITEMS` constant. `nav`/`actions` rebuilt every render (cheap).
- command-palette.tsx:69,75,81 - [P1] `shortcut: "L" | "H" | "F"` keycaps promise bare-key shortcuts removed 2026-08-07 (AGENTS.md "bare single-key shortcuts were removed") -> delete the three `shortcut` fields and the `shortcut` prop/kbd render (:30,179).
- command-palette.tsx:113 - [P3] label "Switch to light/dark theme" vs shell "Toggle theme" vs settings "Day/Night" -> use "Switch to day mode"/"night mode" everywhere; also ignores the Device mode.
- command-palette.tsx:130 - [P2] `label="Command palette"` fine. No `DialogTitle`/description: cmdk handles. `Command.Empty` "No results." -> "No matching commands." (specific) and `role="status"` is provided by cmdk.
- command-palette.tsx:40-45 - [P3] key handler: `e.key === "k"` fails with CapsLock (`"K"`) -> `e.key.toLowerCase()`.
- command-palette.tsx:12 - [P3] `type Play` import used only as `typeof Play` type for icon; use Phosphor's `Icon` type.
- command-palette.tsx: [P2] palette lacks Settings-adjacent commands: Stats, Programs, Trainer, Monthly report; routes exist in app.tsx but missing here (stats, programs, trainer, stats/monthly, stats/year) -> add.

## components/error-boundary.tsx
- error-boundary.tsx:50-57 - [P2] copy: "The frog dropped it." plays the frog voice in an error floor (fine per split rule) but ignores the voice register setting (no `useVoice`; class component, okay). Error message contains no next step beyond Reload and nothing for persistent failure (e.g. "if it keeps happening, sign out and back in / export your data").
- error-boundary.tsx:58-65 - [P1] reload button `px-4 py-2 text-sm` ≈ 38px tall, below 40px -> `h-10`; no `focus-visible` (global :focus-visible outline covers) ✓; hover only, add `active:`; uses `duration-100`.
- error-boundary.tsx:33-35 - [P3] `console.error` only; no structured diagnostic (AGENTS: log stable code/op). Add `data-error-code` attr or store last error in sessionStorage for support.
- error-boundary.tsx:50 - [P3] `text-xs text-faint` body text 13px at secondary color on day-1: fine. Heading is a `<p>`, not `<h1>` -> use `<h1>`.
- error-boundary.tsx: [P2] no "Go home" alternative; a reload on a crashing route reproduces the crash -> add secondary link `<a href="/">Back to Home</a>` (full reload, resets router).

## components/frog-mark.tsx
- frog-mark.tsx:9-15,39,47,52 - [P1] **hardcoded fills** `#131426` (outline), `#6ab347` (body), `#ffffff` (glints): off-system hex, ignores theme: navy outline on `bg-sidebar` in night mode (#13100e) has contrast ≈1.1:1 -> the mark is near-invisible at night; and `#6ab347` is old Radix-grass/"sage" green not the Fern ramp. Comment (:4-16) documents this as a 2026-08-07 decision, but it contradicts "theme tokens only" and the Fern re-skin. Verify against `check-mark-drift.ts`; fix: outline `var(--color-text-primary)`, body `var(--color-accent-mark)`, glints `var(--color-bg-page)` (and update icon.svg + drift check to the same palette), or keep fixed colors but place the mark on a tonal chip in night mode.
- frog-mark.tsx:4,15 - [P3] stale comment cites `docs/brand/archive/...` and "Radix grass", "--ink", "--accent" = old identity.
- frog-mark.tsx:31-37 - [P2] `aria-hidden` ✓, but no `width/height` attrs and only `className` sets size; callers pass `size-5`/`size-8` (viewBox 1896×1187 landscape, so `size-5` square box letterboxes) ✓ via `preserveAspectRatio` default.

## components/home-hero.tsx
- home-hero.tsx:134-144,164-174,270-284 - [P1] three hand-rolled CTA `<button>`s share `CTA_CLASS` (h-14) instead of `Button` (+ a `xl` size): bespoke chrome, third copy of `bg-accent text-accent-fg hover:bg-accent-hover` (`accent-fg` and `on-accent` are duplicate aliases) -> add `size="xl"` (`h-14 w-full text-base`) to `ui/button.tsx` and use `<Button variant="accent" size="xl">`.
- home-hero.tsx:35 - [P1] `disabled:opacity-60` on CTA (no `disabled:bg-hover disabled:text-disabled` like `Button`) -> inconsistent disabled look; fixed by using Button.
- home-hero.tsx:143,173,280 - [P2] Phosphor `<Play>`/`<Plus>` lack `aria-hidden` -> add (or have `Button` set `[&_svg]:aria-hidden`… simpler: add per icon).
- home-hero.tsx:112-121 - [P1] `startSelected` has `try/finally` but **no catch**: a failed `repo.startRoutineSession` becomes an unhandled promise rejection (`void startSelected()`), button silently re-enables, user sees nothing. The sibling `useStartSession` exposes `error`; this path doesn't -> catch, set error state, render via `userFacingRepoError` (lib/repo-error.ts) in the existing `{error && …}` slot. Also duplicates `useStartSession` logic.
- home-hero.tsx:81-85,100-103 - [P1] **failed query renders as empty**: `routines = []` default => if `useRoutines()` errors/loading, `routines.length === 0` branch (:151) shows "Nothing pre-built yet / Build a routine" (a false empty state, also during first load flash). Same for `useActiveSession` (active undefined while loading -> shows plan, then flips to "Resume" = layout jump/risk of starting a 2nd session). -> destructure `isPending/isError`; show hero skeleton while pending and an error card with retry on `isError`.
- home-hero.tsx:234-240 - [P3] skeleton rows use `aria-hidden` (boolean attr, ok) and `bg-translucent`; fine. But `detail === undefined` also true when the detail query *errors* -> infinite skeleton; handle `isError`.
- home-hero.tsx:60 - [P3] class order `overflow-hidden rounded-md mt-4` messy; `Shell` name collides conceptually with AppShell -> rename `HeroCard`.
- home-hero.tsx:67-69 - [P3] `todayFmt.format(Date.now())` captured at render; stays stale past midnight; fine.
- home-hero.tsx:288-290 - [P3] "Or run" eyebrow label (uppercase) copy odd -> "Other routines".
- home-hero.tsx:292-322 - [P1] horizontal strip: `overflow-x-auto` with no scroll affordance, keyboard users can tab (buttons) ✓; routine chip `p-2` two lines ≈ 44px ✓; no `role=group`+label. `ref` callback `scrollSelectedIntoView` invoked on every render for selected (ref function identity stable ✓ module-level) fine but `inline:"center"` may scroll the horizontally-scrolling PAGE on desktop? uses nearest block only ✓.
- home-hero.tsx:297-312 - [P2] selection chip is a bespoke toggle (fourth copy of "pill toggle"; see library audit ToggleChip) -> shared component.
- home-hero.tsx:323-329 - [P2] `rounded-sm` placed before `flex` (class-order nit); "New routine" link is a bespoke 36px-tall chip -> same shared chip.
- home-hero.tsx:342-347 - [P1] "All routines" link `px-1 text-2xs` ≈ 16px tall, bare text link with only hover colour (no resting background) -> use `Button`-styled link (`buttonClass` helper) or `rowClass`; ≥40px target.
- home-hero.tsx:128-132 - [P3] `active.title ?? "Workout"` and `started {formatTime}` lowercase sentence; `text-2xs` (12px) at faint for key info.
- home-hero.tsx:259 - [P3] `{reps != null ? ` × ${reps}` : " sets"}`: "3 sets" vs "3 × 8" inconsistent; use `×` with `&nbsp;`; "sets" vs "set" pluralisation `{setCount} sets` (:223) -> singular for 1.
- home-hero.tsx:220 - [P3] manual pluralisation ×3 (here, history-detail.tsx:477, library) -> `plural(n,"exercise")` helper.

## components/import-card.tsx
- import-card.tsx:73-76,89-91,162-164,177-179 - [P1] raw `e.message` printed to user (4×) — AGENTS says `import-card.tsx` still prints raw; route through `userFacingRepoError` (`lib/repo-error.ts`).
- import-card.tsx:100-106,209-217 - [P1] native `<input type="file">` with `file:` utility styling: 3 copies; no `<label>`/`aria-label` (the `<p>` above isn't associated), `file:py-1` ≈ 24px target, input text 12px -> shared `FilePicker` (visually hidden input + `<label>` styled as `Button`), `aria-describedby` to status.
- import-card.tsx:119-143,230-254 - [P1] status `<p>` has no `role="status"`/`aria-live="polite"`; errors need `role="alert"`; also `<span>` inside `<p className="num">` fine. Progress states ("Importing…") for large CSVs with no progress; fine.
- import-card.tsx:107-117 - [P2] after `done`, the file input retains the file and "Import" button vanishes; to re-import another file input `onChange` doesn't fire for same file (value never reset) -> reset `e.target.value = ""` after read.
- import-card.tsx:96,204 - [P3] `mt-3 pt-3` (leftover from removed border-t divider): `pt-3` with no line = invisible spacing; delete `pt-3`.
- import-card.tsx:34-146 vs 155-181 - [P2] CSV importer and sleep importer duplicate the parse→status→apply state machine (CsvState/SleepState near identical) -> one generic `useFileImport<T>`; `WorkoutCsvImport` and the sleep block copy `<input>` + `<Button>` + status `<p>`.
- import-card.tsx:152 - [P3] `sleepFiles` ref created, assigned, never read -> remove.
- import-card.tsx:185-189 - [P3] `h2` "Import" is `text-sm font-medium` identical to settings `Section` heading (settings.tsx:74): `ImportCard` should render via `Section` (it is a hand-copy of it at :184 `mt-4 rounded-md bg-surface p-4`). Export `Section` from a shared file.
- import-card.tsx:205 - [P3] label "Fitbit sleep — Google Takeout (sleep-*.json)" lacks hint line like siblings.
- import-card.tsx:125,132 - [P3] 'sessions' count strings: "Import 1 sessions" -> pluralise (:115). Numbers in `t()` copy can't use `&nbsp;`.
- import-card.tsx:96 - [P3] `Import`/`Hevy` flows lack a destructive/irreversible confirm; import is idempotent so fine.

## components/ui/back-button.tsx
- back-button.tsx:26,32 - [P1] icon missing `aria-hidden`; `iconButtonClass({ className })` OK. Link has `aria-label` ✓.
- back-button.tsx:27-38 - [P2] duplicates `IconLink` (`icon-button.tsx:71`) — the file builds a `<Link>` with `iconButtonClass` itself instead of `<IconLink as={Link}>`; `IconLink` is otherwise used only by library.tsx -> use `IconLink as={Link}`.

## components/ui/badge.tsx
- badge.tsx:9 - [P2] `warn` tone is `bg-secondary text-ink`, i.e. identical to neutral (secondary ≈ hover) -> warn is not visually distinct; status via words OK per comment, but tone should differ or drop it.
- badge.tsx:22 - [P3] `h-5` (20px) pill with `rounded-xs` fine; only used by findings.tsx.

## components/ui/button.tsx
- button.tsx:23-28 - [P1] sizes: `sm`/`md`/`icon` are 32px — below the ≥40px logging-path/touch rule; Button is used app-wide for primary mobile actions (history-detail toolbar, settings Revoke, import). `lg` = 40px. Mobile-first violated at the component level -> make base `h-10 md:h-8` for `sm`/`md`/`icon` (matches `IconButton`'s `size-10 md:size-8`), keep `lg` = 40px both. Many call sites hard-pick `size="sm"`.
- button.tsx:46 - [P2] no `focus-visible` style of its own (relies on global `:focus-visible` outline ✓ fine); no `active:` state; add `active:bg-active` for touch feedback since hover is sticky on touch.
- button.tsx:46 - [P2] no `loading` support; callers swap label text (`Starting…`) ad hoc and leave button width jumping -> optional `loading` prop with spinner + `aria-busy`.
- button.tsx:13-17 - [P3] `outline` variant name no longer outlines (comment admits it) -> rename `secondary` (touches ~all call sites; leave but flag). `ghost` = `bg-secondary/60` (translucency over sand) — contrast of `text-on-secondary` fine.
- button.tsx:17 - [P3] `hover:bg-danger-soft/70` makes hover LESS prominent (lighter) than rest, contradicting "hover increases contrast" -> `hover:bg-danger-soft` + darker via `color-mix` or add `--color-danger-soft-hover`.
- button.tsx:46 - [P3] `transition-colors duration-150` doesn't use `--ease`; fine.
- button.tsx: [P2] no exported `buttonClass()` helper (compare `iconButtonClass`/`rowClass`) so `<Link>` buttons are hand-copied: settings.tsx:945,976; home.tsx:91; home-hero.tsx:323,342; profile.tsx:105. -> export `buttonClass({variant,size})` and use for links.

## components/ui/card.tsx
- card.tsx:1-103 - [P1] **mostly dead**: only `Card` is imported (stats.tsx:33); `CardHeader/Title/Description/Action/Content/Footer` unused. And `Card` itself is not used by the dozens of hand-written `rounded-md bg-surface p-4` blocks (home.tsx:56,71,103; settings.tsx:74; profile.tsx:121,136,200,284; import-card.tsx:184; history-detail.tsx:471; tips/changelog) -> adopt `Card` (or a slimmer `Surface`) there, delete unused sub-components.
- card.tsx:15 - [P2] shadcn-isms: `bg-card`, `text-muted-foreground`, `*:[img:first-child]:rounded-t-md`, `[.border-b]:pb-…` (a border utility the design forbids) -> strip; `CardFooter` `bg-muted/50` fine. `CardTitle` is a `<div>` not a heading.
- card.tsx:28 - [P3] `[.border-b]:pb-(--card-spacing)` references a border modifier: violates "no lines".

## components/ui/chart.tsx
- chart.tsx:8,97-98 - [P1] `THEMES = { light: "", dark: ".dark" }` — the app has NO `.dark` class (dark = `[data-mode="night"]`); `ChartStyle` emits `.dark [data-chart=…]` rules that never match -> any `ChartConfig.theme` per-mode colors silently never apply in night. Today callers use `color: "var(--chart-1)"` (profile.tsx:54) so it works, but the dead branch is a trap -> change to `dark: '[data-mode="night"]'` or delete `theme` support.
- chart.tsx:66 - [P1] class string contains hardcoded `[stroke='#ccc']`, `[stroke='#fff']` attribute selectors (recharts defaults being overridden; selector literals, not colors) — acceptable; but `stroke-border/50` uses `--color-border` = `border-field` (the form-field line colour) for grid lines -> grid lines are "lines" in the no-lines system; use `stroke-muted` or remove grid. Check stats screens.
- chart.tsx:199 - [P2] tooltip `bg-background … shadow-lg` should be `floating`/`bg-raised` (shadcn alias works; `rounded-md` ✓).
- chart.tsx:231,239 - [P3] `"--color-bg": indicatorColor` sets custom property `--color-bg` on the indicator, which **shadows the theme token `--color-bg`** (page background) within that div; works but confusing -> rename to `--swatch`.
- chart.tsx:262-264 - [P2] `toLocaleString()` default without locale/Intl options and `font-medium text-foreground tabular-nums` (also `num`) fine; hardcoded format -> `Intl.NumberFormat` shared formatter.
- chart.tsx:321-326 - [P3] legend swatch uses inline `style backgroundColor` (item.color) - fine (runtime value).
- chart.tsx:278-334 - [P3] `ChartLegend`/`ChartLegendContent` used by stats/monthly-report ✓. `ChartStyle` exported but only used internally -> drop from export.
- chart.tsx: [P1] charts have no text alternative by default; `ChartContainer` doesn't set `role="img"`/aria-label (callers must, profile.tsx does :144-145). No `prefers-reduced-motion` handling for recharts animations (no `isAnimationActive={false}` anywhere in repo; the CSS reduced-motion rule doesn't stop JS/SVG-attr animation) -> in `ChartContainer` pass context `reducedMotion` and set `isAnimationActive={!reduced}` on bars/lines, or wrap in `<MotionConfig>`-like hook.

## components/ui/dialog.tsx
- dialog.tsx:74-76 - [P0] close button: icon-only, **no `aria-label`**, `p-0.5` (~20px target), `rounded-xs`, no resting background (bare), `hover` only -> `<DialogPrimitive.Close asChild><IconButton aria-label="Close"><X aria-hidden className="size-4"/></IconButton></DialogPrimitive.Close>`.
- dialog.tsx:54-55 - [P1] no `DialogPrimitive.Description` → Radix warns "Missing Description or aria-describedby" in console for every dialog; add optional `description` prop or `aria-describedby={undefined}`. Overlay has no fade animation/`overscroll-contain`.
- dialog.tsx:59-65 - [P1] mobile sheet/desktop modal: `max-md:inset-x-0 max-md:bottom-0` with `float-in` uses `transform` animation but desktop centering uses `md:-translate-x-1/2 md:-translate-y-1/2` classes: `float-in` keyframes set `transform: translateY(2px) scale(0.99)` -> `translateY(0) scale(1)` which **overrides the centering translate during the animation** (jump on open), and after the animation ends `animation` without `fill-mode` reverts to class transform: visible 1-frame jump on md+. -> animate via `opacity` only on md, or center with `inset-0 m-auto h-fit`/grid wrapper.
- dialog.tsx:43-47 - [P1] imperatively writes `contentRef.current.style.transform = translateY(-Npx)` on mobile, clobbering the `float-in`/class transform (and violating "flex/grid over JS measurement"); layout reads `window.innerWidth/innerHeight` in a resize handler (OK, not render). `window.innerWidth < 768` duplicates the `md` breakpoint magic number; use `matchMedia("(min-width: 768px)")`. Prefer `interactive-widget=resizes-content` in the viewport meta (index.html:5) which makes the layout viewport shrink and removes this JS entirely on Chromium; iOS Safari still needs it.
- dialog.tsx:33 - [P2] `behavior:"smooth"` ignores reduced-motion.
- dialog.tsx:70-77 - [P2] title `text-sm font-medium` as the only title style; header `py-2` + close 20px => cramped. Sheet has no drag handle/swipe; fine.
- dialog.tsx:84 - [P2] `min-h-0 flex-1 overflow-y-auto` lacks `overscroll-contain`.
- dialog.tsx:10-15 - [P3] `title` prop required, always `ReactNode` rendered inside a Radix `Title`; no way to hide visually -> `titleHidden` option; `DialogTitle` as `h2` default ✓.
- dialog.tsx:6-8 - [P3] `DialogClose` export unused? (grep) keep.

## components/ui/dots.tsx
- dots.tsx:1-28 - [P1] **dead component**: `Dots` is not imported anywhere (`rg -w Dots` outside the file → 0). Also violates rules (transparent resting bg, `md:size-6`=24px, no `aria-label`) -> delete file.

## components/ui/field.tsx
- field.tsx:17 - [P1] `focus:outline-none` + `focus:bg-transparent`; focus indicated only by text colour change to `accent-ink` — colour-only focus cue, fails contrast-of-focus; the base `:focus-visible` outline is removed by `focus:outline-none`. Used in the routine editor logging path (routine-edit.tsx) -> replace with `focus-visible:bg-accent-soft` (tone step, no line) and drop `focus:outline-none` or keep a 2px inset ring via `focus-visible:shadow-[inset_0_0_0_2px_var(--color-border-focus)]`.
- field.tsx:13-22 - [P2] `Field` (type=text default) lacks `inputMode`/`autoComplete="off"`/`spellCheck={false}`/`aria-label` requirement; numeric rows rely on callers. Add `autoComplete="off"` default.
- field.tsx:17 - [P3] `num` + `text-sm` then forced to 16px on coarse (theme.css:343) fine.

## components/ui/icon-button.tsx
- icon-button.tsx:17-18 - [P3] doc comment says "a single border + surface-fill" — **no border** is applied; stale (old identity). Fix comment.
- icon-button.tsx:28 - [P2] `transition-colors duration-100` vs 150 elsewhere; `bg-surface-2` = `bg-subtle` and on `bg-surface` rows (day #f7f1e8 on #fffefb) contrast of fill vs card ≈ 1.07:1 -> the "visible resting background" is barely visible in day mode (just tone steps). Consider `bg-hover` for resting. Cross-cutting with Button `ghost`.
- icon-button.tsx:30 - [P3] `danger` only recolors on hover (`hover:text-neg`): at rest a danger button looks identical to neutral -> `text-neg` at rest.
- icon-button.tsx: [P1] `IconButton` does not require `aria-label` (type allows none) -> enforce via type: `"aria-label": string` required (or `title`→ not sufficient). Many callers pass only `title` (profile.tsx:344, settings warmup remove, etc.).
- icon-button.tsx:36-82 - [P3] `IconLink` default generic `as?: T` with `as ?? "a"`; fine.

## components/ui/input.tsx
- input.tsx:11 - [P1] `h-8` (32px) default input on mobile, below the 40px target (profile.tsx:300 overrides to `h-9`=36px; settings name input default) -> `h-10 md:h-8`.
- input.tsx:11 - [P2] `outline-none focus-visible:border-focus`: border colour change only (`border-focus` #251d1a vs `border-field` #8a8276 in day; night #99c195 vs #867f79) — 1px colour-only focus cue, weak (<3:1 change in night?). Compute: night 99c195 vs 867f79 ≈ 1.9:1 -> fails 3:1 non-text contrast for focus change. Keep the global 2px outline (remove `outline-none`) or add `focus-visible:ring`. Same in select.tsx:22.
- input.tsx:7-16 - [P2] no `Textarea` sibling; three call sites hand-roll textarea chrome (profile.tsx:319-332 `border border-field bg-surface px-2 py-2` with NO radius → square corners, off 8px scale; library.tsx, exercise-editor.tsx, machines.tsx per library audit) -> add `Textarea` here.
- input.tsx: [P3] no `autoComplete`/`name` defaults; callers (settings token name, routine name) don't set `name`/`autoComplete="off"`/`spellCheck={false}`.

## components/ui/row.tsx
- row.tsx:20 - [P2] `h-11` (44px) touch / `md:h-8`; rows with long content cannot grow (fixed height) -> text truncation relies on callers' `min-w-0`/`truncate`; the `justify-between` first child needs `min-w-0` (history.tsx:46 has it; settings TokenRow span (:902) does NOT → long token names overflow/push the date). Use `min-h-11 py-…`.
- row.tsx:21-22 - [P3] hover only; no `active:` for touch; `focus-visible` from global.
- row.tsx:27-33 - [P3] `Row` named same as settings.tsx's local `Row` (aliased `ListRow` there to avoid clash) -> rename the settings one `SettingRow`.

## components/ui/select.tsx
- select.tsx:9-94 - [P2] pseudo-namespace object literal of inline function components (`Select.Trigger({…})`) — components defined as object methods get anonymous names in React DevTools and Fast Refresh; also `Group/Separator/Label` unused anywhere (`rg Select.(Label|Group|Separator)` → 0) -> convert to named exports; drop unused.
- select.tsx:22 - [P1] trigger `h-8` (32px) on mobile -> `h-10 md:h-8`; `outline-none` + border-colour-only focus (see input.tsx). `Select.Trigger` renders no `aria-label` requirement; settings `SelectField` passes none -> unlabeled combobox (settings.tsx:170 Body diagram select has visible `Row` label `<p>` but not associated: add `aria-label`).
- select.tsx:31 - [P3] `CaretDown` via `size={16}` prop vs `className="size-4"` elsewhere.
- select.tsx:48 - [P2] `z-[60]` arbitrary; `min-w-[var(--radix-select-trigger-width)]` could be `min-w-(--radix-select-trigger-width)` (TW4 syntax). `float-in` + transform collides with Radix popper positioning (popper sets its own `transform` on wrapper, content animation is inside → OK).
- select.tsx:68 - [P2] item `min-h-9` (36px) on touch -> `min-h-10`; `focus:bg-hover` vs selected `bg-accent-selected`; highlighted+checked indistinguishable? ok.
- select.tsx:1 - [P3] `Check size={14}` mixed API.

## components/ui/set-type-cell.tsx
- set-type-cell.tsx:36-116 - [P1] `SetTypeCell` is **dead** (no importer of the component; session.tsx moved to Spotlight; only `markerColorClass` is imported by routine-set-type-cell.tsx:4). 117-line file whose comment (:30-35) describes a mid-rewrite branch state that has landed -> move `markerColorClass` into `components/routine/routine-set-type-cell.tsx` (or `lib/`), delete this file, and re-verify session.tsx doesn't need it.
- set-type-cell.tsx:57-72 - [P1] (if kept) marker `<button>` is ~16px tall, `title` only, no `aria-label`; menu items `py-1.5`≈28px; backdrop button `fixed inset-0` with `tabIndex={-1}` and aria-label; menu has no `role=menu`/escape key handling. All moot if deleted.
- set-type-cell.tsx:17,21,23 - [P2] `markerColorClass`: `warmup→text-warn` (== ink, see theme), `failure→text-neg`, `drop→accent`; "drop/failure" being removed from product (AGENTS) -> prune.

## components/ui/status-ring.tsx
- status-ring.tsx:31,34,66,67,75 - [P3] uses `var(--color-…)` inside SVG attributes (works) ✓ tokens only. `role="presentation"` + `aria-hidden` redundant; `size=14` fixed px (no `className` size override) so can't scale; `partial` state hardcodes `progress={0.5}` at callers (history.tsx:49, profile.tsx:231) meaning "in-progress" displayed as half-pie for any unfinished session — semantic nit: add `state="active"`.
- status-ring.tsx: [P3] `done` ring uses 14px glyph inside rows with no accompanying text for status (colour/shape only) -> add `sr-only` text "Completed"/"In progress" at call sites (history.tsx:47, profile.tsx:229).

## components/ui/switch.tsx
- switch.tsx:13 - [P1] `Switch` is only used by `conditions.tsx`; settings.tsx re-implements toggles as a 2-button `Segmented` Off/On (settings.tsx:135-155) → two different on/off controls in one product. No `focus-visible` styling beyond global; `rounded-full` ✓ (pill exempt); `h-6 w-10` track 24px tall target on touch < 40px -> wrap with 40px hit area (`before:absolute before:-inset-2`) or `h-8 w-14`. Thumb translate-x-4 with `transition-transform` ✓; no `aria-label` requirement.
- switch.tsx:9 - [P3] `bg-hover` off-track on `bg-surface` is low contrast (≈1.2:1) — the off state of a toggle must be perceivable (non-text 3:1) -> `bg-border`-ish tone (`bg-neutral-day-7`) or icon.

## components/ui/toolbar.tsx
- toolbar.tsx:15 - [P3] history-detail overrides `gap-1.5` with `gap-2` and `shrink flex-wrap`: shared component bypassed (history-detail.tsx:331) -> add `wrap` prop.

## src/screens/auth.tsx
- auth.tsx:19 - [P1] sign-in screen: states: loading (Clerk `SignIn` mounting; no skeleton → card pops in; `<SignIn>` renders nothing until `isLoaded`, leaving mark+heading alone), error (Clerk-internal), signed-in redirect ✓. No loading placeholder -> wrap with a fixed-height min area or `ClerkLoading` skeleton.
- auth.tsx:19 - [P2] page-level wrapper `min-h-dvh` without `pt-[env(safe-area-inset-top)]`.
- auth.tsx:25 - [P3] `h1` "Sign in to Frog" vs the Clerk card could be sign-up (`SignIn` handles both). No brand `translate="no"` on APP_NAME.
- auth.tsx:43-54 - [P2] Clerk `variables` use `var(--color-…)` strings: Clerk computes derived shades via `color-mix`/hsl parse; CSS-var inputs are supported in Clerk v5+ (the comment claims it). OK; but `colorPrimary: action-primary-bg` = ink (day) means primary button black — consistent with `Button primary`.
- auth.tsx:63,73 - [P3] `border: "0"`, `borderRadius: "var(--r-sm)"` ✓ scale. `shadow-2` on cardBox: only shadow on a page of tones; fine.
- auth.tsx:94-103 - [P3] E2E screen: `text-soft` text, fine (never ships; gated).
- auth.tsx: [P2] no `<main>` landmark, no `document.title`.
- auth.tsx:105 - [P3] module-level `export default e2eBridge ? … : …` fine.

## src/screens/home.tsx
- home.tsx:17-19,23-33 - [P1] **failed query ≈ empty**: `sessions = []` default, `recordsData` undefined -> `sevenDay = {}` renders an empty body figure (looks like "no training this week") when records failed or loading; `StreakCard starts={[]}` shows 0 streak. No `isLoading/isError` anywhere -> add skeleton + retry (cross-cutting).
- home.tsx:36 - [P3] `pb-20 md:pb-6` double clearance (see app-shell).
- home.tsx:37 - [P3] `<h1>Home</h1>` is visible page title then Hero; fine. 
- home.tsx:46-48,54-66 - [P1] whole-card `<Link>` wrappers: `block` Link containing `StreakCard`/figure; Link has no focus ring style of its own (global outline ✓) but card has no hover/active feedback (`transition-colors` with no colour change at :56) -> add `hover:bg-surface-hover active:bg-active`; heat map Link has no accessible name beyond "This week" (figure content `aria-hidden`?) -> `aria-label="This week's muscle map — open Statistics"`.
- home.tsx:59,78,104 - [P3] eyebrow class copy ×3 (repo-wide 14+).
- home.tsx:89-96 - [P1] "Custom" create-exercise chip `px-2 py-1 text-2xs` ≈ 24px target, mobile-hostile, bespoke link-chip, `rounded-sm` before `flex` -> `buttonClass({variant:"accent",size:"lg"})` Link; tap target ≥40.
- home.tsx:71-98 - [P2] the Exercises card nests two links in a flex row; the card as a whole isn't tappable (only the left text). Acceptable.
- home.tsx:102-114 - [P2] placeholder "Feed & graphs … Coming soon" card on Home: a non-functional promo occupying a top-level surface; AGENTS: label unfinished honestly. It is, but it is permanent clutter on the hottest screen. Recommend remove or fold into settings. (Product call; flag.)
- home.tsx:106 - [P3] "Feed &amp; graphs" ✓ (`&` over "and").
- home.tsx:108 - [P2] "Coming soon —" em dash in copy; ok.

## src/screens/history.tsx
- history.tsx:12-14,21-36 - [P0] **failed query renders as empty**: only `isLoading` handled; on error `data` is undefined → `sessions=[]` → shows "No sessions yet. The lab is empty" (falsely tells the user their history is gone). AGENTS.md "failed query must never render as empty" -> `isError` branch before empty with `text-neg` message via `userFacingRepoError` + Retry (`refetch`).
- history.tsx:22 - [P2] loading `<p>` has no `role="status"`; text-only, no skeleton; "Loading…" ✓ ellipsis.
- history.tsx:38 - [P2] `[&>*+*]:mt-0.5` row gap used as separator "line" (convention ok).
- history.tsx:47-53 - [P1] `StatusRing progress={0.5}` meaning-by-glyph only (see status-ring) → sr text.
- history.tsx:56 - [P3] `formatDate · formatTime` manual join; `Intl.DateTimeFormat` within lib/format presumably ✓. Date duplicated: title falls back to `formatDate(startedAt)` and then the same date shown again on the right (:52,57).
- history.tsx:59 - [P3] `CaretRight` no `aria-hidden`.
- history.tsx:68-78 - [P1] pagination via "Load more" button, no `aria-live` announce, `size="sm"` 32px; whole-table pages render un-virtualized (50+ rows eventually; each page flat-mapped) -> `content-visibility:auto` on `li` (`[content-visibility:auto] [contain-intrinsic-size:auto_44px]`) or virtualize; fetchNextPage error not surfaced (isFetchNextPageError) -> show inline error + retry.
- history.tsx: [P2] no search/filter/URL state; no date grouping; no delete-from-list; acceptable.
- history.tsx:17 - [P3] screen wrapper copy `mx-auto max-w-2xl px-4 py-6 pb-20 md:pb-6` appears in ~23 screens -> `<Screen>` wrapper component (see cross-cutting).

## src/screens/history-detail.tsx
- history-detail.tsx:229-231 - [P0] **no loading/error/not-found handling at all**: `session`/`blocks` from `useSession(id)`/`useSessionExercises(id)` with `blocks = []` default; an invalid id or failed fetch renders `<h1>Session</h1>` with empty page and disabled toolbar; deleted session id (soft-deleted → null) also renders blank. -> `isPending` skeleton, `isError` retry card, `session === null` → "Session not found" with BackButton.
- history-detail.tsx:235-242 - [P1] `deleteSession` has no try/catch: failure → unhandled rejection, dialog stays open with no feedback; button not disabled during request (double-submit). Also fires 4 `invalidateQueries` + navigate before confirm of success? (awaits repo first ✓). -> `deleting` state, disabled + "Deleting…", catch → inline error.
- history-detail.tsx:246-271 - [P1] `saveAsRoutine`: `createRoutine.mutate(input)` fire-and-forget then immediately `navigate("/routines")`; if the mutation fails the user has left the screen with no feedback (error lost). Use `mutateAsync` + await, show error in dialog, navigate on success. Also `Enter` key handler (:391) bypasses `disabled`.
- history-detail.tsx:275-305 - [P1] `copyWorkout` swallows errors (`catch { setCopying(false) }`) → silent failure; also creates N sequential `addExerciseToSession` awaits (slow; N round trips) and a partially-created session on failure (orphan active session left behind, which then hijacks the Training tab) -> surface error, consider a single repo call.
- history-detail.tsx:329-375 - [P1] toolbar of 4 labeled `size="sm"` buttons (32px) wraps on phone; "Share" is icon-only: `<Button size="sm">` with `title` only, **no `aria-label`** (:202-208) → P0 a11y for the share control. Destructive "Delete" sits adjacent to Copy/Share (misclick risk) -> move Delete into an overflow menu/dialog footer; make mobile targets 40px.
- history-detail.tsx:376-415 - [P2] Save-as-routine dialog: `Input` with `autoFocus` (mobile keyboard pops; dialog sheet moves); placeholder "Routine name" lacks `…`/example, no `aria-label`/`name`/`autoComplete="off"`; `Cancel` + `Create routine` `size="sm"` (32px).
- history-detail.tsx:416-442 - [P1] delete confirm ✓ exists (good) but copy says "Soft-deleted — nothing is destroyed" while button says "Delete session"; ok. Buttons 32px.
- history-detail.tsx:443-445 - [P2] `h1` falls back to "Session" with no title; add date. Title is not editable here.
- history-detail.tsx:446-458 - [P1] raw `<input type="datetime-local">` styled `bg-transparent focus:outline-none`: no resting affordance (looks like static text, no icon), `title` only, **no `aria-label`/`<label>`**, and `outline-none` without replacement; tiny (12px, forced 16px on coarse) -> labelled `Field`-style control with calendar icon, visible "Edit start time" and `focus-visible` ring. Invalid/empty value silently ignored (:452). Also controlled input `value={toLocalInput(session.startedAt)}` re-renders on each change mutate (optimistic?) — typing a partial datetime in Safari triggers mutate per field.
- history-detail.tsx:307-315 - [P2] `conditionLines` computed from `metrics` + raw `conditions[m.id]` joined as `${name}: ${value}` with no units/format; duplicates `sessionConditionsLine` (`lib/share/conditions`, used at :114 for the share card) -> use the same formatter (stale, drifts).
- history-detail.tsx:319-325 - [P3] stale comment "Share card for this workout…" separates from code it describes; `durationMs` only used for share.
- history-detail.tsx:467-518 - [P1] block rendering is a hand-built grid table of `div`s (`grid-cols-[2rem_1fr_1fr_2.5rem]`): no table semantics (should be `<table>`/`role=table` with `<th scope>`), header text `reps` lowercase vs unit label; effort column header blank `<span/>` (:486) → label "RIR". Missing weight on bodyweight/duration/distance exercises: only weight/reps grid, so time/distance exercise sets show "—" "—" and duration/distance data are **never displayed** (set.durationSec/distanceM exist; used in saveAsRoutine :263-264) → data hidden; render by `exerciseType`.
- history-detail.tsx:476-480 - [P3] set count computed twice per render + avgRestLabel twice -> hoist; manual plural; `&nbsp;`; "rest 1:30 avg" okay.
- history-detail.tsx:495 - [P2] `ᴸ`/`ᴿ` Unicode small caps for side — glyph coverage (Geologica subset lacks it) → fallback font + screen readers read garbage; use `<abbr title="Left">L</abbr>` styled via `text-2xs`, and use `formatPrevious`-style helper (AGENTS: unilateral rule) — ok since this is committed set display not PREVIOUS.
- history-detail.tsx:494 - [P3] `set.setNo + 1` on uneven sides ok. Warm-up/drop set types not displayed (set.setType never shown) → warm-up sets look like working sets in history; show W marker.
- history-detail.tsx:489 - [P2] no per-set note/RPE detail; fine.
- history-detail.tsx:508-515 - [P3] copy "No sets logged." ✓.
- history-detail.tsx:520-525 - [P3] `PostSaveSummary` gated by query param ✓ (deep-linkable); dismiss via `setSearchParams({}, {replace})` drops other params.
- history-detail.tsx:176-183 - [P1] share loading overlay is a full-screen `<button>` ("Building your card…") that closes on click: no `role="status"`, no spinner, no labelled cancel, covers app (z-50) w/o focus trap; hard-coded 5-query wait with no error branch — if any of the 5 queries fails, `isPending` is false but data defaults (`exercises=[]`, `bodyweightKg=null`) silently build a card with missing facts (the comment above says exactly this must not happen) → check `isError` too.
- history-detail.tsx:96-98 - [P3] `as ExerciseType` cast.
- history-detail.tsx:41 - [P3] imports `SeedSet` type from `./session` (a 2.4k-line screen) → type import is erased, but couples to the biggest module; move `SeedSet` to `@frog/core`/lib.
- history-detail.tsx:12 - [P3] `Copy` icon for "Copy workout" vs settings Copy; fine.

## src/screens/profile.tsx
- profile.tsx:61 - [P1] `sessions = []` default: profile shows "Workouts 0", empty chart, "No sessions yet — start one from Training" on fetch failure/loading (false empty). Also `useUserPrefs` loading → `displayName` flashes `authName` then switches. -> pending/error states.
- profile.tsx:102-109 - [P1] settings gear link: `size-9` (36px), `bg-translucent` (= bg-subtle) hand-rolled instead of `IconLink as={Link}` (shared chrome: AGENTS), `title` only, **no `aria-label`**, icon no `aria-hidden` → `<IconLink as={Link} to="/settings" aria-label="Settings"><GearSix aria-hidden/></IconLink>`.
- profile.tsx:99 - [P3] `pb-24 md:pb-6` differs from every other screen (`pb-20`); inconsistent.
- profile.tsx:120-133 - [P2] stat tile "Workouts" is a bespoke Card; `StreakCard` sibling; `flex-col justify-center` mismatch heights ok.
- profile.tsx:136-189 - [P1] chart: `role="img"` + `aria-label="Workouts per week"` ✓ but no data summary (no text alternative of values); recharts bar `LabelList fontSize={10}` (10px text, below the 12px min; theme text-2xs=12) -> 12; `fill="var(--color-text-secondary)"` token ✓; no `isAnimationActive={false}` for reduced motion; `ChartContainer` has `aspect-video` + `h-40` override ✓.
- profile.tsx:138 - [P3] "Activity — last 3 months" `h2` styled as eyebrow 12px uppercase tracking-widest; ok. `ACTIVITY_WEEKS=13` ✓. Comment says "unique category key" ✓.
- profile.tsx:76-78 - [P3] loop var `t` shadows the voice `t()` from `useVoice` in the same component scope (profile.tsx:58 vs :76) → rename `startedAt`.
- profile.tsx:167 - [P3] `new Date(payload?.[0]?.payload?.week)` untyped (implicit any via recharts payload) → typed `activity` lookup.
- profile.tsx:193-196 - [P2] DashButton tiles: 4 destinations; `soon`/`!to` branch (:375-404) is **dead** (no caller passes `soon` or omits `to`), including `cursor-not-allowed`/`aria-disabled` div -> delete branch + props. `icon: typeof Barbell` type → Phosphor `Icon`. Template-literal `className` instead of `cn`. `data-testid` derived from label.
- profile.tsx:205-210 - [P1] "View all" `text-2xs` bare link, no resting bg, ≈16px target -> shared link-button.
- profile.tsx:213-218 - [P3] empty copy `—` em dash + frog register ok.
- profile.tsx:223-243 - [P1] **duplicated** recent-session row markup identical to history.tsx:41-61 (StatusRing + title + date + CaretRight) → extract `SessionRow`. 
- profile.tsx:257-370 - [P1] ProfileHeader: inline edit with `autoFocus` (:293, mobile keyboard), `Input h-9` (36px), icon buttons ✓ `Button size="icon"` 32px with **no aria-label/title** for Save (:303) and Cancel (:311) → add `aria-label="Save profile"`/`"Cancel"`; `textarea` hand-rolled `border border-field bg-surface px-2 py-2` with no radius (square, off-scale), no `rounded-sm`, no focus style, no label, no `aria-label`; Enter-to-save on name input but bio textarea needs ⌘Enter (hint missing) → placeholder "Short bio — lifts, goals, noise" lacks `…`; add char counter near 160 max.
- profile.tsx:273-281 - [P1] `update.mutate(...)` fire-and-forget then `setEditing(false)`: failure silently reverts/no message; no `isPending`. Optimistic? (useUpdateUserPrefs may be). Show error toast/inline.
- profile.tsx:270-271 - [P2] `draft` state initialised from props once; when `displayName` changes (prefs loaded after mount) draft stale until "Edit" click (handled at click :346 ✓).
- profile.tsx:286 - [P3] avatar `rounded-sm` square 48px with initial; fine (brand 8px). `initial` of emoji/multibyte: `displayName[0]` splits surrogate pairs -> `[...displayName][0]`.
- profile.tsx:343-354 - [P1] edit `IconButton` has `title` only → add `aria-label`.
- profile.tsx:356 - [P3] email shown `text-2xs` (12px) PII ok; `truncate`.
- profile.tsx:43 - [P3] `WEEK_MS` etc fine.
- profile.tsx: [P2] missing: sign-out, delete account, avatar upload; N/A.

## src/screens/tips.tsx
- tips.tsx:16 - [P3] `as [LessonId, Lesson][]` cast.
- tips.tsx:26-32 - [P2] empty branch unreachable in practice (static LESSONS); fine. `text-center` empty state inside `mt-6 px-4 py-6`.
- tips.tsx:34 - [P3] class order `rounded-md mt-4 [&>*+*]:mt-0.5 overflow-hidden bg-surface` (5th copy of "grouped surface").
- tips.tsx:41 - [P2] hard-coded `entries.length < 5` "More tips are on the way" magic number promise; remove or derive.
- tips.tsx:52-57 - [P1] **side effect on render of every card**: each `LessonCard` marks its lesson seen on mount via effect (simply scrolling the list clears all unseen dots; even offscreen/unread). Deliberate per comment. Mark-seen for all N lessons on mount triggers N storage writes / re-renders (each `useLessonSeen` presumably localStorage + event) -> one `markAllSeen()` in the screen.
- tips.tsx:61 - [P3] `key={line}` duplicates if two identical lines.
- tips.tsx:62 - [P2] body paragraphs `text-xs` (13px) `text-ink-2`: long-form reading text at 13px; use `text-sm`.
- tips.tsx:22 - [P3] literal ⓘ glyph (Unicode circled i) in copy; icon in app is Phosphor `Info`; consistent naming ok but glyph font fallback.
- tips.tsx:20 - [P3] no back affordance (reached from Settings); page header lacks `BackButton` while history-detail has one; AppShell has no back → mobile users rely on tab bar. Add `BackButton to="/settings"` to tips/changelog/settings sub-screens.

## src/screens/changelog.tsx
- changelog.tsx:1 - [P3] `virtual:changelog-entries` ok. All entries (hundreds of DECISIONS lines) render at once un-virtualized, each parsed with regex split each render -> `useMemo`/`content-visibility:auto` + "show older" pagination. Chunk includes full DECISIONS.md text (known).
- changelog.tsx:18-41 - [P2] hand-rolled markdown (`**`, `~~`, backtick) renderer; any other markdown (links, lists, headings) shown literal. Decision log content with `[x](y)` shows raw. Acceptable dev log but `key` uses index+slice (non-unique risk) fine.
- changelog.tsx:34 - [P3] `<code className="rounded-sm bg-surface-2 px-1 text-2xs">`: global `code { font-family: inherit }` so inline code is not monospace → visually indistinguishable; fine by design.
- changelog.tsx:133 - [P2] `whitespace-pre-line` long unbroken tokens (paths, hashes) overflow: no `break-words` → add `break-words`.
- changelog.tsx:51-56 - [P1] unseen marking happens on mount (`markChangelogSeen(latest)`) - user who opens and bounces loses unseen state; matches "viewed" semantic. OK.
- changelog.tsx:69-71 - [P3] empty copy fine. No loading/error (static virtual module) ✓.
- changelog.tsx:76,90 - [P3] eyebrow `h2`s (14+ copies).
- changelog.tsx: [P2] same missing back button; also `max-w-2xl` ok.
- changelog.tsx:6-13 - [P3] `timeZone: "UTC"` ✓ intentional.

## src/screens/not-found.tsx
- not-found.tsx:14 - [P3] `t("HTTP 404 · specimens found: 0")` — single-arg `t` (second register missing → same text all registers); in Human register shows lab joke "specimens found: 0" (violates split rule? it's an edge page, allowed) but human register should be plain "Error 404".
- not-found.tsx:22 - [P3] "Achievement unlocked" fine (frog register).
- not-found.tsx:25-31 - [P1] `navigate("/")` on a button for navigation — should be `<Link to="/">` (cmd-click, middle click, semantics) per guideline; use `buttonClass` Link. `Button size="md"` 32px.
- not-found.tsx:12 - [P3] `pb-20 md:pb-16` odd.
- not-found.tsx: [P2] 404 inside `RequireAuth` + shell ✓; no `document.title`.

## src/screens/settings.tsx
- settings.tsx:1-986 - [P1] **986-line file with 12 inlined sections** and local re-implementations of shared chrome: `Section` (:64, duplicates ImportCard card, card.tsx), `Row` (:82, same name as ui/row, aliased), `Segmented` (:102, a copy of library/trainer/exercise-editor SegmentedButton — 4+ copies repo-wide), `Toggle` (:135 = 2-option Segmented instead of the `Switch` primitive), `SelectField`. -> hoist `Section`, `SettingRow`, `Segmented` (as Radix `ToggleGroup` per "library components first") to `components/ui/`; split sections into `screens/settings/*.tsx`.
- settings.tsx:102-133 - [P0] `Segmented` buttons: `py-1` (~28px tall), no `role=radiogroup`/`aria-pressed`/`aria-checked`, so selected state is conveyed by colour only (screen readers hear unlabeled buttons "Off","On"). 28px target on mobile where every setting lives -> use Radix ToggleGroup (`type="single"`) with `h-10 md:h-8`, `aria-label` per group (pass `Row label`).
- settings.tsx:135-155 - [P1] On/Off as two-button segmented forces two taps affordance and the label duplicates; "Off"/"On" ambiguous without association to `Row` label (no `aria-labelledby`). Use `Switch` with `aria-label={label}`.
- settings.tsx:184-216 - [P1] **no loading/error states anywhere**: prefs-backed controls (`useUserPrefs`) default silently (`previousScope ?? "any"`, `includeWarmups ?? true`, `bodyDiagram ?? "neutral"`) while prefs load or **fail** — a user can toggle a control that shows a default and then writes over real saved prefs. -> disable section while `isPending`; error banner on `isError`.
- settings.tsx:184-216 - [P2] no back button / not reachable from the desktop sidebar (only Profile gear); `h1` "Settings"; sections stacked 12 deep with no in-page nav.
- settings.tsx:208 - [P1] **Sign out is an immediate destructive-ish action** (`variant="danger"`, `void signOut()`) with no confirm; arguably sign-out is reversible; guideline says destructive actions confirm/undo. Flag P2 given reversible. Also no "Delete account / export before delete" path (outside scope).
- settings.tsx:314-320 - [P3] `(prefs?.previousValuesScope ?? "any") as "any" | "routine"` cast.
- settings.tsx:322-328 - [P1] `onWarmupsInStats`: `updatePrefs.mutate` then invalidates queries immediately with the *old* pref still on the server (race: invalidate fires before mutation lands, refetch gets old value, then pref changes later → panels stale as the comment says it prevents). -> invalidate in `onSuccess`/`mutate(…, {onSuccess})`.
- settings.tsx:395-496 - [P1] Warm-up method editor: number `Input type="number"` w/o `aria-label` (two unlabeled inputs per row; the "% ×" and "reps" spans aren't associated), remove step `Button size="icon"` (32px) has `title="Remove step"` only, no `aria-label`; `value={String(...)}` controlled with `Number(e.target.value)` → clearing the field yields 0 immediately (can't clear then type; `""` → `Number("")=0` → pct 0, input snaps to "0") → keep string draft state; no limit on step count; `persist` writes localStorage each keystroke; `inputMode="numeric"` ok. No empty-state when all steps removed (renders just "Add step", ok). "Reset to default" is a bare text button (`text-2xs text-soft underline-offset-2 hover:underline`) with NO resting background (:422-430) → violates no-bare-text-buttons; 16px target.
- settings.tsx:418 - [P3] `mt-2 pt-3` (leftover divider padding).
- settings.tsx:457,470 - [P3] "% ×" label glyph spacing; use `×` char ok.
- settings.tsx:509-528 - [P2] Display: "Body diagram" Select with a single option "Frog" (:526) — a dropdown with one choice; either remove the row or hide until a 2nd diagram exists.
- settings.tsx:536-655 - [P1] Notifications: `togglePush` error uses raw `e.message` (:580) → `userFacingRepoError`; error `<p>` lacks `role="alert"`; `sendTest` unhandled rejection (`void sendTest()` no catch; SW unavailable → `new Notification` may throw); "Enable" button `variant="primary"` disabled when denied (hint text explains ✓). Copy: `"Send test"` as only notification today — honest ✓. Push `Toggle` disabled state: when `!supported` or `!pushConfigured` the toggle is still interactive (no `disabled`) → clicking tries to subscribe and errors. Pass disabled.
- settings.tsx:590 - [P3] straight quotes in copy (`"Send test"`, :590, :602) → curly “Send test”.
- settings.tsx:662-703 - [P3] InstallSection ✓; `installed` branch. `promptInstall` unawaited errors.
- settings.tsx:716-743 - [P1] `exportData`: `try/finally` with **no catch** → export failure (network/ paging) is an unhandled rejection; button re-enables with no message → add error state. `download()` (:53-60) revokes the object URL synchronously after `click()` (can cancel download in Safari) → `setTimeout(() => revokeObjectURL(url), 0)` or after 1s; anchor not attached to DOM (Firefox old) fine. Large JSON `JSON.stringify(bundle, null, 2)` blocks main thread; ok.
- settings.tsx:753-781 - [P2] export buttons `size="sm"` (32px) with labels "JSON", "sets.csv", "measurements.csv" (file-name labels, not Title Case verbs) -> "Export JSON", "Export Sets (CSV)", "Export Measurements (CSV)". Three near-identical Buttons → map from array.
- settings.tsx:788-889 - [P1] API tokens: `useQuery` with `tokens = []` default → error/loading renders as "no tokens" (no state for failure; create/revoke errors never shown: `create.isError`/`revoke.isError` unused). Revoke is **immediate, no confirm** (destructive, irreversible: breaks integrations) (:914-921) → confirm dialog. Create form: `Input` placeholder "Token name (e.g. mcp)" lacks `…`, no `aria-label`/`name`/`autoComplete="off"`/`spellCheck={false}`; submit clears the name even when `create` fails (:824); `Create` disabled while pending but no spinner/"Creating…".
- settings.tsx:846 - [P3] `tokens.map((t) =>` shadows `t` voice function (also inside `useVoice` scope) → rename `tok`.
- settings.tsx:856-886 - [P1] token reveal dialog: copy `Button size="icon"` with `title="Copy"` only (no `aria-label`), **no copied feedback** (no state/aria-live), `navigator.clipboard.writeText` unhandled rejection (insecure context/permission), token shown `truncate` so the user can't see/select the full token if copy fails → allow wrap `break-all` + select-all; dialog dismissal permanently destroys token (acceptable, copy says so); no confirm on close without copying.
- settings.tsx:845 - [P3] `overflow-hidden rounded-sm` list vs rows; `ul` rows of `ListRow interactive={false}` fixed `h-11 md:h-8` with `justify-between` and no `min-w-0` on the name span (:902) → long token name overflows into date; `line-through` for revoked ✓ plus text "revoked" ✓ (uppercase via CSS).
- settings.tsx:906-909 - [P3] "created {date}" lowercase, `·` joiner, fine.
- settings.tsx:943-949,974-980 - [P1] two hand-rolled `<Link>` pseudo-buttons ("Browse") duplicating `Button outline sm` classes (32px) → shared `buttonClass`. ChangelogSection/LearnSection are each a whole `Section` for a single link row (could be one "About/Learn" section).
- settings.tsx:967-973 - [P1] unseen dot: square `size-1.5 bg-accent`, colour-only, no text.
- settings.tsx:198-199 - [P2] `ImportCard` / `ExportSection` / `ApiTokensSection` / `InstallSection` (8 of 12 sections) have inconsistent heading structure (`h2` via Section vs ImportCard's own h2) ✓ fine; no section anchors/`id` for deep-link (e.g. `/settings#api-tokens`; guideline: URL reflects state) → add ids + `scroll-mt`.
- settings.tsx:62 - [P3] `// ── Section ──` ASCII dividers fine.
- settings.tsx:45 - [P3] `voice` (non-hook) used in async handlers and `useVoice` elsewhere: two APIs for the same thing; ok.
- settings.tsx: [P2] long, unprioritised page: Units, Voice, Workouts, Display first; Account at bottom. Consider tabs/anchors.

## public/manifest.webmanifest
- manifest.webmanifest:7-8 - [P2] `background_color`/`theme_color` fixed `#fcf9f4` (day) → splash/status bar is light even for night users; unavoidable w/o media queries (manifest has none) but then index.html meta flips only after load. Consider `theme_color` night (`#191513`) since PWA splash flash white→dark is worse than dark→light? Judgement call; document.
- manifest.webmanifest:2-3 - [P3] `name`/`short_name` "Frog" matches APP_NAME ✓ (3-places rule). `description` uses `\u2014` fine.
- manifest.webmanifest:11-30 - [P2] icons: `icon.svg` with `purpose any` + PNG any + maskable ✓. Missing `id`, `orientation: "portrait"`, `categories`, `shortcuts` (e.g. "Start workout" → `/train`), `screenshots` (install UI richer). `lang`/`dir` missing.

## public/sw.js
- sw.js:11 - [P1] install precache `cache.addAll(["/", "/index.html"])` caches the HTML; navigation handler is network-first (:36) so cached copy only used offline ✓. But `skipWaiting()` + `clients.claim()` mid-session swaps the SW under open tabs while lazy chunk hashes change → combined with the stale-chunk reload logic OK.
- sw.js:46-57 - [P1] `/assets/` cache-first with **unbounded growth** (every deploy's hashed chunks accumulate in `frog-shell-v1` forever; cache only cleaned when CACHE name changes) → add eviction: on `activate`, delete cached `/assets/` entries not referenced by new index.html, or version CACHE by build hash. Failed fetch (`fetch(request)` rejection offline for uncached chunk) has no catch → unhandled; returns rejected promise → error page; fine but add `.catch(() => Response.error())`. Also caches non-OK responses (a 404 for a purged hash gets stored and served forever!) → only `put` if `res.ok` — this directly interacts with the stale-chunk 404 story in app.tsx (a cached 404 chunk would make reload not help).
- sw.js:33 - [P3] stale comment "never cache Supabase/API" (Convex now).
- sw.js:62-82 - [P2] push handler: payload fields unvalidated (`data.title` could be non-string), no `icon`/`badge` in `showNotification` (default browser icon) → add `icon: "/icon-192.png"`, `badge`; `notificationclick` ignores `data.url` (always focus first client or open "/") and `client.focus()` without `navigate`.
- sw.js:6 - [P3] no `navigationPreload` enabling; minor perf.
- sw.js: [P3] `self.skipWaiting()` outside `waitUntil` fine.

---

## States inventory

| Screen / component | Loading | Empty | Error (fetch failed) | Modal/sheet | Onboarding/first-run | Notes |
|---|---|---|---|---|---|---|
| App boot / route chunk (app.tsx) | ✗ blank (`fallback={null}`) | n/a | ✓ AppErrorBoundary + stale-chunk reload | n/a | n/a | auth `!isLoaded` also blank |
| AppShell | n/a | n/a | ✗ no per-route boundary | palette (cmdk) ✓ | n/a | unseen dot ✓ (colour only) |
| Command palette | n/a | ✓ "No results." | n/a | ✓ cmdk dialog | n/a | desktop-only trigger |
| Auth | ✗ Clerk pop-in | n/a | Clerk-internal | n/a | n/a | E2E variant ok |
| Home | ✗ none (hero flips) | ✓ hero "Nothing pre-built yet" (but also shown on error) | ✗ error ⇒ empty UI | n/a | ✓ via empty hero | heatmap/streak show zeros on error |
| Home hero | ✓ skeleton rows (detail only) | ✓ no routines | ✗ treated as empty; start failure unhandled | n/a | ✓ | active-session flash |
| History list | ✓ text "Loading…" | ✓ | ✗ **shows empty** | n/a | ✓ copy | load-more error unhandled |
| History detail | ✗ none | ✓ per-block "No sets" | ✗ none; invalid id blank | ✓ save-as-routine, delete confirm, share sheet (+loading overlay), post-save summary | n/a | actions swallow errors |
| Profile | ✗ none | ✓ no recent sessions | ✗ shows zeros/empty | n/a (inline edit) | n/a | edit save fire-and-forget |
| Settings | ✗ none | n/a | ✗ prefs failure ⇒ defaults; tokens failure ⇒ empty | ✓ token-reveal dialog | install hints ✓ | export/test-notification errors unhandled; revoke no confirm |
| Import card | ✓ "Importing…" | n/a | ✓ inline (raw message) | n/a | ✓ hints | no aria-live |
| Tips | n/a (static) | ✓ | n/a | n/a | n/a | marks all seen on mount |
| Changelog | n/a (static) | ✓ | n/a | n/a | "New since last visit" ✓ | un-virtualized |
| Not found | n/a | n/a | n/a | n/a | n/a | button-navigate |
| Error boundary card | n/a | n/a | ✓ stale vs generic | n/a | n/a | 38px button |
| Dialog (ui) | n/a | n/a | n/a | ✓ sheet/modal | n/a | no close label, no description |

## Cross-cutting (fix once in shared code)

1. **Failed query renders as empty (P0 policy)**: history.tsx, history-detail.tsx, home.tsx, home-hero.tsx, profile.tsx, settings.tsx (prefs, tokens) all default `data = []`/`undefined` and never read `isError`. Add a shared `QueryBoundary`/`<QueryState query={…} loading={…} empty={…}>` (loading skeleton, `role="alert"` error via `userFacingRepoError` + Retry `refetch`, empty) and a `useQueryErrorBanner`; wire these screens through it.
2. **Touch targets**: `Button` sm/md/icon (32px), `Input` (32px), `Select.Trigger` (32px), `Select.Item` (36px), `Switch` (24px), settings `Segmented` (~28px), command-palette items (32px), dialog close (20px), error-boundary reload (38px). Make the component defaults `h-10 md:h-8` (the `IconButton` pattern) once in `ui/button.tsx`, `ui/input.tsx`, `ui/select.tsx`, `ui/switch.tsx`.
3. **Icon-only controls missing accessible names** (P0): app-shell.tsx:67, dialog.tsx:74, history-detail.tsx:202, profile.tsx:102/303/311/343, settings.tsx:471/874, library (per its audit). Make `IconButton`/`Button size="icon*"` typed to require `aria-label`, and have `IconButton` clone children icon with `aria-hidden` (or set `[&>svg]:…` + `aria-hidden` via wrapper). Decorative Phosphor icons lack `aria-hidden` almost everywhere: set default in a tiny `Icon` wrapper or pass `aria-hidden` through `IconContext.Provider value={{ "aria-hidden": true }}` at app root (one-line fix for all Phosphor icons).
4. **Bare/bespoke Link-buttons**: home-hero.tsx:323,342, home.tsx:91, profile.tsx:105/207, settings.tsx:945/976, not-found.tsx. Export `buttonClass({variant,size})` from `ui/button.tsx` (like `iconButtonClass`) and use on `<Link>`s; replace `navigate()` buttons with Links.
5. **Eyebrow label** `text-2xs font-medium tracking-widest uppercase text-faint` copy-pasted 14+ times (also in other groups): add `@utility eyebrow` in theme.css or `<SectionLabel>`.
6. **Screen wrapper** `mx-auto max-w-2xl px-4 py-6 pb-20 md:pb-6` ×23 and the shell already pads for the tab bar → double bottom clearance. Add `<Screen>`/`<PageHeader title back actions>` (with BackButton + h1 + `document.title`) and delete the per-screen `pb-*`.
7. **Surface card** `rounded-md bg-surface p-4` hand-written ≥10× in this group alone while `ui/card.tsx` (shadcn, 6 unused sub-parts, `border-b` modifier) is used once. Slim `Card` to one `Surface` component; delete unused parts.
8. **Segmented/toggle chip** duplicated in settings.tsx:102, trainer.tsx, exercise-editor.tsx, library.tsx, home-hero chips: one `ToggleGroup` (Radix) in `ui/`.
9. **Textarea & file inputs**: add `ui/textarea.tsx` (profile.tsx:319 has no radius), `ui/file-input.tsx` (import-card ×3).
10. **Dead code to delete**: `ui/dots.tsx`; `ui/set-type-cell.tsx` (`SetTypeCell`; move `markerColorClass`); `Select.Group/Label/Separator`; Card sub-components; `DashButton` `soon` branch; app-shell NAV `key` + `<kbd>` render; command-palette `shortcut` keycaps (L/H/F, bindings removed 2026-08-07); import-card `sleepFiles` ref; chart `THEMES.dark` `.dark` selector (never matches).
11. **Fire-and-forget mutations without error surface**: history-detail (delete, save-as-routine, copy), profile save, settings (prefs mutate, export, test notification, token create/revoke), home-hero start. Use `mutateAsync` + inline `role="alert"` message via `userFacingRepoError`; add a tiny shared `useAction()` (pending/error/run) hook.
12. **Raw `e.message` rendering** remains in import-card.tsx (×4) and settings.tsx:580 → `userFacingRepoError` (AGENTS note).
13. **Focus**: `outline-none` with weak replacement in command-palette.tsx:136, field.tsx:17, input.tsx:11, select.tsx:22, select item :68, history-detail.tsx:449 (datetime input). Border colour change (night 1.9:1) fails 3:1 → drop `outline-none` so the global 2px `:focus-visible` outline applies, or add inset tone ring.
14. **Motion**: `transition-all` app-shell.tsx:163; `commit-flash` animates box-shadow; `float-in` transform collides with `md:-translate-*` centering in dialog.tsx and with inline transform; recharts has no `isAnimationActive` reduced-motion handling; `behavior:"smooth"` ignores motion pref (dialog.tsx:33). Add `useReducedMotion()` hook and use in charts/scroll.
15. **Old-identity leftovers**: frog-mark.tsx hardcoded `#131426/#6ab347/#ffffff` + "Radix grass" comments; app-shell.tsx:131-135 "0px-radius design language"; icon-button.tsx:17 "single border"; sw.js:33 "Supabase"; leftover `pt-3`/`mt-3 pt-3` divider paddings (import-card.tsx:96,204; settings.tsx:418; home-hero.tsx:235/244 `pt-3`); `--color-warn` == ink; `--color-faint/soft/ink-2` all one token; square (non-rounded) unseen dots.
16. **`t` shadowing**: local `t` variables shadow the voice `t()` in profile.tsx:76, settings.tsx:846, library.tsx (per its audit) → lint rule or rename convention (`tok`, `startedAt`).
17. **Shell a11y/PWA**: add skip link + `<main id>` + route-change scroll reset + `document.title` per route; `viewport-fit=cover` + safe-area top; `color-scheme` meta; font preload; try/catch the pre-paint script; SW: don't cache non-OK responses, evict old hashed assets, add notification icon/url.
18. **Pluralisation/formatting helpers**: manual `exercise{s}`/`sets`/`sessions` (home-hero:220-223, history-detail:477, import-card:115) → `plural()`; `toLocaleString()` in chart tooltip → shared `Intl.NumberFormat`; `&nbsp;` for number+unit pairs.
