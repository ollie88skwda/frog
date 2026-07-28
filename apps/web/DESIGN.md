# Frog design language (Radix Themes 3)

Read before touching UI. The brand is **Frog**
(`docs/brand/frog-brand-identity.html` — the spec); the design system is
**Radix Themes** (`@radix-ui/themes`) — one `<Theme>` in `src/app.tsx` is the
single source of look-and-feel (`docs/DECISIONS.md`, 2026-07-16). Use Themes
components wherever one exists instead of hand-rolling; unstyled Radix
primitives + Radix tokens cover the rest (the ⌘K palette, `StatusRing`, the
set-logging grid).

```tsx
<Theme accentColor="grass" grayColor="sage" radius="none"
       scaling="100%" panelBackground="solid"> … </Theme>
```

`appearance` is intentionally unset: Radix reads the `light`/`dark` class that
`index.html` sets pre-paint (and `lib/theme.ts` keeps in sync alongside the
legacy `data-theme`), which avoids a flash of the wrong theme.

## The bridge (transitional)

`src/styles/theme.css` maps the legacy Tailwind token names
(`--bg`/`--ink`/`--brand`/`--border`/…) onto Radix's raw scales
(`--sage-N`, `--grass-N`) at `:root`, so the ~1,900 existing Tailwind classes
render in the Radix palette while screens migrate component-by-component. New
code should prefer **Themes components + props** over these classes; the bridge
is deleted once nothing references it. Colours are imported modularly — only the
five named scales (sage, grass, red, amber, orange; success folds into grass) —
so a Radix `color="…"` prop naming any other scale silently resolves to an
invalid var. Add the scale import if you need another.

## MOBILE-FIRST — the primary target

**SBL is used on phones, in gyms. Desktop is secondary.** Every screen, control,
and layout is designed for a ~390px viewport FIRST, then adapted up.

- Touch targets on interaction paths are ≥44px on mobile: Radix `size="3"` (or
  `h-11`) on mobile, dense `size="2"` (`md:h-8`) as the `md:` override.
- Hover-revealed affordances (trash, ✕) must also be reachable on touch: visible
  by default on mobile, hover-revealed only from `md:` up.
- Dialogs are bottom sheets on mobile (full-width, rounded top, pinned to the
  bottom); centered cards only from `md:` up. See `ui/dialog.tsx`.
- Navigation is the floating island tab bar on mobile; the sidebar exists ≥md.
- Test every UI change at 390×844 before calling it done.

## Accent + colour — grass on sage

The theme is **sage lab-ink grayscale + one frog-green accent**
(`accentColor="grass"`, `grayColor="sage"`). Grass carries ALL emphasis —
primary buttons, selection, focus, active nav, done-states — and **doubles as
semantic success**: a PR is green, and the frog is pleased (`--pos` =
`grass-11`; there is no separate green scale). `--neg`/`--warn` (red/amber,
Radix step 11) appear only in small data glyphs — findings verdicts, condition
dots, destructive affordances — never as large chrome fills.

Register: **the driest, most rigorous instrument you've ever trusted — and,
unmistakably, a frog runs it.** The split rule governs everything: the closer
to the data, the more serious (logging path, charts, findings statistics are
sacred — never goofy); the closer to the edges, the more the frog (empty
states, loading, errors, celebrations, 404). Playground copy routes through
the Human/Frog/Ultrafrog registers in `src/lib/voice.ts` (`useVoice().t(human,
frog)`); sacred strings stay bare literals. The frog editorialises around a
number, never on it — no "!", no emoji in data, deadpan.

## Principles

- **Density with calm.** Lots of information, quiet presentation. Hairline
  borders (`border-border` = slate-6), not shadows. Shadows only on floating
  layers (dialogs, palette, menus).
- **Keyboard-first.** Every primary action gets a shortcut; menus and tooltips
  show keycap hint chips (`keycap` utility). ⌘K opens the command palette.
- **Fast, functional motion.** 100–160ms, `ease-(--ease-out-quad)`, animate only
  transform/opacity/colour. Entrances use `float-in`. **Nothing animates on the
  data path** — logging a set never waits on or shifts during animation.

## Tokens

Prefer Themes component props (`size`, `variant`, `color`, `radius`,
`highContrast`) and Radix layout components (`Flex`, `Grid`, `Box`, `Card`).
Tailwind is for layout utilities and, transitionally, the bridged colour
classes:

- Surfaces: `bg-bg` (page) → `bg-surface` → `bg-surface-2/3`; hover
  `bg-surface-hover`, selected `bg-surface-active`, translucent `bg-translucent`.
  Dialog/overlay panels use Radix `--color-panel-solid`.
- Text: `text-ink` (sage-12) → `text-ink-2`/`text-soft` (sage-11) →
  `text-faint` (sage-10). Note sage-10 is ~4.5:1 — reserve `text-faint` for
  genuinely tertiary meta, and lean on size/weight for hierarchy.
- Accent: `bg-brand`/`bg-accent` (grass-9), `hover:bg-accent-hover` (grass-10),
  tint `bg-accent-soft` (grass-a3), on-accent text `text-accent-fg`.
- Radii come from Radix `radius="none"` (`--radius-factor` 0) — the brand's 0px
  mandate: every `rounded-sm…xl` resolves to 0, so don't add them to new code;
  `rounded-full` is reserved for avatars. The radius vars
  **only resolve inside `.radix-themes`** — overlays must portal into the theme
  root (see below).
- Type: base 15px (`text-sm`); **Bricolage Grotesque** head to toe, wired through
  Radix's `--default-font-family`/`--heading-font-family`. ALL numeric data gets
  `num` — Bricolage has no tabular figures, so `.num` routes digits through the
  mono stack (Radix Themes does not set `tabular-nums` by default either).

## Overlays portal into the theme root

Radix scopes its tokens (radius, `--color-panel-solid`, accent/gray scales) to
`.radix-themes`, but Radix primitives portal to `<body>` by default — outside
it, where those tokens are unset and overlays render square and unstyled. Every
overlay (dialogs, the cmdk palette, and any future dropdown/popover/tooltip)
must portal into the theme root via `themePortalContainer()`
(`lib/theme-portal.ts`).

## Patterns

- **Buttons**: `ui/button` maps to Radix `Button`/`IconButton`. `primary` =
  solid grass; `outline`/`ghost` are neutral (`color="gray"`, surface/soft);
  `danger` = soft red. `ghost` uses Radix **soft** (a resting fill), never Radix
  `ghost` — no bare text-only buttons (every control keeps a visible surface).
- **Inputs**: `ui/input` maps to Radix `TextField`; call-site classes
  (`num`, `h-8`, `flex-1`) land correctly (the input fills the wrapper).
- **Status rings**: `<StatusRing state=… progress=… />` — empty ring = pending,
  partial pie = in-progress, filled grass + check = done.
- **Empty states**: centered, small muted icon, one primary line, one
  `text-faint` guidance line, primary action with its keycap shortcut. Empty
  states are prime frog territory — voice them with `t()` (e.g. "The lab is
  empty. The frog is waiting.") but still point at the next action.
- **Page headers**: title left, actions right, `px-4 py-6` content padding,
  `max-w-2xl` centered content column.
