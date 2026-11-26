# Page transitions + iOS steer items (2026-11-25, r2)

Branch `fm/frog-ux2-pages`. The Playwright strips are at 390×844 with animations slowed to 0.1× (`e2e/page-transitions-probe.spec.ts`, `PAGES_PROBE=before|after`). The `sim/` evidence was captured in iPhone 17 Pro Mobile Safari on iOS 26.4 (UDID 39FD6C73…).

| item | before | after | pass/fail |
|---|---|---|---|
| Push (list → detail) | instant cut (`push-before.png`, `sim/push-before.png`) | slides in from the right, 200 ms (`push-after.png`, `sim/push-after.png`) | pass |
| Back (button / browser back) | instant cut (`back-before.png`, `sim/back-before.png`) | slides out to the right, 200 ms (`back-after.png`, `sim/back-after.png`) | pass |
| Tab switch | instant cut (`tab-before.png`, `sim/tab-before.png`) | 150 ms cross-fade; tab bar stays put (`tab-after.png`, `sim/tab-after.png`) | pass |
| Session takeover in/out | instant cut (`session-in/out-before.png`) | slides like push/back (`session-in/out-after.png`, `sim/session-*-after.png`) | pass |
| Reduced motion | instant cut | instant cut, as intended (`reduced-tab-after.png`) | pass |
| iOS edge-swipe back | n/a | Safari animates the swipe and the app skips its own slide (`hasUAVisualTransition`) | pass (code path; not recorded) |
| A. Status bar (issue 8) | `black-translucent` with no cover or insets (`sim/statusbar-standalone-before.png`) | `default`; standalone app content starts below the bar (`sim/statusbar-standalone-after.png`) | pass |
| B. Duplicate "Build my program" (issue 7) | two stacked buttons (`sim/plan-duplicate-before.png`) | one button (`sim/plan-duplicate-after.png`) | pass |
| C. Sign-in Continue under keyboard bar (issue 5) | covered (`sim/signin-keyboard-before.png`) | clear on the email and code steps (`sim/signin-keyboard-after.png`, `sim/signin-code-keyboard-after.png`) | pass |

Notes:
- The sim recorder writes variable-frame-rate video, so the 150 ms tab fade appears in only 1–2 frames there. The Playwright strips show the full fade.
- `sim/plan-duplicate-before.png` and `sim/statusbar-standalone-before.png` come from the earlier iOS sim report on an iPhone 17 Pro Max with the same build line. The after shots are from the 17 Pro.
- Session top inset: with `default`, the status bar is opaque, so the session screen needs no top inset. Going edge-to-edge later would need `viewport-fit=cover` plus `env(safe-area-inset-top)` on the shell and on the session header.
- Checks: web build, typecheck, biome, bundle gate (182.9 kB gz), vitest `nav-kind.test.ts` (12), full e2e (235 passed, 28 env-gated skips).
