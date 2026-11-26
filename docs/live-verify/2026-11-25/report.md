# Frog live verification, 2026-11-25 UX batch

- Target: https://frog.olivernguyen.com (Cloudflare version `91322b4b-52ff-46ea-9e3a-b58ede075df5`, source `main` 66ecb5a; served entry chunk `assets/index-CKi1l-nl.js`).
- Browser: real Chrome via `chrome-devtools-axi`, viewport 390x844 @3x, mobile + touch emulation, day (light) and night (dark) where colour matters.
- Account: QA user `frog.qa+prod@olivernguyen.com` (Clerk prod `user_3M7lfS7Bypkr6ZFeFwDduZ1809G`), signed in with a one-shot Clerk Backend API sign-in token (`clerk api /sign_in_tokens --app app_3GZOfCZ2OL00uscjFG4cc2jCNsv --instance prod`, 15-minute expiry, consumed immediately). No secret printed or stored.
- Test data: a fresh workout from the QA routine "FBEOD" (session `a48acf1d-92f2-4d0a-95bc-b431b73e003d`). The pre-existing stale in-progress session (`c94909c6…`, ~100 h old) was viewed only, not edited or finished.
- Run: Wednesday 11-25, ~4:57 to 5:07 PM PST.

## Results: 4/4 pass

| # | Flow | Steps taken | What I saw | Result | Screenshots |
|---|---|---|---|---|---|
| 1 | RIR then reps | Pec Deck Fly set 2 (bilateral): tapped RIR, typed `2`; tapped Reps, typed `9`. Repeated on the per-side form (Unilateral Cuffed Cable Extension): Left RIR `1`, Right reps `7`, Right RIR `2`. Night: Unilateral Dumbbell Recline Curl set 2, RIR `3` then Reps `8`. | RIR took typed input (`RIR=2`, ruler `RIR ruler=2`, highlight `entry-col-rir`). After tapping Reps: focus on Reps, highlight moved to `entry-col-reps`, ruler switched to `Reps ruler=9`, `9` landed in Reps and RIR stayed `2`. Per side: each digit landed in the tapped field and the highlight followed (`entry-col-rir-left` → `entry-col-reps-right` → `entry-col-rir-right`). Same in night. | **pass** | `flow1-rir-typed-day.png`, `flow1-rir-reps-day.png`, `flow1-perside-typed-day.png`, `flow1-rir-reps-night.png` |
| 2 | Ruler visibility | Fresh workout, exercise 1 (Pec Deck Fly, nothing logged): checked for a ruler; logged set 1 (295 lbs × 7); went back and added set 2. | Before the first set: 0 sliders on the page, no ruler, entry panel only. After logging set 1: set 2 shows the weight ruler (`Weight ruler=295`, −5/+5). | **pass** | `flow2-ruler-before-day.png`, `flow2-ruler-after-day.png` |
| 3 | Unilateral layout | Unilateral Cuffed Cable Extension: set ⋯ → "Log left and right separately"; cleared Right reps; filled it back and logged; returned to view the logged row. Night: same steps on a new set. | Per side: Both sides / Per side toggle, weight `65 lbs L+R` on its own line with Split, then Left and Right cards each holding Reps + RIR in one row. With Right reps empty, Log turned quiet (outline/grey, `data-ready=false`, label "Add right reps to log"). Logged row shows separate outlined `L 65 × 8` and `R 65 × 7` cells plus `RIR 1 / 2`; the "1 set logged" list shows separate L and R cells too. Day and night. | **pass** | `flow3-unilateral-entry-day.png`, `flow3-log-quiet-day.png`, `flow3-log-quiet-night.png`, `flow3-logged-rows-day.png`, `flow3-logged-rows-night.png` |
| 4 | Resume to current exercise | Logged a set on exercise A (2 of 17, Unilateral Cuffed Cable Extension), moved to exercise B (3 of 17, Unilateral Dumbbell Recline Curl), logged 35 lbs × 7, then reloaded the app at `/` and tapped "Resume session" on Today. | Landed on `/session/a48acf1d…` showing exercise 3 of 17 (B) with its logged set, not exercise 2 (A). Night shot taken on the same resumed screen. | **pass** | `flow4-resume-lands-on-B-day.png`, `flow4-resume-lands-on-B-night.png` |

## Also captured

| Item | What I saw | Screenshots |
|---|---|---|
| Entry panel attached to the Now set | The weight/reps/RIR panel sits directly under the green "Now" row with no gap, in both the fresh state and with the ruler showing. | `flow2-ruler-before-day.png`, `flow2-ruler-after-day.png`, `flow1-rir-reps-night.png` |
| Top-left timer label | Before a set: `SESSION 0:08` with a clock icon. After a set: green `REST 0:02` pill (aria: "Resting after set 1 — tap to stop, hold for session length"). | `flow2-ruler-before-day.png`, `extra-timer-rest-label-day.png` |
| Hold to show session length | Touch pointer-down on the REST pill, held ~1 s: a floating "SESSION 4:39" readout appeared under the pill. On release the readout went away and rest kept running (`Rest 1:16`), so the hold did not stop the rest timer. | `extra-timer-hold-session-length-day.png` |

## Console errors

| Screen | Errors |
|---|---|
| Today (`/`) | 0 |
| Plan (`/plan?s=routines`) | 0 (info only: PWA install banner not shown) |
| Session (`/session/a48acf1d…`, whole run incl. reload) | 0 (one DevTools "issue": a form field without an id or name, count 3) |

## Observations (not failures, unverified as bugs)

1. The bottom "Next: Unilateral Dumbbell Recline Curl (55 Degrees)" button label is wider than the button at 390 px (scrollWidth 364 vs clientWidth 358) and runs edge to edge with no chevron, in day and night (`flow3-logged-rows-*.png`). Cosmetic, long exercise names only.
2. On Plan, the first "Start" tap on the FBEOD routine card did not start a workout; a second tap on the card's button did. The floating "Resume workout" pill overlaps the routine list near that row, and my harness also hit stale accessibility refs at the time, so this is most likely a test artifact. Not reproduced deliberately.

## Residue on the QA account

- New in-progress workout `a48acf1d…` (FBEOD): Pec Deck Fly 295 × 7 and 295 × 9; Unilateral Cuffed Cable Extension L 65 × 8 / R 65 × 7; Unilateral Dumbbell Recline Curl 35 × 7 (an unlogged draft is open on exercise 2). Left open, not finished, so nothing was added to history.
- The older stale workout `c94909c6…` was untouched.
- Theme: the app followed the emulated colour scheme (Device mode); no theme setting was changed.
