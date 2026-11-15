# clarity final brand: build spec for `brand.html` and the record of the final system

- **Phase:** planning only. This is the final brand plan, awaiting Oliver's approval to record. It changes nothing in the app, `assets/`, `DECISIONS.md`, any project doc or `.lavish/`. Until Oliver approves a decision, the app keeps today's orange and `0px` corners (D-009, D-028, D-194 and the rows in §6).
- **Author:** Pi worker, model `claude-opus-5-5`. Started Thu 2026-10-29 00:37 PDT; finished Thu 2026-10-29 00:59 PDT.
- **Brief:** Oliver, 2026-10-29 12:35 AM: "Can we finalize all of our branding plans? Is there any other branding stuff that we need to do? I just want to get that finalized right now." (`FEEDBACK.md`, last entry.)
- **Sources:** `FEEDBACK.md` (authoritative, later entries win), `SPEC.md`, `CORNERS-SPEC.md`, `COLORS-4-SPEC.md`, `LOGO-SPEC.md`, `LOGO-2-SPEC.md`, `scratch/colors-4/colors4.json`, `scratch/corners/systems-output.md`, `scratch/logo-2/final.json` and `final/`, `assets/icons/round/`, the project records listed in §6, `src/app/globals.css` (read only), and the `better-colors` skill (`palette-structure.md`, `token-naming.md`, `contrast.md`).
- **Generated numbers:** every hex, contrast ratio and APCA value below comes from `scratch/brand-final/tokens.mjs`, which imports round 1's `scratch/colors/lib.mjs`. It writes `tokens.json` (everything), `tokens.css` (primitives plus four semantic theme blocks) and `tokens.md` (all tables, including all 188 checks). Rebuild: `cd docs/brand-exploration/scratch/brand-final && node tokens.mjs`. `probe.mjs` is the probe used to choose the success hue and the three night lifts.
- **Labels:** **REC** = recommendation. **RISK** = known caveat. **EXEC** = instruction for the `brand.html` executor. **CHOICE** = Oliver decides. **WORK** = just needs doing.

All paths are relative to `/Users/Ollie/Documents/Code/because/docs/brand-exploration/` unless absolute.

---

## 1. One-screen summary (page copy, near word for word)

> **clarity is a calm study coach for the week before an exam.** The brand should feel like a clean desk: warm paper, near-black ink, one soft color, no clutter.
>
> - **Two colors, your pick.** Fern green `#afcfab` and Cornflower blue `#acc6ec`. Same lightness and strength, different hue. Students switch between them. Each theme builds its tints, hovers and night accents from its own hue only.
> - **Day and night.** Day is warm paper `#fcf9f4` with ink `#211816`. Night is Graphite `#191513` with warm white text. At night, most buttons are paper-white; "New subject" keeps the theme color, and the "Ask a question" popover button is white.
> - **Sidebar.** Day uses a "Hue whisper" tint of the theme color. It sits flush to the edge. A focus mode hides it; you bring it back from the left edge or a button.
> - **Shape.** No lines anywhere except a 1px line on text fields. Corners on the Base 8 scale (4, 8, 12, 16, 24). Nested corners follow outer = inner + gap when the gap is 12px or less. Smooth corners where the browser supports them. Chips and the send button sit on the scale, not pills.
> - **Type.** Geologica only, with the sharp `SHRP 100` cut.
> - **Icons.** Phosphor Regular plus clarity's 14 round custom icons.
> - **Logo.** The W2 wordmark `clarıty` with a perfect-circle focus dot, plus the mark: a ring in front of a circle, with stripes cut at Geologica's 27.36° slash. All three colorways ship: E3 (deep tile), E4 (night tile), E5 (light tile), plus night. The ring's white is the paper `#fcf9f4`.
> - **Homepage.** The first screen stays full color.
> - **Voice.** A clear, calm study coach. Short, plain, spoken. No hype, no praise, no slogans in the app.
>
> **Still to settle:** headline, illustrations, favicon at 16px, the default theme, and a trademark search. See "What's left".

---

## 2. Final token sheet

### 2.1 How the ramps are built (and the step-9 honesty note)

- **Structure.** Radix-style 12-step role ramps (`palette-structure.md`): one warm neutral, one accent per theme (Fern, Cornflower), each with a separate day and night ramp that reuses the same step numbers. Then two status ramps (danger, success) of 4 roles each. There is **no warning ramp**: no current clarity surface shows a warning state (the app states errors, uncertainty uses `Cannot verify` text, and saving failures use danger). Add one only when a screen needs it.
- **Pinned, not snapped.** Every value Oliver has already seen is pinned exactly, and the other steps are built around it in OKLCH at the theme's constant hue (142° Fern, 258° Cornflower). Pins: day 2 = Hue whisper sidebar, 3 = soft fill, 5 = active row, **9 = the brand color**, 11 = the deep tone; night 3 = night field (also the logo night tile), 5 = night active row, 9 = night accent, 11 = night link. Unpinned steps hold the hue and keep chroma lowest at the ends.
- **Honest step 9.** Fern and Cornflower are **pale solids** (82% lightness). In Radix terms they are "bright" scales like Sky, Mint, Lime or Amber: step 9 is lighter than step 8 and **takes dark text**. Ink `#211816` on Fern is 10.22:1 and on Cornflower 9.98:1. Paper-white text on step 9 would fail, so it's never allowed. That also means **step 8 is darker than step 9** in day mode. The ramp is pinned to the colors Oliver locked, not bent into a textbook shape. The cost: day ΔE jumps from step 7 to 8 (13.1) and from 10 to 11 (33.5). Both jumps are deliberate: 8 is the strong border/focus tone, and 11 is the text tone.
- **Night is its own ramp,** not the day ramp flipped. Its accent sits at `oklch(77% 0.075 H)`, its fields are charcoal tinted toward the hue, and its vividness is lower at the dark end.
- **Neutral.** A warm ramp from paper `#fcf9f4` to ink `#211816`, shared by both themes. The hue drifts from 80° at the paper end to 33° at the ink end. That drift is inherited from today's ink and kept on purpose: it's what makes the ink read as warm brown-black instead of grey. **RISK (LOW):** `better-colors` prefers a constant neutral hue. The drift is barely visible (C ≤ 0.021).
- **Three night values were lifted from round 4** so that APCA passes as well as WCAG (all three already passed WCAG):
  - night secondary text `#b7b0a8` → `#c4bcb4` (Lc −59.2 → −65.0 on the page);
  - night 1px field line `#77706b` → `#867f79` (Lc −26 → −32.9 on the surface);
  - night danger `#e77f78` → `#f2a39c` (Lc −48.6 → −61.8).
  These are small, visible only side by side, and keep the round 4 look.
- **Gamut:** every value is inside sRGB. Three chroma trims, all on status steps: danger-day-1 and success-day-3/4 (listed in `tokens.json.fits`).

### 2.2 Fern (green theme)

| step | Radix role | day | night | clarity use |
| --- | --- | --- | --- | --- |
| 1 | page background | `#fafcfa` | `#10140f` | spare (page is the neutral paper) |
| 2 | subtle background | **`#f0f7ef`** pin | `#141a13` | day sidebar (Hue whisper) |
| 3 | component background | **`#e0f1de`** pin | **`#182316`** pin | day selection, soft fill; night homepage field, logo night tile |
| 4 | component hover | `#d8ebd6` | `#1f2c1d` | accent hover on soft fills |
| 5 | active / selected | **`#d0e5cd`** pin | **`#263525`** pin | active sidebar row (day and night) |
| 6 | subtle border | `#c4dcc1` | `#2f402c` | spare (no lines) |
| 7 | border | `#a8c8a4` | `#3b5138` | spare (no lines) |
| 8 | strong border / focus | `#79a274` | `#537350` | chart/progress empty-on-accent, if ever needed |
| 9 | solid fill | **`#afcfab`** pin | **`#99c195`** pin | **the brand.** Homepage field (day), New subject, chips; night focus ring, mark, logo night circle |
| 10 | solid hover | `#a1c49d` | `#add1a9` | hover on step 9 |
| 11 | low-contrast text | **`#386134`** pin | **`#a3cb9e`** pin | links, `clarity` speaker label, W2 dot, progress, E3 tile |
| 12 | high-contrast text | `#1a2f17` | `#dfecdd` | spare (text stays neutral ink) |

### 2.3 Cornflower (blue theme)

| step | Radix role | day | night | clarity use |
| --- | --- | --- | --- | --- |
| 1 | page background | `#fafcfe` | `#0f1318` | spare |
| 2 | subtle background | **`#f0f5fd`** pin | `#131921` | day sidebar (Hue whisper) |
| 3 | component background | **`#e0ecfe`** pin | **`#17202d`** pin | day selection, soft fill; night homepage field, logo night tile |
| 4 | component hover | `#d7e6fc` | `#1e2837` | accent hover on soft fills |
| 5 | active / selected | **`#cedff9`** pin | **`#263142`** pin | active sidebar row |
| 6 | subtle border | `#c2d6f3` | `#2d3b4f` | spare |
| 7 | border | `#a6c0e5` | `#394b66` | spare |
| 8 | strong border / focus | `#7797c7` | `#516a8e` | spare |
| 9 | solid fill | **`#acc6ec`** pin | **`#97b6e4`** pin | **the brand** (same jobs as Fern 9) |
| 10 | solid hover | `#9fbbe4` | `#abc8f2` | hover on step 9 |
| 11 | low-contrast text | **`#365684`** pin | **`#a0c0ee`** pin | links, speaker label, W2 dot, progress, E3 tile |
| 12 | high-contrast text | `#192941` | `#dee9f9` | spare |

Full OKLCH for every step is in `scratch/brand-final/tokens.md`. "Spare" steps exist so the ramp is complete. Per `better-colors`, nothing should consume them until a role needs them, and the semantic tier (§2.6) doesn't.

### 2.4 Warm neutral (both themes)

| step | role | day | night | clarity use |
| --- | --- | --- | --- | --- |
| 1 | page | **`#fcf9f4`** paper | **`#191513`** Graphite | page; day paper is also the logo ring white |
| 2 | subtle | **`#f7f1e8`** | **`#1f1b18`** | quiet bands, night sunken field |
| 3 | component | **`#f3ece0`** | **`#221e1c`** | day quiet panel (no longer the sidebar); night surface (cards, composer, menus) |
| 4 | hover | **`#ece5da`** sand | `#292421` | hover, secondary button, learner message |
| 5 | active | `#e6dfd4` | **`#2f2a27`** | pressed state |
| 6 | subtle border | `#dcd7ce` | `#383330` | reserved; the brand uses no lines |
| 7 | border | `#c4bdb3` | `#514c48` | reserved |
| 8 | strong border | **`#8a8276`** | `#867f79` | **the one 1px field line** |
| 9 | solid | `#786c63` | `#958e88` | disabled text |
| 10 | solid hover | `#6b5d56` | `#a49d96` | spare |
| 11 | low-contrast text | **`#5d4f4a`** muted | `#c4bcb4` | secondary text, placeholder |
| 12 | high-contrast text | **`#211816`** ink | **`#ece7df`** | primary text |

Fixed extras (not ramp steps, inherited from round 4): day surface `#fffefb` (cards, composer, fields), day primary button `#251d1a` (hover `#3d332f`), night sidebar panel `#13100e`, night white button `#e2ddd5` (hover `#f5f1ec`, text `#191513`).

### 2.5 Status

| ramp | mode | bg-subtle | border | solid | text | text on solid |
| --- | --- | --- | --- | --- | --- | --- |
| danger | day | `#ffefee` | `#f6c2bd` | `#a52a24` | `#a52a24` | paper `#fcf9f4` |
| danger | night | `#321a18` | `#6c3531` | `#f2a39c` | `#f2a39c` | `#191513` |
| success | day | `#e3f6f6` | `#a5d5d5` | `#016869` | `#036262` | paper `#fcf9f4` |
| success | night | `#0e2626` | `#225050` | `#6bcac9` | `#77cfcf` | `#191513` |

- **Success is teal (hue 195°), not green.** That's 53° from Fern and 63° from Cornflower, and it's much darker and stronger than either brand color (ΔE 35.8 from Fern). The green theme no longer reads as "correct", and success never reads as "the brand button".
  - **RISK:** next to Fern's deep link tone `#386134`, success `#016869` is only ΔE 7.7 (clearly different side by side, close-ish alone). Rule: success is **always** paired with an icon and words (`better-colors`, "color is never the only signal").
- **Where success may appear (and where it may not).** It's for system facts only: `Saved at {time}`, `Transcript confirmed`, an upload finished. It must **never** mark an answer correct, color a `Correctness` observation, or show progress. clarity doesn't grade, so there's no "right answer green" (BRAND-VOICE.md: no scores, no mastery).
- Danger hue 28° stays as rounds 1 to 4. It's 114° from Fern and 130° from Cornflower.

### 2.6 Semantic tokens (what components use)

Grammar from `token-naming.md`: `--color-{role}-{variant}-{state}`. `accent` = the theme color; `primary` only means "most prominent of its group". Components never use a ramp step directly.

| token | green day | green night | blue day | blue night | job |
| --- | --- | --- | --- | --- | --- |
| `--color-bg-page` | `#fcf9f4` | `#191513` | `#fcf9f4` | `#191513` | canvas |
| `--color-bg-subtle` | `#f7f1e8` | `#1f1b18` | `#f7f1e8` | `#1f1b18` | quiet band |
| `--color-bg-surface` | `#fffefb` | `#221e1c` | `#fffefb` | `#221e1c` | cards, composer |
| `--color-bg-raised` | `#fffefb` | `#221e1c` | `#fffefb` | `#221e1c` | menus, dialogs, popovers (+ shadow-3) |
| `--color-bg-sunken` | `#fffefb` | `#1f1b18` | `#fffefb` | `#1f1b18` | text fields |
| `--color-bg-sidebar` | `#f0f7ef` | `#13100e` | `#f0f5fd` | `#13100e` | sidebar (Hue whisper by day) |
| `--color-bg-hover` | `#ece5da` | `#292421` | `#ece5da` | `#292421` | hover on quiet controls, progress track |
| `--color-bg-active` | `#e6dfd4` | `#2f2a27` | `#e6dfd4` | `#2f2a27` | pressed |
| `--color-bg-message-learner` | `#ece5da` | `#292421` | `#ece5da` | `#292421` | the learner's bubble |
| `--color-bg-scrim` | `rgb(33 24 22 / .32)` | `rgb(0 0 0 / .56)` | same | same | dialog backdrop |
| `--color-text-primary` | `#211816` | `#ece7df` | `#211816` | `#ece7df` | body text |
| `--color-text-secondary` | `#5d4f4a` | `#c4bcb4` | `#5d4f4a` | `#c4bcb4` | captions, provenance |
| `--color-text-placeholder` | `#5d4f4a` | `#c4bcb4` | same | same | field placeholder |
| `--color-text-disabled` | `#786c63` | `#958e88` | same | same | disabled labels (exempt from contrast) |
| `--color-text-inverse` | `#fcf9f4` | `#191513` | same | same | text on ink/white |
| `--color-text-on-accent` | `#211816` | `#191513` | `#211816` | `#191513` | text on step 9 (always dark) |
| `--color-text-link` | `#386134` | `#a3cb9e` | `#365684` | `#a0c0ee` | links |
| `--color-accent-text` | `#386134` | `#a3cb9e` | `#365684` | `#a0c0ee` | `clarity` label, accent words |
| `--color-accent-mark` | `#386134` | `#99c195` | `#365684` | `#97b6e4` | W2 dot, progress fill, the logo dot on paper |
| `--color-accent-solid` | `#afcfab` | `#99c195` | `#acc6ec` | `#97b6e4` | New subject, chips, selected chip |
| `--color-accent-solid-hover` | `#a1c49d` | `#add1a9` | `#9fbbe4` | `#abc8f2` | hover on the above |
| `--color-accent-field` | `#afcfab` | `#182316` | `#acc6ec` | `#17202d` | homepage first screen |
| `--color-accent-bg-subtle` | `#e0f1de` | `#263525` | `#e0ecfe` | `#263142` | text selection, highlight |
| `--color-accent-bg-selected` | `#d0e5cd` | `#263525` | `#cedff9` | `#263142` | active sidebar row |
| `--color-action-primary-bg` | `#251d1a` | `#e2ddd5` | `#251d1a` | `#e2ddd5` | the one primary action per view; "Ask a question" popover; send |
| `--color-action-primary-bg-hover` | `#3d332f` | `#f5f1ec` | `#3d332f` | `#f5f1ec` | hover |
| `--color-action-primary-text` | `#fcf9f4` | `#191513` | `#fcf9f4` | `#191513` | its label |
| `--color-action-secondary-bg` | `#ece5da` | `#292421` | same | same | secondary buttons |
| `--color-action-secondary-text` | `#211816` | `#ece7df` | same | same | its label |
| `--color-border-field` | `#8a8276` | `#867f79` | same | same | **the only line**: 1px on text fields |
| `--color-border-focus` | `#251d1a` | `#99c195` | `#251d1a` | `#97b6e4` | focus ring |
| `--color-border-subtle` | `#dcd7ce` | `#383330` | same | same | reserved (forced-colors, tables in docs) |
| `--color-danger-*` | §2.5 | | | | `bg-subtle`, `solid`, `text`, `text-on-solid` |
| `--color-success-*` | §2.5 | | | | same four |

Switching: one attribute pair on `<html>`: `data-theme="green|blue"` and `data-mode="day|night"`. The CSS (`tokens.css`) is four blocks, `[data-theme][data-mode]{--color-*…}`. Per `better-colors`, use **one** mechanism: `prefers-color-scheme` only sets the *initial* `data-mode` (in an inline head script), and the toggle overwrites it. Also set `color-scheme: light|dark` from the same attribute.

**Night buttons (Oliver's correction, applied):**
- "New subject" = `accent-solid` (theme color, `#99c195` / `#97b6e4`, dark text 9.0 / 8.75:1).
- "Ask a question" popover = `action-primary` (white `#e2ddd5`, text 13.42:1).
- **REC for the undecided rest:** every other primary action at night is white (`action-primary`). Secondary stays `action-secondary`. Only "New subject" and selected chips carry the theme color, so color still means "this is yours", not "press me". By day, primary is ink and "New subject" is the theme color too (ink text on Fern, 10.22:1), which keeps day and night consistent.

### 2.7 Radius, spacing, shadow, focus, motion

**Radius (Base 8, from `scratch/corners/systems-output.md`).**

| token | px | used by |
| --- | --- | --- |
| `--r-0` | 0 | flush sidebar edge, full-bleed bands, images inside a box with a large gap |
| `--r-xs` | 4 | checkbox (20), badge (20), chips 24 to 28, tooltip; progress segment 3 (capped at half its 6px height) |
| `--r-sm` | 8 | every 32 to 52px control: buttons, icon buttons, fields, select, nav item, menu item, segmented item, 32 to 36 chips, **send/attach 44×44**, source quote band, inner card |
| `--r-md` | 12 | 56px button, learner message, menu (= item 8 + 4), segmented control (= item 8 + 4) |
| `--r-lg` | 16 | card, **composer (= send 8 + gap 8)**, toast (= button 8 + 8), tight card (= field 8 + 8), nested outer card |
| `--r-xl` | 24 | dialog, sheet (the cap for content surfaces) |
| `--r-full` | 9999 | only avatar, radio, status dot, number badge and toggle (track 12, thumb 10 + 2) |

- **Nesting rule:** outer = inner + gap only when the gap is ≤ 12px (gap includes the outer border). Over 12px, use each surface's own token, with outer ≥ inner. Unequal gaps: use the smaller one. No radius may exceed half the element's shorter side.
- **Smooth corners:** `corner-shape: squircle` inside `@supports (corner-shape: squircle)`, on scale corners only (class `.rc`), never on `r-full`. Plain round must look right on its own (Safari and Firefox). **RISK:** whether focus outlines follow `corner-shape` is unverified.
- **Plug and play (Oliver's question).** Yes. Smooth corners are one rule (`.rc{corner-shape:squircle}` under `@supports`) and chips/send shape is one token (`--r-chip`, `--r-send`, defaulting to the scale). Change one line to switch site-wide. **REC:** keep the scale. Pills make the composer a capsule (30px corners) that looks blobby at 3 lines.

**Spacing (4px grid, unchanged roles):** `4, 8, 12, 16, 24, 32, 40, 48, 64` (`--space-1/2/3/4/6/8/10/12/16`). Groups in a panel: 24px apart. Sections: 40px. Controls stay at least 44px tall (`--control-min-size`).

**Shadow (no lines means depth comes from tone and shadow):**
- day `--shadow-1` `0 1px 2px rgb(59 41 33 / .06), 0 1px 1px rgb(59 41 33 / .04)` (cards);
- day `--shadow-2` `0 2px 6px rgb(59 41 33 / .06), 0 8px 24px rgb(59 41 33 / .08)` (composer, floating);
- day `--shadow-3` `0 2px 6px rgb(59 41 33 / .06), 0 16px 40px -8px rgb(59 41 33 / .18)` (menus, dialogs, popover);
- night versions in `tokens.css`. At night a shadow barely shows, so tone does the work (surface `#221e1c` on page `#191513`).

**Focus ring:**
- `outline: 2px solid var(--color-border-focus); outline-offset: 2px`;
- inset items (menu, segmented, nav) use `outline-offset: -2px`;
- fields and the composer: the 1px line turns `border-focus` and the ring appears (`:focus-within`);
- **night white buttons:** the ring is the theme color on the 2px offset over the Graphite page (7.91 to 9.0:1). It touches the white button at only 1.49 to 1.53:1, so it must never sit flush on the button.

**Motion:**
- `--dur-fast 150ms` for color and fill; `--dur-base 200ms` for menus and dialogs (fade plus a 4px rise); `--dur-sidebar 220ms` for the focus-mode slide;
- easing `cubic-bezier(0.2, 0, 0, 1)`;
- no bounce, no loops, no confetti; motion confirms an action and never celebrates;
- `prefers-reduced-motion`: crossfade only, and the theme switch changes instantly.

### 2.8 Contrast checks: WCAG 2.x and APCA

- **188 required checks** across 4 theme combinations, the logo and the wordmark. Thresholds: body text WCAG 4.5 / APCA Lc 75; labels 4.5 / Lc 60; large text (≥ 24px) 3 / Lc 45; UI parts and graphics 3 / Lc 30. APCA is computed with the 0.0.98G-4g constants; the absolute value is compared.
- **Failures: 2, both known and accepted.** The E5 ring (paper on light tile): 1.66:1 / Lc −31.9 (blue) and 1.62:1 / Lc −30.5 (green). It fails WCAG 3:1 (APCA's Lc 30 passes narrowly). Oliver accepted it in logo round 2. Rule in §3.5: E5 needs a context where the ring isn't the only thing identifying the mark.
- **Tightest passes by role (minimum across all four combinations):**

| pair | min WCAG | min APCA \|Lc\| | threshold |
| --- | --- | --- | --- |
| primary text on every background (page, sidebar, surface, hover, selection, learner message) | 10.54 | 84.6 | 4.5 / 75 |
| secondary text (page, surface, sidebar) | 7.15 | 65.0 | 4.5 / 60 |
| link / accent text (incl. on active row) | 5.39 | 62.1 | 4.5 / 60 |
| text on accent-solid (New subject, chips) and its hover | 8.75 | 62.3 | 4.5 / 60 |
| homepage headline and body on the field | 9.98 | 70.3 | 4.5 / 60 |
| primary button text (day ink, night white incl. Ask a question), and hover | 11.67 | 85.2 | 4.5 / 60 |
| secondary button text | 12.47 | 89.3 | 4.5 / 60 |
| the 1px field line (surface, page, sidebar) | 3.47 | 32.9 | 3 / 30 |
| focus ring over page, surface, sidebar and field | 7.91 | 59.8 | 3 / 30 |
| W2 dot / progress fill on page; progress fill vs its track | 5.73 | 58.9 | 3 / 30 |
| danger text, success text, and text on their solids | 6.28 | 61.8 | 4.5 / 60 |
| placeholder in a field | 7.76 | 65.5 | 4.5 / 60 |
| E3 circle on tile, E5 circle on tile | 4.21 | 51.8 | 3 / 30 |
| E3 ring 6.83, E4 ring 15.49, night ring 15.49, night circle 7.91 | ≥ 6.83 | ≥ 59.8 | 3 / 30 |
| **E5 ring on tile** | **1.62** | **30.5** | **3 / 30, FAILS WCAG, accepted** |

- **Informational (not required):** the night focus ring directly on the white button is 1.49 to 1.53:1, which is why the offset rule exists.
- **Not checked:** rendered pairs in a real browser (alpha scrims, shadows, text over illustrations), Windows forced-colors, and the 1px field line inside a selected (accent) row. Every value here is computed from declared tokens. Per `better-colors`, the rendered check is `Not verified`.

---

## 3. Usage rules

### 3.1 Color

1. **One theme color per screen, used for "yours and current":** the homepage field, New subject, selected chips, the active row, selection, the W2 dot, progress and links (via step 11). Nothing else is colored.
2. **One filled primary action per view.** It's ink by day and white at night. Peers are secondary (sand).
3. **Theme color is never text on paper.** Use step 11 (`accent-text`) for colored words. Step 9 always takes dark text.
4. **Never mix themes on one screen.** The only exception is the theme switch's own swatches.
5. **Status color never stands alone.** It always comes with an icon plus words. Success is for system facts only and never for answers.
6. **No gradients in UI.** Marketing art may use flat fields of the theme's own ramp only.
7. **Danger stays red** in both themes. No other red, pink or orange anywhere. Orange is retired.

### 3.2 Corners

1. Read the radius from the element's height band (§2.7 table), then apply the nesting rule.
2. Square only where something touches the screen edge (flush sidebar, full-bleed bands).
3. Pills and circles only for things that are round by convention (avatar, radio, toggle, status dot, number badge).
4. Smooth corners come from `.rc` only, never inline.

### 3.3 Surfaces (no lines)

1. **No borders or dividers.** Separate with space (24px in a panel, 40px between sections), tone steps (page → subtle → surface → raised) and soft shadow.
2. **Exactly one line:** `1px solid var(--color-border-field)` on text inputs, selects and textareas. The composer is a field, so it gets it too.
3. Learner messages sit on `bg-message-learner`. Assistant text is unboxed.
4. The sidebar is a tone (Hue whisper by day, `#13100e` at night), never a line. It's flush to the edge.
5. **Focus mode:** a control hides the sidebar entirely. To bring it back, hover a 12px left-edge zone (desktop, after about 150ms), press the visible "Show sidebar" button (top left, 44px), or use a keyboard shortcut (REC `Ctrl/⌘ + \`; needs a collision check). The choice is remembered per device.
6. Forced-colors mode: restore system borders on cards and buttons (`@media (forced-colors: active)`), because tone separation disappears there.

### 3.4 Icons

1. **Phosphor Regular only** (1.5px at 24px), 20px in nav and 18px inline. Today's code mixes 9 Bold, 4 Fill and 1 Light uses (counted in `src/` by grep); move them all to Regular. Fill is allowed only for a toggled-on state that also has a text label.
2. **Custom round set** (`assets/icons/round/`, 14 icons) for clarity's own ideas: study, materials, branch, recall, explain, teach-back, exam date, time, progress, resume, help, finish, source, send. Same stroke, `currentColor` and the 24 grid.
3. Icons take `text-primary` or `text-secondary`, never the theme color, except the active nav icon (`accent-text`).
4. **RISK:** the round set's 2.5px box corners still need checking next to 32px icon buttons at radius 8 (Oliver's corner answer 7).

### 3.5 Logo (the mark)

- **Geometry:** fixed (LOGO-2-SPEC §2). Never redraw, stretch, rotate, outline, add effects or recolor outside the table below. Use the dedicated 16 and 32px drawings at those sizes, never a shrunk 1024.
- **Clear space:** at least **25% of the tile side** on every side (256 units on the 1024 grid). The tile is the mark's boundary. Without a tile (reversed or black, transparent), the clear space is the ring's radius (255 units).
- **Minimum sizes:** 16px (favicon drawing) and 24px for any in-product tile. The 180px drawing is for touch icons; 1024 is the master.
- **Which colorway where (REC):**

| colorway | tile / ring / circle | use it for | don't |
| --- | --- | --- | --- |
| **E3** deep tile | step 11 / paper / step 9 | **the default mark**: app icon, apple-touch, PWA, favicon in day, social card | n/a |
| **E4** night tile | night field / paper / step 9 | dark or busy surfaces: night-mode favicon, dark slides, merch, the night social card | small light-UI spots, where it reads as "night" |
| **E5** light tile | step 9 / paper / step 11 | large, soft, decorative use: the homepage field, posters, stickers, marketing tiles ≥ 64px | anything under 64px, favicons or any tab (ring 1.6:1) |
| night | night field / `#fcf9f4` ring / night step 9 | in-app at night | day UI |
| black / reversed | mono | print, fax, embossing, single-color | colored backgrounds |

- **Theme following:** in the app, the mark follows `data-theme`. The shipped app icon is one file. **REC:** E3 blue (CHOICE in §5).
- **Grayscale:** the meaning (ring in front of a solid circle, with stripes) survives in black alone. Check this whenever the art changes.

### 3.6 Wordmark (W2)

- `clarıty` set in Geologica **740**, `SHRP 100`, letter-spacing **−0.035em** (−3.5 at 100), with a **perfect-circle dot** (`cx 189.42, cy 31.95, r 9.95` in 0.01em units) over a dotless ı.
- **Always lowercase.** Never `Clarity` or `CLARITY` in the logo, including at the start of a sentence in display use.
- **Colors:** letters in `text-primary`; the dot in `accent-mark` (step 11 by day, night step 9 at night). On the brand field, the dot is **ink** (deep on the field is only 4.21:1).
- **Minimum size:** 16px cap height on screen (about 24px font size); below that, use plain text `clarity`.
- **Clear space:** the height of the `c` all round.
- **Lockup:** mark + W2 in the header (mark at 1.1× the x-height, 0.3em gap); W2 alone in running headers; plain text `clarity` in sentences.
- **For files** (OG, favicons with text, email), outline the text. A webfont can't be relied on there.

### 3.7 Type

- Geologica only, with fallbacks `"Avenir Next", "Segoe UI", Arial, sans-serif`. Axes: `SHRP 100`, `CRSV 0`, `slnt 0`.
- Weights: 410 body, 600 labels and buttons, 700 headings, 740 to 760 display and wordmark.
- Body 16/1.55; Study messages 18/1.6; caption 13 to 14; title 28; display `clamp(40px, 6vw, 72px)` at −0.04em.

### 3.8 Motion

See §2.7. Also: the theme or mode switch crossfades colors over 200ms (instant with reduced motion), and the focus-mode sidebar slides over 220ms.

### 3.9 Voice (from `/Users/Ollie/Documents/Code/because/BRAND-VOICE.md`, unchanged)

- A clear, calm study coach: what happened, what it means, one next step. Talk to "you"; use "we" only for real product actions.
- Sentence case, US English, contractions, plain verbs. Short, but vary sentence length so it sounds spoken.
- Always lowercase `clarity`. Labels `You` and `clarity`. Exact fixed labels: `Your supplied question`, `Your selected passage`, `AI understanding check`, `Correctness`, `Reasoning`, `Clarity`, `Help used`. Also `Cannot verify` and `Sources disagree`.
- **Banned:** unlock, elevate, seamless, journey, transform, revolutionary; generic praise; slang, jokes, emojis and therapy talk; puns on "because"; empty triads; slogans and `Not X but Y`; em and en dashes; mastery percentages, grades and scores; claims that clarity learns from your material.
- **Marketing headlines** (§5.1) must obey the same rules. BRAND-VOICE.md bans "slogans" in product copy; one homepage headline is allowed (it already has `Learn it by teaching it.`). A tagline stays plain and true, never a promise of outcomes.

---

## 4. Asset inventory

### 4.1 Exists now

| asset | path | state |
| --- | --- | --- |
| Mark, all colorways and sizes (38 SVG) | `scratch/logo-2/final/clarity-{E3,E4,E5}-{blue,green}-{16,32,180,1024}.svg`, `clarity-night-{blue,green}-{…}.svg`, `clarity-{black,reversed}-{16,32,1024}.svg` | final; ring white `#fcf9f4`; generator `scratch/logo-2/page.mjs` |
| Mark geometry | `scratch/logo-2/final.json` | final |
| W2 wordmark | inline SVG in `scratch/logo-2/page.mjs` (`wm()`), live Geologica text | final shape; **not outlined** |
| Round icons (14) | `assets/icons/round/clarity-*.svg`, bundled in `assets/icons/icons.js` | final |
| Square icons (14) | `assets/icons/square/` | retired (the corner choice makes them unused) |
| Font | `assets/fonts/Geologica-variable-latin.woff2` + OFL (same as `public/fonts/`) | final |
| Social card layout | `og()` in `scratch/logo-2/page.mjs` (1200×630) | approved look; SVG only |
| Spot illustrations (hand-built SVG, **orange**) | `assets/ai/spot-*.svg`, `mark-*.svg`, `og-background.svg`, `favicon-concept.svg` | **superseded colors**; AI generation failed (quota) |
| Tokens | `scratch/brand-final/tokens.{json,css,md}` | final, pending approval |
| Screens of today's app | `assets/screens/*.png` | reference only |

### 4.2 Still to produce (all WORK, after approval)

| asset | spec | source |
| --- | --- | --- |
| `favicon.ico` | 16 + 32 + 48 multi-size, E3 blue | 16/32 drawings; 48 from the 1024 |
| `icon.svg` | E3 blue 32 drawing, plus a `prefers-color-scheme: dark` swap to night blue inside the SVG | Next metadata `src/app/icon.svg` |
| `apple-icon.png` | 180×180, E3 blue, full bleed (iOS masks it) | `clarity-E3-blue-180.svg` |
| PWA icons | `icon-192.png`, `icon-512.png`, `icon-512-maskable.png` (mark inside the 80% safe zone) | 1024 master |
| `manifest.webmanifest` | `name: "clarity"`, `short_name: "clarity"`, `theme_color` `#fcf9f4`, `background_color` `#fcf9f4`, icons above | new `src/app/manifest.ts` |
| `viewport.themeColor` | `[{media:"(prefers-color-scheme: light)", color:"#fcf9f4"}, {media:"(prefers-color-scheme: dark)", color:"#191513"}]` (today it's a single `#fbf9f5`) | `src/app/layout.tsx` |
| OG / Twitter images | 1200×630 PNG ×4: green day, blue day, green night, blue night; ship blue day as default `opengraph-image.png` | `og()` layout, outlined text |
| Outlined W2 | `clarity-wordmark-{ink,paper}.svg` with paths, plus the dot as a `<circle>` | fontTools outline (`outlines.py` pattern) |
| Lockup files | mark + W2, horizontal, day and night | n/a |
| Illustrations ×7 | empty study set, exam countdown, curious beginner, recall, resume, OG background, empty Materials, redrawn in Fern **and** Cornflower ramps (steps 3, 5, 9, 11 plus neutral ink), day and night | see §5.2 |
| Brand book | `brand.html` (§8) | this spec |
| Square icon set | delete or archive (WORK, Oliver's OK) | n/a |

---

## 5. What's left to finalize the brand

| # | item | type | recommended answer |
| --- | --- | --- | --- |
| 1 | Headline and tagline | **CHOICE** | §5.1: **"Know it before the exam."**, with tagline "Study from your own notes, one question at a time." |
| 2 | Illustrations | CHOICE (style) + WORK | Flat geometric spots built from the mark's language: circles, the 27.36° stripe and the theme ramp. No figures or faces. Commission or hand-build 7 in both themes. |
| 3 | Favicon | **CHOICE** (confirm) | **E3 at 16px** (dedicated drawing). It reads as "a ring in front of a circle"; the stripes become texture. Not E5. |
| 4 | Success color | CHOICE (confirm) | **Teal `#016869` / night `#6bcac9`**, system facts only, never answers. |
| 5 | Theme switch place and default | **CHOICE** | Account menu → `Appearance` (mirrored in Settings), not in first-run. **Default: Blue** (calmer, daytime). The app icon is E3 blue either way. |
| 6 | Dark mode | CHOICE (approve build) | **Follow the device by default**, with a 3-way control `Match my device \| Day \| Night`. Remembered per device. |
| 7 | Trademark search | **CHOICE** (to fund/do) + WORK | Run a USPTO knockout search for "clarity" in classes 9, 41 and 42 before any public launch. Expect a crowded field; plan on keeping the name and leaning on the mark plus lowercase W2. |
| 8 | Lowercase "clarity" | CHOICE (confirm) | **Keep lowercase** everywhere, including sentence starts in UI. Legal text may use "clarity" in quotes. |
| 9 | Night button rule for the rest | CHOICE (confirm) | White for every primary action; theme color only for New subject and selected chips. |
| 10 | Which app-icon theme ships | CHOICE | One icon, **E3 blue**; the in-app mark follows the theme. |
| 11 | Retire the square icon set and orange AI SVGs | WORK | Archive them in `docs/brand-exploration/` history; never ship them. |
| 12 | Record the decision | CHOICE (approval) | §6 draft. Nothing changes in the app until it's recorded. |
| 13 | Theme-preference learning (vote, A/B) | Later CHOICE | Out of scope. Needs its own privacy, consent and sample-size decision. |

### 5.1 Headline and tagline options

Checked against BRAND-VOICE.md: no hype words, no outcome promise, no praise, no em dashes, no `Not X but Y`, no pun on "because", sentence case, and lowercase `clarity`. The homepage rule is "lead with the teaching promise; invite the student to explain; do not promise an outcome". But the app now starts with exam setup and recall (D-167), so today's headline only fits part of the flow (flagged since SPEC.md §9).

| # | Headline | Tagline (sub-line) | Note |
| --- | --- | --- | --- |
| H1 | Learn it by teaching it. | clarity is a curious beginner. Explain your material and answer one question at a time. | Today's line. True to teach-back, but skips recall and the exam. |
| **H2 (REC)** | **Know it before the exam.** | **Study from your own notes, one question at a time.** | Names the moment (exam week) and the method, and states a goal, not a guaranteed result. RISK: "know it" could read as a promise; the sub-line keeps it to method. |
| H3 | Your notes. Your exam. One question at a time. | clarity asks, you answer, and you decide when you're done. | Calm and specific. RISK: three fragments is close to an "empty triad". |
| H4 | Study what's actually on your exam. | Add your slides and notes. clarity asks you about them, one question at a time. | Most literal; good for search and ads. |
| H5 | Find the parts you don't know yet. | clarity quizzes you from your own material, and explains only when you ask. | Honest about gaps and on-brand (curious, not grading). |
| H6 | Explain it back. See what's missing. | Recall, then teach back the parts you're unsure of. | Covers the D-167 flow in six words. |
| H7 | A calm way to study the night before. | Your material, your pace, one question at a time. | Leads with the feeling. RISK: "night before" may read as cramming. |

**REC: H2.** Keep H1 as the in-app teach-back heading (`Teach it to clarity.` already exists). **Recommended tagline for OG, the app store and the meta description:** "Study from your own notes, one question at a time." Replace the current meta description ("Keep your questions, sources, answers, and saved place together.") in the same copy change.

### 5.2 Illustrations: what "more work" means

- **Problem:** the 7 hand-built spots in `assets/ai/` are orange, outline-heavy, and Oliver said they need more work. Hand-built figures are hard to get right.
- **REC direction (CHOICE):** drop figures. Build every spot from the brand's own shapes: circles, rings, the 27.36° stripe, rounded sheets on the corner scale, and flat fills from the theme ramp (day steps 3, 5, 9 and 11 plus ink; night steps 3, 5 and 9 plus `#ece7df`). There are no outlines (the no-lines rule), and each spot gets one accent shape.
- **Set:** empty study set, exam countdown, recall, resume, explain, empty Materials, OG background. Each comes in 2 themes × 2 modes. They're built from tokens, so the theme switch recolors them with no extra files.
- **Option:** AI generation (nano-banana) failed on quota last time and costs money. It needs Oliver's spend approval first. Geometric SVG needs no spend.

---

## 6. Draft decision record (DRAFT ONLY: not written to any file)

### 6.1 Proposed rows

EXEC (for `brand.html`): show these verbatim in a `.note` card titled `Draft decision, not recorded`.

> **| D-212 | PROPOSED; clarity brand system (color, shape, type, icons) | 2026-10-29 PDT |** Replace the orange identity with two user-switchable themes, Fern `#afcfab` (green) and Cornflower `#acc6ec` (blue), each built from its own hue in the token sheet `docs/brand-exploration/scratch/brand-final/tokens.css`. Use a warm paper `#fcf9f4` and ink `#211816` neutral, a Hue whisper day sidebar, ink primary actions by day and paper-white primary actions at night, except that "New subject" uses the theme color. Use a teal success color for system facts only. Replace exact `0px` corners with the Base 8 scale (4/8/12/16/24): outer = inner + gap for gaps of 12px or less, smooth corners where supported, chips and the send button on the scale, pills only for round-by-convention controls. Use no lines except a 1px text-field line. Keep the sidebar flush, and add a focus mode that hides it, revealed from the left edge or a button. Keep Geologica at `SHRP 100`, Phosphor Regular plus the round custom icons, the full-color homepage first screen, visible focus and 44px targets. Supersedes the orange and `0px` clauses of D-009, D-028, D-051, D-052, D-056, D-057, D-062, D-065, D-095, D-101, D-103, D-105, D-106, D-139, D-140, D-142, D-143, D-170, D-191, D-193, D-194, D-195, D-196, D-197, D-198, D-199 and D-205, and nothing else in them. Grants no AI, spending, learner-data, provider, Git, deployment or release authority. **|** Oliver's direct messages 2026-10-28/29 in `docs/brand-exploration/FEEDBACK.md`; approval quote to be added. **|**

> **| D-213 | PROPOSED; clarity logo and wordmark | 2026-10-29 PDT |** Adopt the W2 wordmark `clarıty` (Geologica 740, `SHRP 100`, perfect-circle dot) and the mark from `docs/brand-exploration/scratch/logo-2/final/` (a ring in front of a circle, stripes at 27.36°, ring white `#fcf9f4`) in all three day colorways, E3, E4 and E5, plus night, black and reversed, under the usage rules in `BRAND-FINAL-SPEC.md` §3.5. Ship one app icon, E3 blue [CHOICE]. Favicon: E3 at 16px [CHOICE]. Supersedes D-009's "Reserve `b/c` only as a possible future mark". **|** Oliver's direct message 2026-10-29 12:35 AM ("go with all three"); approval quote to be added. **|**

> **| D-214 | PROPOSED; night mode and theme switch | 2026-10-29 PDT |** Build a Graphite night mode (`#191513`) for both themes. By default it follows the device, with an `Appearance` control in the account menu and Settings: `Color: Blue | Green` [default CHOICE] and `Mode: Match my device | Day | Night`, remembered on that device only. Supersedes D-009's "light-first" clause and the forced `color-scheme: light`. Syncing the choice to an account, or learning which theme students prefer, needs a separate decision. **|** Oliver's round 2/3 color feedback, 2026-10-28; approval quote to be added. **|**

- **Why three rows:** they can be approved separately. D-212 can land without dark mode; D-214 is the biggest build. Number them only when Oliver approves, and use the next free numbers at that moment (D-211 is the last today).
- **Superseded rows stay ACTIVE** for their other clauses. Change each status to e.g. `ACTIVE; orange/0px clauses superseded by D-212`, following the D-193 pattern. Only rows whose sole purpose was geometry or orange become fully `SUPERSEDED`: **D-194** (fully: its whole purpose was `0px`), and **D-105** (fully: orange accents on Study).
- **D-193 note:** its shared sidebar, left-edge reveal and Ask-a-question flow stay. Only its orange accents go (its rounded geometry was already superseded by D-194, and D-212 brings back a defined scale).

### 6.2 Same-change corrections (exact lines, for the executor who records the decision)

All are under `/Users/Ollie/Documents/Code/because/`. Line numbers are from 2026-10-29 00:50 PDT and may move; match on the quoted text.

| file:line | current text (start) | correction |
| --- | --- | --- |
| `AGENTS.md:32` | "Treat the orange synthesis, orange top navigation, and local application construction as approved under `D-028`." | "Treat local application construction as approved under `D-028`; the brand is D-212/D-213/D-214." |
| `AGENTS.md:76` | "Enforce D-194: use exactly `0px` corners for every app-controlled composer…" | "Enforce D-212: Base 8 corner scale, outer = inner + gap for gaps ≤ 12px, smooth corners where supported, no lines except the 1px field line. Keep the shared sidebar…" |
| `AGENTS.md:86` | "Keep the approved orange, fonts… D-193's shared sidebar, orange accents… D-194's exact `0px`…" | replace "orange" with "Fern/Cornflower theme" and "D-194's exact `0px`" with "D-212's corner scale" |
| `AGENTS.md:88` | "…curious-beginner behavior, and exact `0px` corners." | "…and D-212 corners." |
| `BRAND-VOICE.md:18` | "Use approved orange, near-white and near-black. D-194 requires exact `0px` corners… Use orange for meaningful active…" | "Use the approved Fern/Cornflower theme, paper and ink (D-212). Use the theme color for New subject, the active row, selection, progress and the wordmark dot." |
| `BRAND-VOICE.md:65` | "…using D-194's exact `0px` corners with no rounded-control exception." | "…using D-212's corner scale." |
| `BRAND-VOICE.md:98` | "**Headline:** Learn it by teaching it." | the chosen headline (§5.1), only after the copy choice |
| `DESIGN.md:4-26` | frontmatter `colors:` (orange, orange-dark, orange-link, chat-*) | replace with the semantic tokens of §2.6 |
| `DESIGN.md:58-67` | `rounded:` all `0px` | the §2.7 radius tokens |
| `DESIGN.md:77-119` | `button-orange`, `selection-ask` using `{colors.orange}` | `button-accent` (New subject), `button-primary` (ink/white), `selection-ask` → `action-primary` |
| `DESIGN.md:128,133,134,139,142` | "orange identity", "zero-corner controls", "Orange: `colors.orange`…" | rewrite to the two themes and the corner scale |
| `DESIGN.md:167,198` | "248px paper-warm sidebar", "orange active row and New subject action" | "248px flush Hue whisper sidebar with focus mode; theme-color New subject; accent-bg-selected active row" |
| `DESIGN.md:173,175` | "five thin orange progress segments", "darker orange hover" | "accent-mark progress segments (r 3)", "ink thumb, accent hover" |
| `DESIGN.md:179` | "Do not generalize one-off shadows into a new elevation scale." | "Use shadow-1/2/3 (D-212)." |
| `DESIGN.md:181-183` (Shapes) | "D-194 restores… exactly `0px`…" | the Base 8 rule, nesting, smooth corners, pills list |
| `DESIGN.md:188,194,195,202` | "0px control corners", "orange-dark ring", "enabled send is orange" | corner tokens; focus `border-focus`; send = `action-primary` |
| `DESIGN.md:209,210,216` | Do/Don't: "orange identity", "exactly `0px` corners", "Don't import rounded corners" | "Do use the corner scale and the nesting rule; Don't add lines or pills" |
| `PRODUCT.md:19` | "Keep the approved palette… D-194's exact `0px` app-controlled corners…" | "…D-212's palette and corner scale…" |
| `PRODUCT.md:32` | "zero-corner controls… visible orange accents" | "scale-cornered controls… theme-color accents" |
| `README.md:37-44` | section "Zero-corner brand correction — D-194" | add one line at the top: "Superseded by D-212 (not yet implemented)." Leave the history intact. |
| `README.md` (top) | (new) | a new short section "Brand system, D-212/213/214" with status "recorded, not implemented" |
| `.pi/memory/product-preferences.md:8` | "…preserving clarity's orange, Geologica, exact square corners…" | "…preserving clarity's Fern/Cornflower themes, Geologica, the Base 8 corner scale…" |

Also in the same change (not docs, but the guard would fail): `tests/site/brand-corners.test.ts` asserts `--radius-*: 0px` and the `border-radius: 0px !important` rule. Rewrite it as a D-212 guard in phase 2 (§7), not in the decision change.

---

## 7. App implementation plan (phased; after approval only)

**Ownership first (blocking).** The working tree has 509 uncommitted entries from other workstreams, including `src/app/globals.css`, `src/app/layout.tsx`, `src/components/ui/{button,checkbox,dialog,select,sheet,textarea}.tsx`, `src/components/site/{app-shell,site-header}.tsx`, all the core docs and `DECISIONS.md` (`git status --porcelain`, read only). Before phase 1:
- read `HANDOFF.md` and any active worker reports;
- confirm with the lead which lane owns each dirty file;
- one writer per file;
- never revert, reformat or commit others' changes (no Git actions are authorized).

| phase | goal | files touched (`src/`, read-only survey) | checks | risks |
| --- | --- | --- | --- | --- |
| **0. Record** | D-212/213/214 approved and written; §6.2 doc corrections | `DECISIONS.md`, `AGENTS.md`, `DESIGN.md`, `BRAND-VOICE.md`, `PRODUCT.md`, `README.md`, `.pi/memory/product-preferences.md` | text diff review; no contradiction left (grep `orange`, `0px`) | the docs are dirty from other lanes; merge by hand |
| **1. Tokens** | `tokens.css` primitives + semantic blocks added beside the old vars; old names (`--orange`, `--accent`, `--paper-warm`…) aliased to new semantics so nothing breaks | `src/app/globals.css` (`:root` and `@theme inline`) | TypeScript; `vitest run tests/site`; compute contrast from declared tokens (re-run `tokens.mjs`) | Tailwind v4 `@theme inline` names become utilities; keep the `--color-*` namespace clean |
| **2. globals.css shape** | remove `border-radius: 0px !important`; add the radius tokens, `.rc` + `@supports (corner-shape)`, the shadow scale, focus rules, forced-colors borders | `src/app/globals.css`; rewrite `tests/site/brand-corners.test.ts` as a D-212 guard | grep for any leftover `!important` radius; unit guard | the global `!important` reset currently hides 52 files' local radius rules, so **removing it reveals them**. Audit every `border-radius` hit first (`grep -rlE "border-radius|--radius" src` = 52 files) |
| **3. Components** | buttons, fields, chips, menus, dialogs, composer/send, nav rows, messages, progress, popover on semantic tokens and the corner table; Phosphor → Regular | `src/components/ui/{button,input,textarea,select,checkbox,dialog,sheet,tabs,skeleton,loading-surface,scroll-area,home-loading}.*`; `src/components/site/{app-shell,app-navigation,account-menu,site-header,demo-details,study-data-controls,quiet-interruption,account-*}.*`; `src/features/cram/*.module.css` (composer, chat-layout, chat-workspace, message-actions, selection-question, branches/*, primer, session-recap, study-entry, pending-reply, drawing-attachments, study-loading); `src/features/onboarding/*` (20 files); `src/features/plan-study/*`, `homepage/*`, `marketing/*`, `pricing/*`, `review/*`, `access/*`, `lock-in/*`, `study/*`; `src/app/account/account.module.css`; `src/app/auth/clerk-appearance.ts`, `clerk-profile-appearance.ts` (Clerk `colorPrimary` is `var(--orange-dark)` today); error/loading pages under `src/app/*` that name orange | 69 files reference orange and 329 raw color literals sit in 20 files: grep to zero raw literals outside `globals.css`; focused vitest; whole TypeScript; scoped ESLint; a private preview pass in all 4 combinations | biggest phase; Clerk prebuilt UI must read the new vars; D-170's machine speaker value stays `because` |
| **4. Logo and favicon** | W2 wordmark component; mark component (unique mask IDs); metadata icons; manifest; OG images; `themeColor` pair | `src/lib/brand.ts` (add mark/wordmark refs), new `src/components/site/brand-mark.tsx`, `src/components/site/app-shell.tsx`/`site-header.tsx` (header lockup), new `src/app/icon.svg`, `apple-icon.png`, `favicon.ico`, `manifest.ts`, `opengraph-image.png`, `twitter-image.png`, `src/app/layout.tsx` (viewport, metadata description) | Next metadata files resolve (Next 16 conventions read in `node_modules/next/dist/docs/01-app/01-getting-started/02-project-structure.md`); 16px tab check in Chromium, Safari and Firefox | exporting ICO/PNG needs a rasterizer (`sharp` is installed); W2 must be outlined for files |
| **5. Theme switch** | `Appearance` panel (Color, Mode), inline pre-paint head script reading `localStorage` (no flash), `data-theme`/`data-mode` on `<html>` | `src/app/layout.tsx`, `src/components/site/account-menu.tsx` (+ css), `src/app/account/settings/*`, new `src/lib/appearance.ts` | no flash on reload; storage failure falls back to memory; keyboard and screen reader labels | device-local only; syncing to the account is learner data and needs a separate decision |
| **6. Dark mode** | night blocks live; `color-scheme` follows the mode; Mode default follows the device | `globals.css`, every component from phase 3 that still has a light-only literal, Clerk appearance, scrollbars, `::selection` | full night pass, all routes, 4 combinations; APCA and WCAG on rendered pairs; forced colors | images and illustrations need night versions; Clerk's own dark handling |
| **7. Focus mode** | hide the sidebar; reveal via a 12px left-edge hover zone, the "Show sidebar" button and a shortcut; remembered per device | `src/components/site/app-shell.tsx` (+ module css), `app-navigation.tsx`, `src/features/cram/chat-layout.module.css` | keyboard-only reveal; no hover-only trap; touch has the button; reduced motion | homepage already has a left-edge reveal (D-193); share one implementation |
| **8. Illustrations** | 7 token-driven SVG spots in both themes and modes; replace orange art | `src/features/homepage/*`, `src/components/ui/home-loading.*`, onboarding empty states, `src/features/marketing/*` | visual review by Oliver; alt text; night versions | needs the §5.2 style choice first; AI art needs spend approval |

- **Build-phase budget (D-182):** per phase, run only startup, TypeScript, the focused guard and a private preview. **Deferred to prelaunch:** full suites, E2E, desktop/phone browser sweeps in 4 combinations, an independent review, real-device favicon checks and Safari/Firefox smooth-corner fallback. Before any public or production launch, all of these, plus the trademark search, are required.
- **Rollback:** phases 1 to 2 keep the old variable names as aliases, so reverting the alias block brings orange back. Each phase is a separate reviewable diff.

---

## 8. Page design: `brand.html`

### 8.1 Technical rules (EXEC)

- **One file:** `docs/brand-exploration/brand.html`. Build it from a generator `scratch/brand-final/page.mjs` (pattern: `scratch/logo-2/page.mjs`). Don't hand-edit the HTML.
- **Self-contained:** inline `<style>` and `<script>`. The only local references allowed are `assets/fonts/Geologica-variable-latin.woff2` (via `@font-face`) and `assets/icons/icons.js`, both relative and both already used by logo-2/colors-4. Better: inline the 14 round icon SVGs from `icons.js` so the page has no script dependency. **No external URLs:** no CDN, `fetch()`, web font service, analytics or link to an `http(s)` page. The only `http` text allowed is an SVG `xmlns`.
- **Data:** import `scratch/brand-final/tokens.json` and `scratch/logo-2/final.json` in the generator. Paste `tokens.css` verbatim into the page `<style>`. Draw marks with a copy of `mark()`/`tile()` from `scratch/logo-2/page.mjs` (with a unique mask-ID counter), so the page never retypes geometry.
- **Look:** reuse logo-2's chrome exactly: `.wrap` 1240px, `.stick` + `.topnav`, `.tag`, `.note`, `.card`, `.grid2/.grid3`, tables, Geologica `SHRP 100`, h1 `clamp(40px,6vw,72px)`. Then add colors-4's sticky `.bar` with the switches below.
- **Switches (sticky bar, `role="region" aria-label="Page switches"`):**
  - `Color: Blue | Green` (default `Blue`) sets `data-theme` on every `.dir` mock and the page accents;
  - `Mode: Day | Night` (default `Day`) sets `data-mode`; in Night the page chrome goes Graphite (`body[data-page=night]`, using the night neutral ramp, not colors-4's grey `#2a2a2a`);
  - `Corners: Plain | Smooth` (disabled with a note if `CSS.supports("corner-shape","squircle")` is false).
  - Buttons are `aria-pressed`. State lives in `localStorage` key `clarity-brand-final-state` (`{theme, mode, smooth}`), in memory if storage throws. A live caption reads `Showing Blue, day.`
- **Status label:** a tag `Final plan · awaiting approval` next to the nav wordmark. Under the h1: `This is the final brand plan, awaiting Oliver's approval to record. Nothing in the app has changed.` In the footer: the same plus the build date.
- **Printable:** `@media print`: hide `.stick` and `.bar`; render all four combinations side by side wherever the screen shows one (print shows Blue day + Green day by default and adds the night pair as a second row); `break-inside: avoid` on cards; no shadows; links print their `#id`. Expose a `Print` button in the bar (`window.print()`).
- **Accessibility:** one h1, one h2 per section, labelled controls, visible focus (the §2.7 ring), `prefers-reduced-motion` (no re-theme transition), mocks `role="img"` with an `aria-label` (e.g. `Study screen, Blue, night`), and color swatches with hex as text.
- **Copy:** BRAND-VOICE.md rules (sentence case, no em dashes, no hype); lowercase `clarity`. Mock copy reuses round 4: `Calc II: series`, `ratio test`, `Exam in 4 days`, `3 of 8 topics recalled`, `Message clarity`, `clarity can be wrong. Check it against your sources.`, `Pick up where you left off.`
- **Responsive:** two columns over 1000px, one below; wide tables in `.scrollx`.

### 8.2 Nav

`Summary · Logo · Color · Type · Shape · Surfaces · Icons · Components · Voice · Assets · What's left · Decision · Plan`. Right side: links to `logo-2.html`, `colors-4.html`, `corners.html`, `index.html`.

### 8.3 Sections in order

1. **Summary** (`#summary`). h1 `clarity's brand`. Then the §1 text, a 4-up strip of the Study mock (Blue day, Blue night, Green day, Green night, fixed and not following the switch), and a "Settled" chip list.
2. **Logo** (`#logo`).
   - The mark in E3, E4, E5 and night for the current theme at 200px, with the 64/32/16 rows under each.
   - The black and reversed versions.
   - The W2 wordmark at 96px and 32px on paper, on the brand field (ink dot) and at night.
   - The lockup.
   - A clear-space diagram (a dashed 25% box drawn on a 240px tile, the page's only dashed line, labelled "Guide only").
   - A minimum-sizes row (16, 24, 32, 64).
   - The §3.5 "Which colorway where" table, with the E5 contrast fail labelled `Known: ring 1.6:1, accepted`.
3. **Color** (`#color`).
   - Two 12-step ramps (current theme, day and night rows), each swatch showing step, hex and role, with pins marked by a small dot.
   - The neutral ramp.
   - Status swatches.
   - The step-9 note (§2.1) in a `.note`.
   - The semantic token table (§2.6), filtered to the current theme with a `Show both` toggle.
   - The checks summary table (§2.8), with `188 checks, 2 known failures (E5 ring)`.
4. **Type** (`#type`). A Geologica specimen at 410/600/700/760 with `SHRP 100`, plus the scale table (§3.7) and sample `Know it before the exam.` at display size.
5. **Shape** (`#shape`).
   - The radius token row, drawn as boxes at each radius.
   - The size-band table.
   - Three nesting demos (composer + send 16/8, menu + item 12/8, dialog 24 with card 16).
   - A plain vs smooth tile pair at 16px.
   - The pills list.
6. **Surfaces** (`#surfaces`).
   - The tone stack page → subtle → surface → raised with shadows.
   - The "one line" field demo.
   - A focus-ring demo (tab into it), including the night white-button offset case.
   - The sidebar: whisper vs page, plus a focus-mode mock (sidebar hidden, a 12px edge zone shaded on hover, the "Show sidebar" button).
7. **Icons** (`#icons`). All 14 round icons at 24 and 20 in `text-primary`. Do not draw or fetch Phosphor icons (no external assets); state the Phosphor rule in text. Show the round icons inside 32px and 44px icon buttons at radius 8.
8. **Components** (`#components`).
   - Buttons: primary, secondary, New subject (accent) and danger, in default, hover, focus and disabled.
   - A field with its 1px line, a chip set, a segmented control, a toggle, a progress bar, a learner and assistant message pair, the composer with send, the "Ask a question" popover, a toast with success (`Saved at 9:41 PM.`) and an error with danger.
   - The homepage first-screen mock.
   - All of it follows the switches.
9. **Voice** (`#voice`). §3.9 as do/don't cards plus the fixed labels list.
10. **Assets** (`#assets`). The §4.1 and §4.2 tables, with a thumbnail where the asset is an SVG we have (marks, icons); illustrations shown as `Needs redraw` tags, with no images.
11. **What's left** (`#left`). The §5 table as cards: CHOICE cards first with an ink `Your call` tag (no amber or orange anywhere on the page), WORK cards second with a sand `Just work` tag. The headline options as a table, with the REC row highlighted using `accent-bg-subtle`.
12. **Decision draft** (`#decision`). `.note` titled `Draft decision, not recorded`: D-212, D-213 and D-214 verbatim (§6.1), the superseded list as chips, and the §6.2 table collapsed in `<details>`.
13. **Plan** (`#plan`). The §7 table as a numbered phase list with an ownership warning card first.

Footer: `Final brand plan, awaiting Oliver's approval to record. Built {date}. Nothing in the app has changed.`

### 8.4 Executor checks (minimal)

- Use `node page.mjs` from `scratch/brand-final/`, then a file:// Playwright check modelled on `scratch/logo-2/check-page.mjs`, all network routes aborted, wrapped in `(node check.mjs & pid=$!; (sleep 60; kill $pid) & wait $pid)`. Expect:
  - 0 page errors, 0 blocked requests, 0 `http(s)` `src`/`href`;
  - 1 h1 and 13 h2;
  - Geologica loaded;
  - every switch combination renders (count `.dir[data-theme=blue][data-mode=night]` > 0 after toggling);
  - a print-media screenshot.
- Screenshots: summary, logo, color (both themes), components (night), and the print view.

---

## 9. Watch-outs

- **Step 9 is pale.** Anyone used to "white text on brand" will get it wrong. The semantic token `text-on-accent` is always dark; add a lint/guard in phase 1.
- **Success vs Fern deep** is ΔE 7.7. Always pair it with an icon and words, and never use it for answers.
- **E5** fails ring contrast; keep it ≥ 64px and decorative.
- **Removing the global `0px !important`** will surface dozens of old local radius rules at once (phase 2).
- **Two themes × two modes** means 4× the visual QA, plus 4 OG images and 2 illustration sets.
- **Cornflower vs LinkedIn blue** (ΔE 9.6 on the colored action tone; rival hexes are unverified) feeds the trademark/brand-confusion check.
- **Not verified:** rendered contrast in browsers, Safari/Firefox, real devices, `corner-shape` focus outlines, ICO/PNG export, trademark.
