# Mobile-phase backlog (deferred from Hevy parity, 2026-07-14)

Items from the Hevy-parity plan that cannot or should not exist in the v1 web SPA. They activate when Frog's mobile phase starts (the `Repo` seam in `packages/core` is the intended slot for a local store + native shell). Source spec: `docs/hevy-parity/hevy-master-spec.json` → "Platform extras" + integrations.

## Native companions
- **Watch apps** (watchOS / Wear OS): run routines from the wrist, log sets, set types, duration timers, HR capture (avg HR + HR graph + calories enrichment on saved sessions), complications/tile, two-way live sync with phone.
- **Home-screen widget suite**: calendar, streak, rest-days, weekly stats, routine-of-the-day, quick-start actions, last-week overview, chart widget (metric × 7d/3m).
- **Live Activity / lock-screen session widget**: current/next exercise, sets done, next prescription, elapsed time; complete-a-set from the widget; the rest stopwatch (running time since the last set, with Stop) after completion.

## Health & fitness integrations
- **Apple Health** (iOS) / **Health Connect** (Android): one-way write of finished workouts (strength-training type + calories), per-workout sync toggle at save, never retroactive. MyFitnessPal relays via these platforms.
- **Strava**: OAuth, auto-post saved workouts (with muscle-breakdown image), per-workout opt-out, one-way.
- Calories: computed by platform/watch, never in-app.

## Native niceties
- Haptics on logging path; OS share-sheet depth beyond Web Share API; contacts-based friend discovery (only if social ever ships); iMessage stickers (no).

## Notifications, install & wake-lock (from M12 web build)
The web PWA (M12) ships permission handling + a service-worker-local notification path; the in-page blip and the thin web-push sender were deleted with the rest countdown (2026-07-31, `docs/DECISIONS.md`), leaving `push_subscriptions` and the subscribe path in place but no sender. What the native shell should upgrade:
- **Native push** via APNs (iOS) / FCM (Android) through the Capacitor Push Notifications plugin, replacing web-push. More reliable delivery, background scheduling for timed alerts (the web build cannot schedule a delayed push without a persistent server job), and no VAPID key management.
- **iOS PWA push caveat** (why native matters): web push on iOS Safari only works once the PWA is installed to the Home Screen and is flaky in the background — the settings copy already says "install to Home Screen first". Native removes this entirely.
- **Reliable keep-awake**: v1 uses the Web Wake Lock API (auto-released when the tab hides); a native shell should hold a real screen-on lock for the duration of an active session.
- **Background rest stopwatch**: rest is an up-counting stopwatch with no target and no end event, so the web build's foreground `setInterval` simply stops advancing when the app is suspended; a native shell can keep it running (and surface it on the lock screen) without inventing a target to fire at.
- **Richer sounds**: per-event volumes (rest / set-complete / PR) and custom alert tones; the web build ships **no** logging-path sounds at all today (`lib/sound.ts` was deleted with the rest countdown).

## Explicitly rejected (not backlog)
- Social pillar (feed/follows/likes/comments/discover/leaderboards) — scope decision 2026-07-14.
- Hevy Coach analog (trainer platform), HevyGPT/LLM integrations — scope decision 2026-07-14 (generator stays rule-based).
- Paywall/Pro gating of any kind.
- Garmin (Hevy itself can't — partner API closed).
