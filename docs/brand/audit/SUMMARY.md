# Frog web audit — summary

Detailed per-file findings (path:line, severity, fix): [session](session.md) · [routines](routines.md) · [library](library.md) · [stats](stats.md) · [shell](shell.md). Checked against the Vercel Web Interface Guidelines (`_guidelines.md`), the better-* skills, impeccable, and the Frog/Because rules in AGENTS.md. Static read of every route + component; runtime proof is in Part C (`docs/brand/qa`, e2e).

Mechanical greps came back clean for: hex/rgb colours (except frog-mark, share-sheet, session-photos), raw tailwind palettes, lucide, `transition-all` (1 hit), off-scale radii, `any`, `<div onClick>`. Global focus ring, reduced-motion and `touch-action` already live in `theme.css`.

## Screens and states inventoried
Routes (24): `/` home, `/auth`, `/train`, `/routines`, `/routines/new`, `/routines/:id/edit`, `/programs`, `/programs/:key`, `/trainer`, `/profile`, `/calendar`, `/session/:id`, `/library`, `/exercises/:id`, `/history`, `/history/:id`, `/findings`, `/measures`, `/stats`, `/stats/monthly`, `/stats/year`, `/settings`, `/tips`, `/changelog`, `*`. Overlays: exercise editor, bulk add, best-for-muscle, archive confirm, machine picker/attach, finish overlay, post-save summary, share sheet, plate sheet, photos, conditions, lesson, command palette, error boundary. Per-screen state tables are at the foot of each audit file.

## P0 — broken / inaccessible (fix order = shared first)
| # | Issue | Fix | Where |
|---|---|---|---|
| 1 | Failed or loading query renders as empty / eternal "Loading…" (history, history-detail, home, profile, settings, routines, trainer (can offer a second program over an active one), programs, stats, findings, monthly, year, calendar, measures (could upsert over an unloaded day), exercise-detail, metrics, machines) | New shared `QueryState` (loading `role=status`, error `role=alert` via `userFacingRepoError` + Retry, empty); wire into every screen | all |
| 2 | Icon-only controls with no accessible name (sidebar theme toggle, dialog close, favorite, info, `×` glyph buttons, history-detail, profile, settings) | `aria-label` + `IconButton`; Phosphor icons `aria-hidden` by default via `IconContext` | shared + screens |
| 3 | Bare/tiny controls (24–28px, no resting fill) incl. chips, segmented controls, tag/setting remove | `Button`/`Input`/`Select`/`Switch` default `h-10 md:h-8`; shared `ChipGroup`/`ToggleChip` with `aria-pressed` | shared |
| 4 | Hand-rolled popup menus (≈10 copies) without Esc/focus/keyboard | Radix `DropdownMenu` wrapper | session, routines, library, conditions |
| 5 | `focus:outline-none` hiding the focus ring (adjust-field, field, input, select, command palette) | drop `outline-none`; use global `:focus-visible` | shared |
| 6 | Hidden `display:none` file inputs (measures ×2, machines ×2, editor media, import-card) unreachable by keyboard | `sr-only` input + `focus-within` ring | measures, machines, editor |
| 7 | Destructive actions with no confirm (delete machine / metric / setting, 5× native `window.confirm`) | shared `ConfirmDialog` | library, routines, trainer |
| 8 | Unhandled rejections / silent mutation failures (attach-machine, calendar retroLog, measures, history-detail, profile, settings…) | try/catch → inline `userFacingRepoError` message | all |
| 9 | exercise-detail tabs without roles | tablist/tab roles + aria-selected | exercise-detail |

## P1 highlights
- Dead/duplicated code: `session/rest-countdown.tsx`, `charts/body-heatmap.tsx`, `ui/dots.tsx`, unused Card parts, `nextGroupId`, 5× copied ExerciseRow list, `resizePhoto` ×3, `mmss`/`formatRest`, `Slide`/`Stat`/`monthCells`, 6 hand-built list cards, 14× eyebrow label.
- Undefined `text-3xs`; 7–10px type (below the 12px floor); `font-extrabold` (theme tops at 700).
- Hard-coded colours: `#99c195` (share-sheet), `text-white` (session-photos), old-identity `#131426/#6ab347` in frog-mark; stale comments ("RLS", "0px radius", "grass").
- Emoji / glyph icons (🔗 ⋯ ● ○ ⌨ ↺ ▲ ×) → Phosphor.
- Bugs: FinishOverlay `endAt` frozen at mount; PR banner timer resets on re-render; TagEditor comma handler reads stale draft; routine-edit seeds drafts before the exercise library loads (can mistype exercises / wipe duration targets); `transition-all` in app-shell.
- Raw `e.message` in import-card ×4 and settings.
- Placeholder-only labels (no `aria-label`/`name`/`autoComplete`/`spellCheck`), straight quotes/`...` in copy, lowercase badges.
- Two hand-rolled full-screen overlays (post-save-summary, share-sheet) without dialog semantics.
- Shell: no skip link / document.title per route / safe-area top; SW caches non-OK responses.

## P2/P3
Eyebrow & screen-wrapper & Surface-card dedupe, URL state for filters/tabs, voice `t()` shadowing, hover-only photo reorder controls (touch), reduced-motion for recharts/smooth scroll, pluralisation helper. See per-file lists.

## Plan
Part B applies shared-kit fixes first (`components/ui`: Button/Input/Select/Switch sizing, Textarea, Checkbox, ChipGroup, DropdownMenu, QueryState, ConfirmDialog, icon a11y), then page-by-page; every fix is logged in `../redesign-log.md`. Items deliberately not done are listed at the end of that log.
