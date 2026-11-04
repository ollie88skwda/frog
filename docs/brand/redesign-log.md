# Frog redesign log (plain language)

Every fix made in the design audit pass, grouped by page. Audit findings: `docs/brand/audit/SUMMARY.md`.

## Whole app (shared building blocks)
- **Buttons, text fields and dropdown triggers are now 40px tall on phones** (32px on desktop) — they were 32px everywhere, too small to hit reliably. (`ui/button.tsx`, `ui/input.tsx`, `ui/select.tsx`)
- **Every icon is now hidden from screen readers by default** (they're decoration next to text); icon-only buttons get real labels. (`main.tsx` IconContext)
- **Dialog close button** got a name ("Close"), a visible resting fill and a 40px target. (`ui/dialog.tsx`)
- **Removed `outline-none` everywhere** so the keyboard focus ring is never hidden (adjust field, fields, palette, conditions, session inputs).
- **Text sizes below 12px and an undefined `text-3xs` class** now use the real 12px `text-2xs`; `font-extrabold` (not in the type scale) → bold.
- **`transition-all` in the tab bar** now animates only width and opacity.
- **New shared pieces** so screens stop hand-rolling them: `Textarea`, `Checkbox`, `DropdownMenu` (Esc, arrow keys, focus return), `ChipGroup`/`ToggleChip` (pressed state announced), `ConfirmDialog`, and `QueryState` (loading → error with Retry → empty).
- **Deleted dead code**: `session/rest-countdown.tsx`, `charts/body-heatmap.tsx`, `ui/dots.tsx`, unused `nextGroupId` in the session.

## Failed loads no longer look like empty data
A failed request used to show "No sessions yet", "No routines yet", an empty calendar or "Loading…" forever. Each now shows a plain error with a Retry button:
- **History**, **History detail** (also: a missing session now says "Session not found", and failed delete / copy shows the error instead of doing nothing, Share button has a label), **Routines**, **Trainer** (a failed load could previously offer to start a second program over the active one), **Program detail** (library fetch), **Statistics**, **Findings**, **Monthly report**, **Year in review**, **Calendar** (also a failed "log a past workout" now shows an error), **Measures** (previously typing could overwrite a day that hadn't loaded).
