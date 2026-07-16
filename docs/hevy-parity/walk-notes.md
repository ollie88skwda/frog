# Hevy web-app walk notes (feature-parity reference)

Read-only walk of the signed-in Hevy **web** app (`hevy.com`), account `ollie88skwda`, 2026-07-14. Captured with headless Chromium at 1440×900. Purpose: inventory the web UI for an SBL parity build and flag where the **web** app differs from the mobile taxonomy in `docs/hevy-parity/hevy-master-spec.json` (which describes the iOS/Android app).

Screenshots referenced below live under
`/private/tmp/claude-502/-Users-Ollie-Documents-Code-sbl/5074eb6e-0488-4551-976f-65fcaa4042c3/scratchpad/hevy/shots/`
(filenames in `[shot: …]`). Raw text/JSON dumps are in the sibling `walk/` dir.

---

## 0. Headline: what the web app is (and is not)

The web app is a **read / analyze / manage-templates** surface, not a logging surface. Confirmed across the walk:

- **You cannot start or log a live workout on the web.** No "Start Empty Workout", no "Start Routine" button anywhere, no active-session screen, no Save-Workout screen. The entire mobile-spec cluster *Active workout*, *Workout finish*, *Post-save summary* has **no web equivalent**.
- **Trainer is mobile-only** — the `/trainer` page is a stub that tells you to download the app.
- **No Measures / progress photos, no body heat map, no muscle-distribution stats** anywhere on web.
- Web **adds** two things the mobile spec under-weights: a **Developer / API-key** settings pane, and an explicit **Theme (Light/Dark)** setting.

So SBL parity should treat the web spec as: browse exercises + their history/charts, view/edit routine templates, view saved workouts + a social feed, a slim profile with one chart + a calendar, slim settings, and billing.

---

## 1. Global shell / navigation

Persistent **left sidebar** (not a bottom tab bar). Top to bottom:

- `Feedback` (link, top-left, above nav)
- **Feed** → `/` (home)
- **Routines** → `/routines`
- **Exercises** → `/exercise`
- **Trainer** → `/trainer`
- **Profile** → `/profile`
- **Settings** → `/settings`
- **Unlock** → `/plans` (upsell button; present on every screen)
- Current username `ollie88skwda` pinned at the top of the content column.

**Difference vs mobile spec:** mobile uses a 4-item bottom tab bar (Home / Workout / Exercises / Profile) where Exercises is nested under Profile and routines under the Workout tab. Web promotes **Routines** and **Exercises** to their own top-level nav items and exposes **Settings** as a peer nav item (mobile reaches Settings via a gear icon inside Profile).

---

## 2. Home / Feed — `/` `[shot: 01-home.png]`

Center column is a vertical feed of workout **posts**. Right rail carries profile + discovery.

**Feed card fields** (each links to `/workout/<id>`):
- Poster username + avatar, absolute timestamp (`Jul 12, 2026, 7:14 AM` — note: absolute date, not "2h ago" relative time)
- Session name (`fbeod 💔🥀`)
- **Duration** (`1h 30m`)
- **Volume** (`11,800 lbs`)
- **Records** (count, e.g. `1`)
- Exercise summary lines: `1 set Chest Fly (Machine)`, `2 sets uni tricep extension`, then `See 8 more exercises`
- Two trailing numeric counters (likes / comments, both `0` here) and a **Post** button (opens a comment input)

**Right rail:**
- Mini profile card: `Workouts 192`, `Followers 0`, `Following 0`, `See your profile`
- **Latest Activity** — most recent workout title + date
- **Suggested Athletes** — list of users each with a **Follow** button (`runningdry`, `prairieboy_mb`, `rissa88`, …)

**Differences vs mobile spec:**
- No **Following / Discover** toggle on web — the mobile "Home (Following)" ⇄ "Discover" selector is absent; web shows one feed (own + followed).
- No media carousel / video-in-feed, no average-heart-rate line, no per-card share-arrow observed (this account has no media posts, so media rendering is unconfirmed, but the like/comment affordances are plainly reduced to two counters + a Post button).
- Timestamps are absolute datetimes rather than "time since completion".

---

## 3. Routines list — `/routines` `[shot: 02-routines-list.png]`

Routines are grouped into **folders**, each folder header showing a count:
- `anterior/posterior (2)` → routines `anterior`, `Posterior`
- `upper/lower (2)` → routines `fbeod 💔🥀`, `Upper C`
- `My Routines (0)` — ungrouped bucket at the bottom

Each routine card previews its name + a comma-joined exercise-name list. Cards link to `/routine/<id>`.

Action buttons: **New Routine**, **New Folder**.

**Differences vs mobile spec:** the mobile routines list puts a **Start Routine** button on every card (launches live logging). Web has **no Start Routine** control (consistent with "no logging on web"). No visible per-card three-dots menu (Share / Duplicate / Delete) in the list; management appears to live inside the routine detail instead.

---

## 4. Routine detail — `/routine/<id>` `[shot: 24-routine-detail.png]`

Read-only template view (opened `fbeod 💔🥀`, `/routine/ftsbKcOAWfQ`).

**Per-exercise row:**
- Exercise name
- `N set · X reps` — set count + rep target. Rep **ranges** render as `2 sets · 6-7 reps`; fixed targets as `1 set · 5 reps`.
- **Rest** timer prescription per exercise: `Rest 2m 0s`, `Rest 1m 0s`, `Rest 2m 30s`, `Rest 3m 0s`

**Footer:** `Created by ollie88skwda`, buttons **Edit Routine** and **Copy Routine Link**.

**Right panel — "Routine Summary":**
- `Exercises 15`
- `Total Sets 18`
- `Estimated Duration 47m`
- **Muscle → Sets** breakdown table with fractional attribution (an exercise's sets split across primary/secondary muscles): `Shoulders 4.5`, `Biceps 3.5`, `Upper Back 3.5`, `Triceps 3`, `Lats 2.5`, `Hamstrings 2`, `Chest 2`, `Forearms 1.5`, `Abdominals 1`.

**Refines the spec:** the routine template encodes **sets + rep target (single or range) + per-exercise rest time**, and Hevy computes a **per-muscle set volume with fractional weighting** — useful for SBL's own routine-summary + weekly-set-per-muscle features. Note "Estimated Duration" is derived (sets × rest + work estimate).

---

## 5. Exercise library — `/exercise` `[shots: 04-exercise-list.png, 27-exercise-inputs.png]`

Two-pane layout: **left = library list**, **right = detail** (empty state: `Select Exercise — Click on an exercise to see statistics about it.`).

**Left-rail filter controls:**
- `Library` / `Custom Exercise` — toggle between the full catalog and the user's own customs
- `All Equipment` — equipment filter (custom dropdown; options render in a portal, not enumerated in this walk)
- `All Muscles` — muscle-group filter (custom dropdown)
- **`Search Exercises`** free-text input (confirmed via the input's placeholder)
- Section header `All Exercises`

**List rows:** exercise name + its **primary muscle** label underneath. Custom exercises appear **inline** in the same alphabetical list, tagged with a `Custom` line (e.g. `funny mundy curls · Biceps · Custom`, `weird trap abductor thing · Traps · Custom`, `uni tricep extension`, `kelso shrugs`, `quinton press`, `keenan flap`, `top half curl for brachioradialis`).

**Muscle taxonomy observed on web** (the label under each exercise): Abdominals, Abductors, Adductors, Biceps, Calves, Cardio, Chest, Forearms, Full Body, Glutes, Hamstrings, Lats, Lower Back, Neck, Other, Quadriceps, Shoulders, Traps, Triceps, Upper Back.

**Difference vs mobile spec:** the mobile spec says list order is "recently logged first, then custom, then the rest." **On web the list is plain alphabetical** with customs interleaved — no "recently logged" priority band. Selecting a row navigates to `/exercise/<HEXID>` (e.g. Chest Fly (Machine) = `/exercise/78683336`).

---

## 6. Exercise detail — `/exercise/<id>`

Right pane after selecting an exercise. Header: exercise name, `Equipment: <type>`, `Primary Muscle Group: <muscle>`. Then a **3-way segmented control**:

### `Statistics` tab `[shots: 20-ex-chestfly-statistics.png (populated), 07-ex-curl-a-default.png (empty)]`
- A single range label **`Last 12 weeks`** at the top (no functioning range-selector dropdown surfaced during the walk — see note below).
- **Three fixed line charts**, top to bottom, each with a headline record above the plot:
  - **Weight** → `Heaviest Weight` (e.g. `280 lbs`)
  - **One Rep Max** → `Best One Rep Max` (e.g. `339.7 lbs` — estimated 1RM)
  - **Set Volume** → `Best Set Volume` (e.g. `2,585 lbs`)
- X-axis = dates across the window; Y-axis = weight ticks.
- **Empty state** (custom exercise, no data): each chart shows `No data yet.` over a placeholder axis (`30 / 40 / 50 / 60 / 70`).

### `History` tab `[shot: 21-ex-chestfly-history.png]`
Reverse-chronological list of every session containing this exercise. Each entry:
- Workout title + datetime (`fbeod 💔🥀 · Jul 12, 2026, 7:14 AM`)
- A mini table with columns **`SET` | `LBS x REPS`**, rows formatted `F  280 lbs x 5` (leading badge = set-type indicator; every set on this account reads `F`, i.e. Failure).

### `How to` tab `[shot: 21-ex-chestfly-how-to.png]`
Numbered text instructions (`1.` … `5.`). Text only — no animation/GIF observed on web.

**Differences vs mobile spec (this is the biggest divergence):** the mobile "Exercise detail" Summary tab is much richer. Web is **stripped down**:
- Mobile has **tappable metric chips** (Heaviest Weight, One Rep Max, Best Set Volume, **Session Volume, Total Reps**, plus type-specific ones like Most Reps / Best Time / Best Pace / Longest Distance). **Web shows only 3 fixed charts** (Weight, One Rep Max, Set Volume) — no Session Volume, no Total Reps, no cardio/duration metrics, no chip switching.
- **No Records panel** with deep-links to the PR workout.
- **No Set Records table** (heaviest weight per exact rep-count).
- **No Strength Level** cohort section.
- **No Leaderboard tab** at all (mobile has a Pro leaderboard).
- **No share icon.**
- The range is pinned to **`Last 12 weeks`** (≈ the free-tier 3-month graph cap; no Pro range switcher exposed on this free account). Treat "Last 12 weeks" as the free-tier fixed window.

---

## 7. Profile — `/profile` `[shot: 08-profile.png]`

Single scrolling page that **merges** several mobile screens into a slim web view:
- **Header:** avatar, username (×2), **Edit Profile** button.
- **Stat row:** `Workouts 192`, `Followers 0`, `Following 0`.
- **Statistics widget:** a `Duration` / `Reps` metric toggle, a big current value (`1h 30m`) labelled `This week`, a `Last 12 weeks` range label, and one line chart (x-axis dated `Apr 26 → Jul 12`, y-axis `0 hr … 5 hr`).
- **Own workout feed:** the same card format as Home (`fbeod 💔🥀`, Duration/Volume/Records, `See 8 more exercises`, like/comment counts, `Post`).
- **Calendar:** month grid (`July 2026`, `S M T W T F S`, day numbers) — a consistency view.

**Differences vs mobile spec:** mobile separates **Calendar**, **Statistics**, **Measures**, and **Exercises** into their own Profile sub-screens with far more depth (body heat map, muscle distribution, streaks, measurements, progress photos). Web collapses this to **one duration/reps chart + a month calendar**, and drops **Measures, heat map, muscle distribution, and any streak counter** entirely. No gear icon (Settings is a top-level nav item).

---

## 8. Workout detail — `/workout/<id>` `[shot: 12-workout-detail.png]`

Read-only saved-workout view (opened `/workout/aVZfp7F8DoA`).

- **Header:** poster + datetime, session name, `Duration 1h 30m`, `Volume 11,800 lbs`, `Records 1`, and two social counters (likes / comments).
- **Per-exercise block:** exercise name, then a table with columns **`SETS` | `WEIGHT & REPS`**. Each set row = a set-type badge (`F`) + `280 lbs x 5 reps`.
- **PR annotation:** a `Best Weight` label appears against a set (the PR/record marker that drives the header "Records" count).
- **Right rail:** poster mini profile card (`Workouts 192 / Followers 0 / Following 0`).

Note the two rep formats in the product: workout detail uses `x 5 reps`, exercise-History uses `x 5`. Set-type is a single-letter badge column (`F` = Failure on this account; Hevy's full set-type set is Warm-up / Normal(numbered) / Drop / Failure).

---

## 9. Settings — `/settings` `[shots: 09-settings.png, 25-settings-*.png, 26-settings-account-pane.png]`

Left-nav list grouped into **Account**, **Preferences**, **Developer**. Panes switch via query param (`?account`, `?subscription`, `?units`, `?language`, `?theme`, `?export`, `?developer`).

**Account group:**
- **Profile** (default): `Change Picture`, `Name`, `Bio`, `Link`, **Save Changes**. (No Sex / Birthday fields — mobile has these; they drive heat-map gender + Strength-Level age cohort, both absent on web.)
- **Account** (`?account`): **Private Profile** toggle (`Off`, "other users need to request to follow you"); **Change Password** (`Current Password`, `New Password` → **Update Password**); **Delete Account** button.
- **Manage Subscription** (`?subscription`): `Current Subscription — Free Account` ("You will have free access forever"); **Change Subscription** with Monthly `$2.99` / Yearly `$23.99` / Lifetime `$74.99 Pay Once`; "Having issues with your subscription? Contact us."

**Preferences group:**
- **Units** (`?units`): `Weight Unit = lbs`, `Distance Unit = miles`, `Body Measurement Unit = inch`. (No per-exercise unit override on web — mobile has one.)
- **Language** (`?language`): `Preferred Language = English`.
- **Theme** (`?theme`): `Current Theme = 👼 Light` (Light/Dark, emoji-labelled). **Web-only setting** — mobile follows the OS theme.
- **Export Data** (`?export`): "Export your entire workout history to a CSV file. Exported workouts data can not be imported back into Hevy." → **Export Workout Data** button. **Export only; no import on web.**

**Developer group:**
- **Developer** (`?developer`): "Generate an API key to create your own ways of accessing your workout data. Use it at your own risk as we may change the project's structure or discontinue it entirely." + "Visit the official documentation for our API here." → **Generate API Key** button.

**Differences vs mobile spec:** web settings is a **small subset**. Missing entirely: workout-behavior settings, privacy (beyond Private Profile), notifications, integrations (Apple Health / Health Connect / Strava), sounds, default workout visibility, Sex/Birthday. Web **adds** the Developer **personal API key** pane (directly relevant to SBL's own token/API/MCP layer) and the Theme toggle. Delete-account on web shows only a plain button — the mobile "type your username to confirm" destructive guard was not exercised (read-only walk).

---

## 10. Plans / Unlock — `/plans` `[shot: 10-plans.png]`

Title `Pick your Hevy plan — No commitments. Cancel anytime.` Free-vs-PRO comparison table:

| Feature | Free | PRO |
|---|---|---|
| Log Unlimited Workouts | ✓ | ✓ |
| Hevy Trainer | — | ✓ |
| Unlimited Routines | **4 max** | ✓ |
| Unlimited Custom Exercises | **7 max** | ✓ |
| Measurement Tracking | **Limited** | ✓ |
| Unlimited Graph History | **3 months** | ✓ |

Plan cards: **Monthly $2.99** (Billed monthly), **Yearly $23.99** (Billed yearly), **Lifetime $74.99** (Pay once). Default selection = Yearly; primary CTA `Continue with Yearly Plan - $23.99`, secondary `Maybe Later`. Below: social proof (`4.9 Stars, 192,000 Reviews`), dated App-Store-style reviews, an FAQ accordion, and a footer (Terms / Privacy / Contact, `© 2026 Hevy Studios S.L.`).

**Confirms/refines the spec:** Monthly $2.99 / Yearly $23.99 / Lifetime $74.99 exactly (no crossed-out sticker prices shown on this account). The **free-tier caps are stated numerically here**: 4 routines, **7 custom exercises**, 3-month graph history, limited measurement tracking. Billing FAQ copy still references Apple/iTunes even in the web flow (shared copy); web checkout itself is Stripe.

---

## 11. Trainer — `/trainer` `[shot: 11-trainer.png]`

Stub page: `Trainer — Follow a guided program with progression. Available for pro users only in the mobile app. Please download the app to get started.` No functional Trainer on web.

---

## Top 5 observations that contradict / refine the master spec

1. **Web is analyze-and-manage only — no logging.** The entire live-logging pipeline (Active workout, Save Workout, Post-save summary, Start Routine, Start Empty Workout) and the whole **Trainer** feature are **absent from web**. Any SBL "web parity" scope must decide this deliberately; Hevy chose to make logging mobile-only.

2. **Exercise detail is drastically reduced on web.** Only 3 fixed charts (Weight / One Rep Max / Set Volume) + History + How-to. **No Records panel, no Set-Records table, no Strength Level, no Leaderboard, no metric chips, no Session-Volume/Total-Reps/cardio metrics, no share.** The mobile-spec's rich Summary tab does not exist on web.

3. **Profile collapses Calendar + Statistics + Measures into one slim page** — a single Duration/Reps chart plus a month calendar. **No body heat map, no muscle distribution, no Measures/progress photos, no streak counter** on web at all.

4. **Web Settings both drops and adds relative to the spec.** Dropped: integrations, notifications, workout-behavior, privacy depth, Sex/Birthday, per-exercise unit override. Added: a **Developer personal-API-key** pane and a **Light/Dark Theme** toggle (mobile follows the OS). The API-key pane is the concrete surface behind the spec's "web-generated API token."

5. **Concrete free-tier numbers, straight from the web UI.** Free caps = **4 routines, 7 custom exercises, 3-month (`Last 12 weeks`) graph history, limited measurement tracking**; Trainer is Pro-only. The exercise-library list order is **plain alphabetical with customs interleaved** (tagged `Custom`), *not* the "recently-logged-first" order the mobile spec describes. Routine templates encode **sets + rep target (single or range) + per-exercise rest**, and Hevy derives a **fractional per-muscle set count** in the routine summary.

---

## Auth / session health

All three sequential passes completed with a single Chromium context each; `hevy.com` never redirected to `/login`; `storageState` was re-saved after every run. Sections covered: **Home, Routines (+1 routine detail), Exercises (list + 3 exercise details incl. one populated, all 3 tabs), Profile, Settings (all 7 panes), Plans, Trainer, Workout detail.** No writes, no clicks on create/edit/delete/start/follow/like controls.
