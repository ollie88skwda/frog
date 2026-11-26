# 2026-11-25 boss UX batch: independent pass/fail

Verifier: `fm/frog-ux-verify` (did not write any of the batch). Build under test: `origin/workshop` at `40857a0` (merges `fm/frog-ux-entry`, `fm/frog-ux-inputs`, `fm/frog-ux-motion`). Before = `main` at `2e9cea3`.

## Method

- One capture spec, `e2e/ux-verify-2026-11-25.spec.ts`, written for this check (it does not reuse the implementers' evidence scripts). It runs the same steps on both builds and saves frames plus measured DOM facts.
- Before: `2e9cea3` in a separate worktree, its own scratch local Convex backend (`:3480`), `E2E_PORT=4481`. After: this branch, a second scratch backend (`:3470`), `E2E_PORT=4471`. Both are `VITE_E2E=1` builds via `scripts/run-e2e.ts`, iPhone 13 chromium touch profile.
- 390x844 for everything; 360x640 for the layout items (3, 6); night mode for colour items (6, 8, 9, 15).
- Raw evidence: frames in `verify/img/<item>-<before|after>[-night].jpg`, measurements in `verify/facts-before.jsonl` / `verify/facts-after.jsonl`. Review page: `verify/review.html`, published at https://04a26bfb.ht-ml.app/ (public link, frames inlined; checked at 390x844 day and night: 17 items, 0 broken images, no horizontal overflow).
- Reproduce: `VERIFY_TAG=after VERIFY_OUT=<dir> E2E_PORT=<port> bun --env-file=<local backend env> scripts/run-e2e.ts ux-verify-2026-11-25.spec.ts` (and the same with `VERIFY_TAG=before` from a `2e9cea3` checkout).

## Result: 15 pass, 2 partial, 0 fail (pass 15/17)

| item | before evidence | after evidence | pass/fail | note |
|---|---|---|---|---|
| 1. RIR typing lands in reps; re-tapping reps leaves ruler on RIR | `1-typed-before`, `1-retap-before`: reps 10, tap reps, tap RIR, type 3 → reps **130**, RIR "–", focus stays on reps. Tap reps again + type 8 → reps **1380**, RIR chips still shown | `1-typed-after`, `1-retap-after`: reps 10, RIR **3**, focus on RIR, RIR ruler shown. Tap reps → reps ruler only, `entry-col-reps` active, RIR inactive; type 8 → reps **8**, RIR 3 | pass | Bug reproduced on main exactly as described, fixed on workshop |
| 2. Ruler only for an exercise already logged this session | `2-before`: first set of a new exercise shows the weight ruler and the reps ruler | `2-after`: first set, tapping weight or reps shows no ruler (`[]`); `2-second-after`: after one logged set the weight ruler appears | pass | |
| 3. Unilateral: weight on its own line, reps/RIR in one row below | `3-before`: one row, reps L / RIR L / weight / RIR R / reps R all at y=566 | `3-after`: weight alone at y=554 (276 px wide); L reps, L RIR, R reps, R RIR in one row at y=662. 360x640 (`3-360-after`): same shape, Log on screen, no horizontal overflow | pass | |
| 4. Bilateral RIR uses the ruler, not 0/1/2/3 buttons | `4-before`: RIR opens five buttons `0 1 2 3 4+`; RIR is a `<button>` | `4-after`: RIR opens `rir-ruler` with −1/+1; RIR is an `<input>` | pass | |
| 5. ± spacing wrong; no ± for reps/RIR | `5-weight-before`: weight −/+ hug the panel edge (x=16 and 325, ruler 251 px); `5-reps-before`: reps ruler has no ± at all; RIR has no ruler | `5-*-after`: weight, reps and RIR all get −/+ (56x44, inset to x=24 / 310, symmetric 8 px gap to the ruler). +1 on reps "" → 1, +1 on RIR "" → 3, +2.5 on weight "" → 2.5 | pass | |
| 6. Top section empty; entry panel not attached to "Now" | `6-before`: big empty gap; Now row is a flat tint, no border, nothing ties it to the panel; panel header just "Set 2" | `6-after`: "1 of 2 sets done · 1 to go" line, Now row gets a 2px accent ring and a chevron, panel header gets the same green "2" badge + "now". Day, night and 360x640 all render | **partial** | The panel is linked to the Now row only by a matching badge and colour. It still floats at the bottom of the screen, with ~230 px of empty space at 390x844 (Now row ends at y=257, panel starts at y=490). Nothing physically connects the two |
| 7. Completed exercise needs a brief weight/reps visual where entry sits | `7-before`, `7-bilateral-before`: bottom panel says only "1 set logged" / "2 sets logged" + Add a set | `7-after`, `7-bilateral-after`: "N sets logged" plus a card per set (Set 1: L 30 kg × 10 / R 30 kg × 8; bilateral: Set 1 60 kg × 10, Set 2 62.5 kg × 8) where the entry panel was | pass | |
| 8. Completed unilateral sets read as bare "L/R" text | `8-before`: `L 30 × 10 R 30 × 8` inline text with small letter tags | `8-after` / `8-after-night`: each side is its own rounded chip (`bg-surface-2`) with its own tag | **partial** | The separation is real but faint. The chip fill against the row measures **1.11:1 in day** and **1.03:1 in night**, so at night the two chips are almost invisible and the row still reads as `L 30 × 10 R 30 × 8` text. The new bottom summary (item 7) separates the sides better than the list row does |
| 9. Unilateral Log too tempting after one side | `9-before`: one side entered → full black "Log 30 kg × 10 · L + R", `data-ready` absent | `9-after`: one side → quiet outline "Add right reps to log" (`data-ready=false`); both sides → full "Log 30 kg × 10/8 · L + R" (`data-ready=true`). Night checked | pass | Still tappable when quiet (not disabled); matches the implementers' stated design |
| 10. Tapping set 1 shows its data but doesn't highlight set 1 | `10-before`: panel switches to Set 1 (60 kg) but row 1 stays plain white; row 2 keeps the Now tint | `10-after`: row 1 gets the accent fill + ring, `aria-current=true`, `data-selected=true`; panel reads "Set 1 · editing" | pass | |
| 11. Top-left timer ambiguous | `11-rest-before`: rest shows a bare green "0:00" pill; working shows a bare "0:11" with a clock icon | `11-rest-after`: "REST 0:00"; working: "SESSION 0:08" (`clock-kind`). Title adds "hold for session length" | pass | |
| 12. Hold timer to see session length | `12-before`: a 900 ms touch hold (CDP touch) or mouse hold shows nothing | `12-after`: touch hold → "Session 0:02" readout under the clock; release hides it, opens no menu. During rest (`12-rest-after`) the hold shows "Session 0:06" and rest keeps running (REST 0:02 after release) | pass | Exercised with a real CDP touch hold, not just mouse |
| 13. Bilateral has no Setup & form; seat/pad need preset chips | `13-before`: bilateral library exercise (Leg Extension), no setup entry anywhere; `13-sheet-before` same | `13-after`: "Add setup or form notes" row; sheet has Seat/Pad/Back/Handles/Pin + 1–12 chips + typed number. Tapping Pad, 5 → "Pad 5"; after Save the row reads "Setup & form · Pad 5" (`13-saved-after`) | pass | Setup changes saved on the local test backend only |
| 14. Reopen mid-session lands on exercise 1 | log on A, switch to B, log on B. Today → Resume, a fresh tab on the session URL, and a reload all land on **A** | the same three paths land on **B**. Then go back to A and Resume → lands on A (follows the last exercise open, not just the newest one) | pass | "Last open" is stored per device (localStorage); another device would fall back to set state (out of scope here) |
| 15. Focus selects all; caret/selection obvious | `15-before`: tap weight "100" → caret at 2, nothing selected; type 80 → **10800**. Reps 12 → tap, type 9 → **192**. No focus fill or ring | `15-after` (+night): tap → selection 0–3; type 80 → **80**; reps → **9**. Second tap on the focused field drops a caret (1,1). Focus shows a tinted plate + 2px inset accent ring, solid-accent selection, day and night | pass | |
| 16. Animations felt bad | route fade dips the page to opacity **0** on a cached tab return (`16-route-0ms-before` is blank); tab fill covers the Today label for 3 frames; sheet settles at **439 ms** (spring tail 642→638 px); muscle meter regrows 0→22 px on every cache-hit return (`.meter-grow` present) | route fade bottoms at **0.5** (content readable at frame 0); Today label topmost on every sampled frame; sheet settles at **186 ms**, no tail; meter is full width at frame 0 on both returns, no `.meter-grow` | pass | All four named symptoms measured gone. "Felt bad" itself is subjective; these are the measurable symptoms the batch named |
| 17. Reduced motion respected | with `prefers-reduced-motion: reduce`, route fade and sheets already jump; in my sample the tab fill also jumped (199→47 in one frame), so I could **not** reproduce the before symptom myself | route fade opacity stays 1, sheet lands in 1 frame (19 ms), tab fill jumps, Today label never covered; no running animations in the session on entry | pass | After is correct on every measure. The before symptom (tab fill sliding under reduced motion) comes only from the implementers' log (`motion/reduced-pill-before.png`); my probe saw it jump |

## What is wrong (partials)

- **Item 6, partial.** Linked by colour only. `apps/web/src/screens/session.tsx` (the Now row `set-mark-*` with `now-link`, and the entry panel `entry-panel`) shares the badge and accent, but the panel stays pinned to the bottom with an empty band above it (~230 px at 390x844). The boss asked for the panel to visually attach to the Now set; this marks it but doesn't attach it.
- **Item 8, partial.** The side chips are too faint. `apps/web/src/screens/session.tsx` around the `set-mark-${i}-sides` row: each side is an `inline-flex … rounded-sm bg-surface-2` chip on a `bg-surface` row. Measured contrast with the row is 1.11:1 (day) and 1.03:1 (night), so at night the split is effectively invisible.

## Full suite on the combined branch (`40857a0`)

| check | command | result |
|---|---|---|
| build | `bun run --cwd apps/web build` (there is no root `build` script) | pass; bundle gate `scripts/check-bundle.ts`: 182.2 kB gz initial (budget 220) |
| typecheck | `bun run typecheck` | pass |
| lint | `bun run lint` | pass, 1 warning (`suppressions/unused` at `session.tsx:3665`). **Pre-existing**: `main` has the same warning (`session.tsx:3480`) plus one more |
| unit | `bun run test` | pass: core 744/744 (50 files), web 183/183 (18 files) |
| e2e | `E2E_PORT=4471 bun --env-file=<scratch backend> scripts/run-e2e.ts` | **227 passed, 13 skipped, 0 failed** (240 total, 15.1 min) |

The 13 skips are opt-in specs, not failures: `clerk-real` (needs real Clerk), `confidence-shots`, `motion-probe`, `qa-visual`, `session-ux-evidence` and this spec, each gated on an env var. No new or pre-existing e2e failures.

## Boundaries

- Captured on Chromium with an iPhone 13 touch profile, not a physical iPhone. iOS Safari's own caret/selection handling (item 15) and real long-press timing (item 12) were not tried on a device.
- Item 14's "reopen the app" was exercised as Today → Resume, a fresh tab on the session URL, and a hard reload. A PWA cold start from the iOS home screen was not tried.
