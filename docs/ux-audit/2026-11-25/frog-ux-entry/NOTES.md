# frog-ux-entry evidence (2026-11-25)

Screenshots are 390x844 (`*-360.png` are 360x640). `before` = the code at `2e9cea3` (main), `after` = branch `fm/frog-ux-entry`, both captured by `e2e/session-ux-evidence.spec.ts` (`UX_SHOTS=before|after`), item 1 by `e2e/session-ux-entry.spec.ts`.

## Item 1 diagnosis

RIR (`rir-column`) was a focus-less `<button>`. Tapping it moved the ruler and underline to RIR, but the reps `<input>` kept keyboard focus, so typed digits went into reps (`1-before.png`: reps reads 103). Re-tapping the still-focused reps input fired no focus event, so the ruler/underline stayed on RIR. Fix: every value is a real `<input>`; focus, pointerdown and click all set the active value, and focus selects the contents so typing replaces it. Regression test: `e2e/session-ux-entry.spec.ts` (failed on main, passes on the branch).

## Notes where a still frame is not enough

- 9: before, Log is the full black button even with one side missing; after, it is a quiet outline reading "Add right reps to log" (`data-ready="false"`) until both sides are entered.
- 12: the after frame is taken mid-hold (900 ms): the "Session 0:02" readout floats under the clock while held and disappears on release; the release does not open the clock menu or stop rest. Before, holding did nothing.
- 14: both frames log a set on exercise A, move to B, log a set there, then reopen via Today → Resume. Before lands on A (1 of 2); after lands on B (2 of 2), the exercise last open on this device.
- 13/13b: before, a library (seed) exercise shows no setup row; after, "Add setup or form notes" appears and opens the preset chips (Seat/Pad/Back/Handles/Pin, 1-12) plus a typed number.
- 7 and 8 share frames (the same per-side exercise after logging): 8 is the L/R chip split in the list, 7 is the logged-sets summary at the bottom.
- 360x640: nothing clips or overlaps; the set list scrolls above the entry panel, the 44px targets hold and Log stays on screen (also asserted by `e2e/perside-entry.spec.ts`'s fit tests at 360x640 and 390x844, day and night).
