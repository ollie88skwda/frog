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

## Home / shell
- **Sidebar theme toggle** is now the shared 40px/32px icon button with the name "Toggle theme" (was a bare ~24px button with no name). (`app-shell.tsx`)
- **Tab bar label animation** no longer uses `transition: all` (only width and opacity animate).

## Routines, Trainer, Programs
- **Five native browser `confirm()` popups replaced** with the app's own confirm dialog (delete folder, delete routine, save with unresolved pasted lines, regenerate program, remove program): theme-matched, keyboard-friendly, curly quotes.
- **Routines / Trainer / Program detail** show an error + Retry when loading fails instead of "No routines yet", a blank screen, the onboarding form (which could start a second program), or "Loading…" forever.
- **Routine save errors** now use plain-language text instead of raw error text.
- Copy: "Training tab" → "Routines tab" in the remove-program dialog.

## Training session
- **PR banner** timer no longer restarts every time the screen re-renders (it now always dismisses after 4s).
- **Finish sheet duration** is now measured when you open it, not when the screen first loaded.
- 🔗 emoji replaced with a Phosphor link icon; "linked / unlinked" copy capitalised.
- Notes boxes use the shared textarea; outline-removal replaced by the global focus ring on all session inputs; 7–10px text raised to the 12px floor; `text-3xs` (undefined) fixed; photo-overlay controls keep white text on the dark scrim (the accent foreground is dark in both modes and was unreadable there); set-mark side/warm-up tags sit below the glyph in a 40px mark.
- Deleted the unused rest-countdown component and the dead superset-id helper.

## Library, Exercise detail, Machines
- **Favorite star** is now a real 40px icon button with a name and pressed state; it was an invisible-at-rest bare button (its fill rendered nothing).
- **"Best for" info button**, **bulk-add dismiss ×**, **tag remove ×**, **setting remove ×** are named, themed icon buttons with real icons instead of text glyphs.
- **Exercise detail tabs** use hand-written tab roles (tablist/tab/aria-selected) at 40px; no Radix Tabs dependency.
- **Tag input** no longer drops a character when you type a comma.
- **Machines**: delete asks for confirmation; setting inputs are 40px with names; photo pickers reachable by keyboard.
- **Attach machine** failing no longer fails silently (shows the error and keeps the dialog open).
- **File pickers** (machine photos, setting photos, exercise media, measure photos, session photos, share-sheet) are visually hidden instead of `display:none`, so keyboard users can focus them (a focus ring appears on the label).

## History
- **History** and **History detail**: failed loads show an error with Retry; a missing session says so; delete / copy failures show the reason; the Share button has a name.

## Statistics, Findings, Monthly report, Year in review, Calendar, Measures
- Loading and failed loads are distinct everywhere (spinner text vs. error + Retry); monthly/year/stats no longer sit on "Loading…" forever after an error; findings no longer say "no findings" after a failure.
- **Calendar**: a failed "log a past workout" shows an error; the grid waits for sessions instead of flashing as empty.
- **Measures**: no editing until the data has loaded (previously a failed load let a typed value overwrite a saved day).

## Profile / Settings / Import
- Name save/cancel buttons are named; bio box uses the shared textarea.
- Raw error text replaced with plain-language messages in Settings and the CSV import card.

## Not changed on purpose (needs a decision or is large)
- Splitting `session.tsx` (4.7k lines), `routine-edit.tsx` and `library.tsx` into smaller files; moving filters/tabs into the URL; converting the remaining hand-rolled popup menus (session, routines, conditions) to the new Radix `DropdownMenu`; replacing the measures hand-drawn chart; per-route page titles. (The app-wide skip link to `#main` was added in `app-shell.tsx`.) All are listed in `audit/SUMMARY.md` with file/line detail; none change features.

## Proof
- Typecheck, lint, unit (core 247, web 72) green; full e2e green against local Convex; new `e2e/failed-load.spec.ts` (failed loads, unnamed icon controls, confirm dialog) and `e2e/clerk-real.spec.ts` (real Clerk DEV sign-in with a `+clerk_test` email, code 424242, then new-user flows against local Convex).
- QA screenshots refreshed (`docs/brand/qa`, 25 routes × mobile/desktop × day/night) with the brand audit asserting no horizontal overflow, Geologica only, Base-8 radii, no lines.
