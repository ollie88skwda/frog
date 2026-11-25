# Motion audit — 2026-11-25 ("animations bad")

How these were captured: `MOTION_PROBE=<before|after> bun scripts/run-e2e.ts motion-probe.spec.ts` at 390x844 (iPhone 13 chromium, local Convex). The probe logs every animation that starts (CSS keyframes, WAAPI, motion's per-frame inline styles), samples sheet and disclosure geometry every frame, and takes screenshots at fixed offsets after each tap. The full logs are `animation-log-before.md` / `animation-log-after.md`. Each `*.png` is a strip of frames, left to right, at the offsets listed.

| item | before evidence | after evidence | pass/fail |
|---|---|---|---|
| 1. Route-change flash: each tab tap faded the page from blank (opacity 0 → 1 over 200 ms), so even a cached screen flashed white | `route-flash-before.png` (Plan at 0 / 60 ms, Today return at 0 / 60 ms: the frames are blank or washed out) | `route-flash-after.png` (content readable from frame 0, settles from 50% in 150 ms) | pass |
| 2. Segment swap flash (Plan `?s=`, Progress sections): the same fade from 0 | `segment-flash-before.png` (Library at 0 / 80 ms, Volume at 0 / 60 ms: section body blank) | `segment-flash-after.png` (body visible at 0 ms) | pass |
| 3. Tab pill painted over the neighbouring tab mid-slide (Today icon/label hidden under the fill) | `tab-pill-before.png` (row 1: the Today label is covered) | `tab-pill-after.png` (labels stay above the moving fill) | pass |
| 4. Spring settle tail: sheets, disclosures and the pill used no-bounce springs that kept creeping about 450 ms after they looked done | `animation-log-before.md` "sheet top px by ms": the sheet reached 641 px at 316 ms and only settled at 638 px at about 437 ms. `sheet-tail-before.png` | `animation-log-after.md`: settled at 638 px by 188 ms, no tail. Disclosure height: 120 px at 410 ms before, 120 px at 188 ms after. `sheet-tail-after.png` | pass |
| 5. Muscle meters replayed on a cache hit: each return to Today regrew all three bars from zero (`meter-grow` fired on every remount; log shows 3× `meter-grow` per return) | `meter-replay-before.png` (animations slowed 10×: the bars are short at 0 and 300 ms) + log | `meter-replay-after.png` (full length at 0 ms; no `meter-grow` in the after log) | pass |
| 6. Reduced motion: the tab fill still slid (layout animations ignore `MotionConfig reducedMotion`) | `reduced-pill-before.png` + log "reduced motion: tab" (the fill travels over 3 frames) | `reduced-pill-after.png` (the fill is on Progress at frame 0) | pass |
| 7. No single scale: 100/120/150/160/180/200/220/280 ms on two different curves (`--ease` and an out-quad) | the old `theme.css` / `lib/motion.tsx` | one scale: 100 ms press, 150 ms exits and small changes, 200 ms entrances and sheets, all on `--ease` (old timings in `animation-log-before.md`, new ones in `animation-log-after.md`) | pass |

Checked and found fine, so left alone:
- **Background refetch.** Refocusing the tab after the queries went stale sent 7 requests and started no animation. The fade that appears right after that step in the log comes from the probe's next tap.
- **Exits.** Dialog and sheet exits already pass taps through (`pointer-events: none`) while they fade.
- **Reduced motion.** Sheets and disclosures already jumped straight to their final state.
- **Session screen.** The set rows and the tab bar coming back on exit were left as they were.

Motion with a meaning stays: the set-logged commit flash, the PR banner float-in, the sheet slide, number ticks and the press dip.
