# SBL design language (Linear-derived)

Read before touching UI. Tokens live in `src/styles/theme.css` (Tailwind v4
`@theme`); primitives in `src/components/ui/`. We match Linear's look with our
own code — never import their assets or branding.

## Principles

- **Density with calm.** Lots of information, quiet presentation. Hairline
  borders (`border-border`), not shadows. Shadows only on floating layers
  (`floating` utility: popovers, dialogs, command menu).
- **One accent.** `accent`/`brand` indigo carries ALL emphasis (primary
  buttons, selection, focus, active nav, done-states). Everything else is
  neutral grayscale. Semantic colors (`pos/neg/warn`) appear only in small
  glyphs and dots, never as large fills.
- **Keyboard-first.** Every primary action gets a shortcut; tooltips and menus
  show keycap hint chips (`keycap` utility). Tooltips teach shortcuts.
- **Fast, functional motion.** 100–160ms, `ease-(--ease-out-quad)`, animate
  only transform/opacity/colors. Entrances use `float-in`. No decorative
  animation; layout never jumps.

## Tokens (Tailwind classes)

- Surfaces: `bg-bg` (page) → `bg-surface` → `bg-surface-2` → `bg-surface-3`;
  hover rows `bg-surface-hover`, pressed/selected `bg-surface-active`,
  translucent control fill `bg-translucent`.
- Text: `text-ink` (primary) → `text-ink-2` → `text-soft` (secondary) →
  `text-faint` (tertiary/meta).
- Accent: `bg-brand`/`bg-accent`, `hover:bg-accent-hover`, subtle tint
  `bg-accent-soft`, on-accent text `text-accent-fg`.
- Borders: `border-border` (hairline), `border-border-strong`.
- Radii: controls `rounded-md` (6px), cards/panels `rounded-lg` (8px),
  dialogs/floating `rounded-xl` (12px), chips/pills `rounded-full`.
- Type: base 13px (`text-sm`); page titles `text-lg font-semibold`
  (semibold = 590, medium = 510 — never bolder); section labels
  `text-2xs font-medium tracking-widest text-faint uppercase`; ALL numeric
  data gets `num` (tabular). Body already has Inter alternates
  (cv01/ss03/zero) globally.
- Shadows: `shadow-(--inset-control)` is the secondary-button treatment;
  `floating` for overlays. Nothing else casts shadows.

## Patterns

- **List rows** (library, history, picker): single line, 36–40px tall,
  full-bleed, `hover:bg-surface-hover` (whole-row lift, no border change),
  title in `text-ink`, metadata right-aligned `text-faint num`, secondary
  actions hidden until `group-hover`. Divide with `divide-y divide-border`.
- **Status rings**: `<StatusRing state=... progress=... />`
  (`components/ui/status-ring.tsx`) — empty ring = pending, partial pie =
  in-progress, filled accent + check = done. Use for set/session completion.
- **Label pills**: `rounded-full` chips, 11–12px text, colored dot + name,
  color at ~10% opacity backgrounds. Tags, seed markers, confidence badges.
- **Buttons**: primary = `variant="primary"` (brand bg); everything else
  secondary/ghost. Small and quiet — prefer icon buttons + shortcuts over big
  CTAs.
- **Empty states**: centered, small muted icon, one primary line, one
  `text-faint` guidance line, primary action with its keycap shortcut.
- **Keycaps**: `<kbd className="keycap">K</kbd>` in tooltips, palette rows
  (right-aligned), empty-state CTAs.
- **Page headers**: title left (`text-lg font-semibold tracking-tight`),
  actions right, consistent `px-4 py-6` content padding, max-w-2xl centered
  content column.
