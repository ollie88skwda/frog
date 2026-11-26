# Session UX r2 (2026-11-25) — report

Branch `fm/frog-ux2-session`. Frames are 390x844 Playwright (iPhone 13 profile) unless marked sim (iOS Simulator, iPhone 17 `AD8A9EEB`, Safari). Measured facts: `facts-before.json` / `facts-after.json`. Sim flows: `sim/*.yaml`.

| item | before | after | pass/fail |
|---|---|---|---|
| 1 sets-logged row centred | `1-before.png` (left-hung caption, grid tiles) | `1-after.png` (check + label centred, cx 195 of 390; tiles centred) | pass |
| 2 setup presets icons + structure | `2-before.png` (bare chips) | `2-after.png` (icon per preset, Setting / Position / Notes cards) | pass |
| 3 per-side weight centred | `3-before.png` (weight cx 154 vs panel 195) | `3-after.png` (cx 195 = panel 195, mirror spacer for Split) | pass |
| 4 note affordance | `4-before.png` (pencil icon) | `4-after.png`, `4-sheet-after.png` (labelled Note chip with notepad icon beside set label; tinted when a note exists) | pass |
| 5 tap leaves caret, no select-all | `5-before.png` (selection 0..3 of "100") | `5-after.png` (caret 2..2) | pass |
| 6 ruler restored (from set 2) | `6-before.png` (ruler clipped below panel at short heights) | `6-after.png` (ruler in viewport, pinned footer) | pass |
| 7 no kg/lb in session | `7-before.png` (unit items in ⋯ menu) | `7-after.png` (none; Settings unit only) | pass |
| 8 ask to save template changes | `8-before.png` (per-side switch: no prompt) | `8-after.png` ("Save these changes to the routine?" listing "…: per side", Yes / No) | pass |
| 9 last time as ghosts | `9-before.png` (prefilled 40/10 + "last 40 kg × 10") | `9-after.png` (empty fields, grey 40/10 placeholders, no last text) | pass |
| 10 keyboard covers Log (sim) | `10-before.png` (Log behind accessory bar) | `10-after.png`, `10-after-rebased.png` on workshop 424a455 (Log + ruler above keyboard, header and field visible) | pass |
| 11 per-side stack with keyboard up (sim) | `11-stack-before.png` (footer covers weight box and Split, weight reads 0) | `11-stack-after.png` (weight row clear of Now row and ruler; placeholder from set 1) | pass |
| A focus follows tap (sim) | `A-before.png` (105 → tap Reps → 5 = 1055) | `A-after.png` (Weight 105, Reps 5) | pass |
| C Finish START overflow (sim) | `C-before.png` (field past right edge) | `C-after.png` (fits) | pass |

Layout sweep: `sweep-{360x640,390x844}-{day,night}.png`, no tracked control clipped (`ux2-session-evidence.spec.ts` sweep tests).

## Diagnoses

**Item 5.** `components/ui/select-on-focus.ts` (installed from `main.tsx`) selected every numeric field's value on focus and re-selected it a frame later. Session inputs also called `.select()` themselves. Fix: delete the listener and the in-session `.select()`. Regression: `e2e/input-focus.spec.ts` "tapping a numeric field leaves a caret, not a selection". It failed on the pre-fix build (Expected 3, Received 0).

**Item 6.** The ruler was never removed: f98f0b5 deliberately shows it only once a set has been logged. Since 02680cd the entry panel scrolls internally, with the ruler and Log at its end. At keyboard-sized heights (≤ ~397px in per-side mode) the ruler rendered below the panel's visible box or under the keyboard, so it looked gone. Fix: the ruler + Log sit in a `sticky bottom-0` footer, and the session column is sized from `visualViewport` height. Regression: `e2e/session-ux2.spec.ts` item 6 test (no ruler on set 1; ruler and Log on screen at 390x844, 390x397, 360x640). It failed on the pre-fix build (Expected true, Received false).

**Item A.** The value input set the active column on `pointerdown`. That re-rendered the ruler before iOS moved focus, and WebKit treats a tap that changes the DOM on press as a hover, so focus and digits stayed in the old field. Fix: drop `onPointerDown`; focus/click drive the active value. Regression: `session-ux2.spec.ts` "a touch press alone never moves the active value". It failed with `onPointerDown` restored.

**Item 11 (Joe, 2026-11-26).** `revealEntryField` only revealed the input box, so the unit label and the Split button stayed under the sticky footer. Empty fields also fed `0` to the ruler, and with no last time there was no placeholder at all. Fix: reveal the whole weight row, hide the ruler readout below 450px of visible height, and fall back to this session's previous set as the placeholder. Regression: `session-ux2.spec.ts` "per side with the keyboard up…" (390x404, 360x380). It fails on the prior commit.

**Item C.** iOS gives `datetime-local` an intrinsic minimum width. Fix: `w-full max-w-full min-w-0 appearance-none`. Desktop WebKit/Chromium don't reproduce the overflow, so the evidence is sim-only. A WebKit Playwright check passed on both old and new code, so it was discarded as non-discriminating.

**Also fixed (found while reproducing 6):** after a reload, "Add a set" needed several taps when more sets were logged than planned, because the added-set count was device-local. Regression in `session-ux2.spec.ts`.

## Checks
Rebased onto origin/workshop 424a455; the checks below were re-run on the rebased tree.
`bun run typecheck`, `bun run lint` (one pre-existing warning), `bun run test` (744 + 201), production `vite build` + `scripts/check-bundle.ts` (181.7 kB gz, markers clean). e2e: 110/110 across bodyweight-perside, core-loop, exercise-types, input-focus, perside-entry, session-{error,feedback,picker-create,swipe,ux-entry,ux2}, spotlight-{history,input,marks,nav,perside,rest,set-menu}, copy-claims, routines, home-hero, redirects.

Known limits: the item C regression is sim-only, because no desktop engine reproduces the iOS intrinsic width. Items 1–4 and 7–9 have Playwright frames, not sim frames.
