# Frog design language (Because green)

Read before touching UI. Frog runs Because's brand system, **green (Fern)
only** — spec in `docs/brand/README.md` and
`docs/brand/because-reference/` (`BRAND-FINAL-SPEC.md`, `CORNERS-SPEC.md`).
The old Frog identity (grass/sage, 0px radius, Radix Themes) is archived in
`docs/brand/archive/` and superseded (`docs/DECISIONS.md`, 2026-11-03). Only the
frog mark survives from it.

## One token source

`src/styles/theme.css` is the only place colours, corners, type and motion are
defined. `<html>` carries `data-theme="green"` and `data-mode="day|night"`;
`index.html`'s pre-paint script sets both (no flash) and `src/lib/theme.ts`
owns the Device / Day / Night choice (`localStorage.mode`; Device follows the
OS).

`@radix-ui/themes` is not used. Unstyled Radix primitives
(`@radix-ui/react-dialog`/`-select`/`-switch`), cmdk and the vendored shadcn
components are styled only through the Tailwind utilities that `theme.css`'s
`@theme inline` block aliases onto the Because `--color-*` / `--r-*` roles.
shadcn's `--chart-1..5` map onto the Fern ramp per mode. Never add a second
value for a role; add an alias in `@theme inline` if a name is missing.

## MOBILE-FIRST — the primary target

**Frog is used on phones, in gyms. Desktop is secondary.** Every screen, control,
and layout is designed for a ~390px viewport FIRST, then adapted up.

- Touch targets on interaction paths meet the ≥40px floor AGENTS.md sets
  (`h-10`/`h-11`, `ui/button`'s `lg`/`icon-lg`); 32px is a desktop-only
  `md:` override.
- Hover-revealed affordances (trash, ✕) must also be reachable on touch: visible
  by default on mobile, hover-revealed only from `md:` up.
- Dialogs are bottom sheets on mobile (full-width, rounded top, pinned to the
  bottom); centered cards only from `md:` up. See `ui/dialog.tsx`.
- Navigation is the floating island tab bar on mobile; the sidebar exists ≥md.
- Test every UI change at 390×844 before calling it done.

## The rules

- **Geologica only** (`--font-body`), including numerals; all numeric data
  gets `.num` (tabular figures).
- **Phosphor Regular icons** (`@phosphor-icons/react`) only — never lucide, no
  hand-drawn icon glyphs.
- **Corners on Base 8**: 4 / 8 / 12 / 16 / 24 (`rounded-xs`…`rounded-xl`), or
  `rounded-full` for pills/circles. Nested corners: outer = inner + gap.
- **No lines or borders** except the 1px `border-field` on text fields
  (`ui/input`, `ui/select`, raw `<input>`/`<textarea>`), which turns
  `border-focus` on focus. Separate with tone (`bg-surface`, `bg-subtle`,
  `bg-hover`, `bg-active`) and spacing, never hairlines — charts have no
  gridlines; selection states are tone fills or dimming, never rings or bands.
- **Fern `#afcfab` accent** (`bg-accent`, `text-accent-ink`, `bg-accent-soft`)
  for the one creative action and selected states; **ink primary buttons**
  (`bg-action text-on-action`). Overlays dim with `bg-scrim`.
- **Fast, functional motion**: 100–150ms colour/opacity/transform transitions;
  **nothing animates on the data path**.

## Voice

The split rule governs everything: the closer to the data, the more serious
(logging path, charts, findings statistics are sacred — never goofy); the
closer to the edges, the more the frog (empty states, loading, errors,
celebrations, 404). Playground copy routes through the Human/Frog/Ultrafrog
registers in `src/lib/voice.ts` (`useVoice().t(human, frog)`); sacred strings
stay bare literals. No "!", no emoji in data, deadpan.

## Patterns

- **Buttons** (`ui/button`): `primary` = ink, one per view; `accent` = Fern;
  `outline`/`ghost` keep a resting sand fill (no bare text-only buttons);
  `danger` = soft red. All `rounded-sm`.
- **Inputs** (`ui/input`): `rounded-sm border border-field bg-sunken`. A
  text-size class applies on mouse pointers only — `styles/theme.css` forces
  text-entry controls to 16px on `(pointer: coarse)` so iOS never zooms.
- **Icon controls**: `ui/icon-button` — borderless `bg-surface-2` tone square.
- **Status rings**: `<StatusRing state=… progress=… />` — pending, partial,
  done (filled + check).
- **Empty states**: centered, small muted Phosphor icon, one primary line, one
  `text-faint` guidance line, primary action — voiced with `t()`.
- **Page headers**: title left, actions right, `px-4 py-6` content padding,
  `max-w-2xl` centered content column.

## Checks

- `e2e/brand-guard.spec.ts` (via `e2e/brand-audit.ts`) audits rendered routes:
  green theme, no lucide svgs, Geologica only, corners on the scale, no lines
  outside text fields.
- `e2e/qa-visual.spec.ts` (`QA_VISUAL=1 bun scripts/run-e2e.ts --
  e2e/qa-visual.spec.ts`) applies the same audit to every route at 390×844 and
  1440×900 in day and night and saves screenshots to `docs/brand/qa/`.
