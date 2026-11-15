# clarity corner lab: build spec (`corners.html`)

- Phase: **planning only**. This spec drives one static review page, `docs/brand-exploration/corners.html`. It changes nothing in the app and approves nothing. D-009 and D-194 (exact `0px` corners) still govern the app until Oliver records a new decision.
- Author: Pi worker, model `claude-opus-5-5`. Started 2026-10-28 16:56 PDT; finished 2026-10-28 17:27 PDT.
- Inputs: `FEEDBACK.md`, `SPEC.md` §3 (corner directions) and §4 L3 (no lines), `scratch/tokens.json`, `index.html` (mock CSS, `--r-*`, `data-cor`), `/Users/Ollie/Documents/Code/because/DESIGN.md`, `src/app/globals.css`, `/Users/Ollie/.pi/agent/skills/better-ui/SKILL.md` and `surfaces.md`.
- Math (Node, no libraries): `scratch/corners/systems.mjs` → `systems-output.md` (every radius below), `scratch/corners/squircle-gap.mjs` → `squircle-gap-output.txt` (nesting gaps for round vs smooth corners), `scratch/corners/calc.mjs` and `contrast-neutral.txt` (placeholder color contrast). If a number here disagrees with `systems-output.md`, the script output wins; fix this file.
- Labels: **REC** = my recommendation. **RISK** = a known caveat. **EXEC** = an instruction the executor must follow exactly.

All paths are relative to `/Users/Ollie/Documents/Code/because/docs/brand-exploration/` unless absolute.

---

## 0. What Oliver asked for (the success criteria)

From his message on 2026-10-28 (recorded in `FEEDBACK.md`):
1. Corners are consistent across sizes: **smaller things get smaller radii, bigger things get bigger radii**.
2. Nested corners follow **outer radius = inner radius + padding**.
3. Compare a base radius of **4** and **8**, picked for how easily it gives a smooth, nested look.
4. Show it on **different sizes** of buttons, inputs and everything else.

Already settled and used on this page as fixed: **no lines** except the 1px edge on text fields, the **round** custom icons plus Phosphor Regular, and **Geologica at SHRP 100**. Color is **not** settled, so this page uses a neutral placeholder (§6.2).

Today's real sizes this page must respect (from `DESIGN.md` and `globals.css`): 44px minimum targets for buttons, fields, nav rows and menu items; a 248px sidebar; Study column and composer at most 48rem (768px) wide with 24px gutters; composer text 16px on a 24px line; spacing scale 4, 8, 12, 16, 24, 32px; menu popover padding 4px.

---

## 1. The three systems

All three live on a **4px grid**: every radius is 0, 2, 3 (one 6px-tall special case), 4, 8, 12, 16 or 24px, or "full". That matters because clarity's padding is also on a 4px grid (4, 8, 12, 16, 24), so `inner + padding` always lands on a clean number.

### 1.1 Tokens

| Token | Base 4 | Base 8 | Hybrid **REC** | Plain meaning |
|---|---|---|---|---|
| `r-0` | 0 | 0 | 0 | Square |
| `r-xs` | 2 | 4 | 2 | Tiny marks: progress segments |
| `r-sm` | 4 | 8 | 4 | Small controls |
| `r-md` | 8 | 12 | 8 | Standard controls (Base 4: large ones) |
| `r-lg` | 12 | 16 | 12 | Containers |
| `r-xl` | 16 | 24 | 16 | Big surfaces: dialogs, sheets |
| `r-full` | 9999px | 9999px | 9999px | Pill or circle (only where §3 allows) |

Base 8's scale steps 4, 8, 12, 16, 24 are not all multiples of 8. "Base 8" means the **standard control radius is 8**; it still needs 4 for tiny things and 12 for "8 plus a 4px inset". A scale of only 8, 16, 24 cannot nest anything inside a 4px inset.

### 1.2 The size rule (radius from height)

Pick the band from the element's **minimum height** (for a square element, its side). Then apply the cap in §2.3 (never more than half the height).

| Band | Height | Base 4 | Base 8 | Hybrid **REC** | Examples |
|---|---|---|---|---|---|
| A | up to 12px | 2 | 4 (capped to half) | 2 | progress segment (6px) |
| B | 13 to 28px | 2 | 4 | 4 | checkbox, badge, tooltip, small chip |
| C | 29 to 36px | 4 | 8 | 4 | 32px button, 36px input, segmented item, large chip |
| D | 37 to 52px | 4 | 8 | 8 | 40/44/48px buttons, fields, nav, menu items, send |
| E | 53px and up | 8 | 12 | 12 | 56px button |

Surfaces that hold content (not controls) use fixed **surface tokens**, because their height varies with content:

| Surface token | Base 4 | Base 8 | Hybrid **REC** |
|---|---|---|---|
| Learner message (`--r-message`) | 8 | 12 | 12 |
| Source quote band (`--r-quote`) | 4 | 8 | 8 |
| Card (`--r-card`) | 8 | 16 | 12 |
| Inner card in a card (`--r-card-in`) | 4 | 8 | 4 |
| Dialog (`--r-dialog`) | 12 | 24 | 16 |

Containers that hug a control closely (menu, segmented control, composer, toast) do **not** get a token. Their radius is computed with the formula (§2), so it can never drift out of fit.

**How each feels (one line for the page):**
- **Base 4:** crisp and exact; corners you notice only up close. Closest to today's square look.
- **Base 8:** soft and friendly everywhere; small things start to look like pills.
- **Hybrid:** 8 on the 44px controls you use most, 4 on small things, 12 to 16 on containers. Soft where you touch, exact where it's small.

### 1.3 Every component, every size

Generated by `scratch/corners/systems.mjs`. Values in px.

| Component | Rule | Size | Base 4 | Base 8 | Hybrid |
|---|---|---|---|---|---|
| Button (primary, secondary, ghost) | band | 32 tall | 4 | 8 | 4 |
| Button | band | 40 tall | 4 | 8 | 8 |
| Button | band | 44 tall | 4 | 8 | 8 |
| Button | band | 48 tall | 4 | 8 | 8 |
| Button | band | 56 tall | 8 | 12 | 12 |
| Icon-only button | band | 32×32 | 4 | 8 | 4 |
| Icon-only button | band | 40×40 | 4 | 8 | 8 |
| Icon-only button | band | 44×44 | 4 | 8 | 8 |
| Text input / select (1px line) | band | 36 tall | 4 | 8 | 4 |
| Text input / select | band | 44 tall | 4 | 8 | 8 |
| Text input / select | band | 48 tall | 4 | 8 | 8 |
| Textarea | same as the 44px field (does not grow with height) | min 96 tall | 4 | 8 | 8 |
| Checkbox | band | 20×20 | 2 | 4 | 4 |
| Radio | circle, dot inside | 20, dot 8 | circle | circle | circle |
| Toggle | pill track, circle thumb | 40×24, thumb 20 | track 12, thumb circle | same | same |
| Chip / tag | band | 24 tall | 2 | 4 | 4 |
| Chip / tag | band | 28 tall | 2 | 4 | 4 |
| Chip / tag | band | 32 tall | 4 | 8 | 4 |
| Chip / tag | band | 36 tall | 4 | 8 | 4 |
| Badge (text) | band | 20 tall | 2 | 4 | 4 |
| Badge (single number) | circle | 20×20 | circle | circle | circle |
| Tooltip | band | 28 tall | 2 | 4 | 4 |
| Progress segment | band, capped | 6 tall | 2 | 3 | 2 |
| Nav item (flush sidebar) | band | 44 tall | 4 | 8 | 8 |
| Menu item | band, inset 4 | 44 tall | 4 | 8 | 8 |
| Menu | item + 4 | panel | 8 | 12 | 12 |
| Segmented item | band, inset 4 | 36 tall | 4 | 8 | 4 |
| Segmented control | item + 4 | 44 tall | 8 | 12 | 8 |
| Send / attach button | band | 44×44 | 4 | 8 | 8 |
| Composer | send + 8 (1px line + 7px padding) | min 60 tall | 12 | 16 | 16 |
| Toast button | band, inset 8 | 40 tall | 4 | 8 | 8 |
| Toast | button + 8 | 56 tall | 12 | 16 | 16 |
| Tight card (input inside, padding 8) | input + 8 | panel | 12 | 16 | 16 |
| Learner message | surface token | min 48 tall | 8 | 12 | 12 |
| Source quote band | surface token | block | 4 | 8 | 8 |
| Card | surface token (padding 16 to 24) | any | 8 | 16 | 12 |
| Nested card: inner | surface token | inset 8 | 4 | 8 | 4 |
| Nested card: outer | inner + 8 | panel | 12 | 16 | 12 |
| Dialog | surface token (padding 24) | 480 wide | 12 | 24 | 16 |
| Avatar | circle | 28 / 32 / 40 | circle | circle | circle |
| App icon tile | see §5.11 | 16 / 32 / 64 / 180 | 4 / 7 / 14 / 40 | same | same |
| Floating sidebar (comparison only) | nav + 8 | panel | 12 | 16 | 16 |

Checks in the script: all values are whole pixels; in every system button ≤ card ≤ dialog. Button radius ÷ height stays at or below 0.25 everywhere (Base 4: 0.08 to 0.14; Base 8: 0.17 to 0.25; Hybrid: 0.13 to 0.21).

Note the one structural difference: in **Base 4**, a card that wraps an inner card is 12 but a plain card is 8, so Base 4 needs two card radii. In **Base 8** and **Hybrid**, inner card + 8 equals the plain card token (16 and 12), so one card radius does both jobs. That's the clearest concrete reason a bigger base makes nesting easier (§4.3).

---

## 2. The nesting rule, made exact

### 2.1 The rule

> **outer radius = inner radius + gap**

"Gap" is the distance from the **outside edge of the outer box** to the **outside edge of the inner box** at that corner. It includes the outer box's border. Example: the composer has a 1px line plus 7px padding, so the gap to the send button is 8px, and the composer radius is `send + 8`.

**EXEC (CSS gotcha):** CSS `border-radius` is measured on the outer border edge. The inside edge of a 1px border has radius `r − 1`. That's why the gap must include the border width. Use `box-sizing: border-box` everywhere.

Why it works, in plain words: if both corners are circles that share the same center, the gap between them is the same all the way around the bend. If the outer corner is too tight, the gap bulges at the corner; if it's too round, the inner box crowds or pokes out.

The gap measured on the diagonal (for the live lab readout, round corners): `diagonalGap = gap × 1.41421 + (inner − outer) × 0.41421`. When `outer = inner + gap` this equals `gap` exactly. Verdict thresholds for the lab: `|diagonalGap − gap| ≤ 0.5` → "Even"; `diagonalGap > gap + 0.5` → "Outer corner too sharp: the gap gets fatter at the bend"; `diagonalGap < gap − 0.5` → "Outer corner too round: the inner box crowds it"; `diagonalGap < 0` → "The inner box pokes out".

### 2.2 When it applies

- **Close nesting (gap of 12px or less):** always apply the formula. The two curves are near enough that your eye compares them. This covers every inset control in clarity: menu items (4), segmented items (4), send in composer (8), toast button (8), inner cards (8), fields in a tight card (8).
- **Loose nesting (gap over 12px):** use each surface's own token. The curves are too far apart to read as a pair, and the strict formula gets blobby fast. Example: a 44px button (Hybrid 8) in a card with 16px padding would force the card to 24, and that card inside a dialog with 24px padding would force the dialog to 48. The one rule that still holds: **an outer box is never less round than the box inside it** (outer ≥ inner).
- **REC:** close nesting follows the formula exactly; loose nesting uses tokens. The lab shows a "Strict everywhere" toggle so Oliver can see the 24 and 48 version himself (§6.6).

**Unequal padding.** If a corner has different horizontal and vertical gaps (for example 12px on the side and 8px below), use the **smaller** gap in the formula. Better: build inset items with equal gaps at the corner. EXEC: the composer pins the send button 8px from the right and 8px from the bottom outer edge, so the corner gap is equal.

**Inner radius would be 0 or less.** Work from the inside out: give the inner thing its band radius, then compute the outer. If the outer is fixed and `outer − gap` is under 2px:
- If the inner thing is a control you press (button, item), **raise the outer** instead of squaring the control.
- If the inner thing is passive (an image, a color band filling the box), make it **square (0)**. A square inside a round box looks right only when the gap is at least the outer radius.

### 2.3 Caps

- **Half-height cap:** no radius is more than half the element's shorter side. At exactly half, it's a pill (or a circle if square). The page applies this in the script with `Math.min(r, h / 2)`; browsers also shrink overlapping radii on their own, but don't rely on it.
- **Formula vs cap.** If `inner + gap` exceeds half the outer height, the outer becomes a pill. That's allowed only where §3 allows pills. Otherwise, lower the inner radius until the outer fits. In this spec the tightest case is Base 8's segmented control: 12 of a possible 22, so nothing hits the cap.
- **Upper cap for content surfaces:** 24px (Base 8 dialog). Anything rounder starts to look like a phone sheet, not a study tool.

### 2.4 Focus rings

- Use `outline: 2px solid var(--focus); outline-offset: 2px`, the L3 setting. Modern browsers draw the outline following `border-radius` (Chrome 94+, Firefox 88+, Safari 16.4+). The ring's inside edge then has radius `r + 2` and its outside edge `r + 4`, so the ring is itself concentric with the element.
- **Inset items** (menu items, segmented items, nav items, toggle thumb area) have only 4px around them, so an outside ring would collide with the container's curve. EXEC: give those `outline-offset: -2px`. The ring then sits inside the item at radius `max(0, r − 2)`, which stays concentric.
- **Send button in the composer:** 8px gap, so the normal +2 ring fits. Its outside edge sits 4px from the button and 4px inside the composer, still concentric (composer `r+8`, ring `r+4`).
- **Composer and fields:** on focus the 1px line turns to the focus color and the +2 ring appears (`:focus-within` for the composer).
- **RISK:** whether the outline follows `corner-shape` (smooth corners) in Chrome is not verified. If it doesn't, the ring will look round around a smooth button. The page should show it so Oliver can see either result.

### 2.5 Shadows on no-lines surfaces

- `box-shadow` follows `border-radius`. A shadow with spread `s` has corner radius `r + s`. The L3 shadows (`--shadow-1/2/3`) have spread 0 or negative, so they follow the box exactly.
- With no lines, a surface's corner is seen mostly through its **shadow and tone**, not an edge. Below 8px, soft blur hides the corner shape. That's another reason cards should be 8 or more.
- Nesting only shows when the inner thing has a **different fill or its own shadow** (a sand item in a surface menu, a surface item in a sand segmented control, the dark send button in the composer). Two boxes of the same fill don't show their corners. EXEC: every nesting demo gives the inner box a different fill.
- Never use hard offset shadows on this page. They exaggerate corner mismatch.

### 2.6 Worked examples (values per system: Base 4 / Base 8 / Hybrid)

1. **Composer with send button.** Send is 44×44 (band D): 4 / 8 / 8. Gap = 1px line + 7px padding = 8. Composer = 12 / 16 / 16. Composer minimum height = 44 + 8 + 8 = 60; half is 30, so no cap. The attach (+) button at bottom-left uses the same radius and gap.
2. **Sidebar with a nav item.** Today's sidebar is flush to the window edge (no corners of its own), so a nav item just uses its band: 4 / 8 / 8, inset 12px from the sides. Comparison only: a floating sidebar inset 8px from the window would be nav + 8 = 12 / 16 / 16. **REC:** keep the flush sidebar (DESIGN.md protects the shell).
3. **Dialog containing a card containing a button.** Dialog padding 24, card padding 16, button 44: button 4 / 8 / 8; card (token, loose) 8 / 16 / 12; dialog (token, loose) 12 / 24 / 16. Strict everywhere instead: card 20 / 24 / 24 and dialog 44 / 48 / 48. Shown side by side in the lab.
4. **Menu with inset items.** Item 44 tall: 4 / 8 / 8. Menu padding 4. Menu = 8 / 12 / 12. Item focus ring offset −2.
5. **Segmented control** (`Typed | Spoken`). Item 36 tall: 4 / 8 / 4. Inset 4 on all sides, so the control is 44 tall. Control = 8 / 12 / 8.
6. **Card containing an input.** Loose (card padding 16+): card uses its token 8 / 16 / 12, input its band 4 / 8 / 8. Tight version (card padding 8, for a search box or an inline answer field): card = input + 8 = 12 / 16 / 16.
7. **Chat message.** Learner message: 8 / 12 / 12, padding 12 by 16. If it contains a quoted passage inset 4px, the quote is `message − 4` = 4 / 8 / 8, which matches the quote token. Assistant text is unboxed (no corners). Its source quote band uses `--r-quote`.
8. **Toggle (pills obey the formula too).** Track 40×24, radius 12 (pill). Thumb 20, inset 2: thumb radius 10 + 2 = 12. Concentric by construction.
9. **Radio.** Ring 20 (radius 10), dot 8 (radius 4) inset 6: 4 + 6 = 10. Concentric.

---

## 3. Pills and circles

**REC rule: circles only for things that are actually round; everything you press follows the scale.**

| Thing | REC shape | Why |
|---|---|---|
| Avatar | circle | It's a person token; round reads as "person". |
| Radio | circle | Convention; round means "pick one". |
| Number badge, status dot | circle | A single glyph on a round disc. |
| Toggle track and thumb | pill and circle | Convention; and it nests exactly (example 8). |
| Send, attach, icon-only buttons | **scale** (rounded square) | A circle can only nest concentrically in a pill. A rounded-square send fits the composer by the formula. |
| Chips, tags, text badges | **scale** | Keeps "small things are slightly round", which is what Oliver asked for. Pill chips beside 8px buttons recreate the mixed look D-194 rejected. |
| Text buttons | scale | Same reason. |
| Progress segments | scale (tiny) | 2 / 3 / 2; reads as a bar, not beads. |

**The alternative to show (toggle "Pills and circles"):** buttons, chips, text badges, segmented items and the send/attach/icon buttons all become `r-full`. Containers follow the formula, so they become pills too: the composer becomes `22 + 8 = 30` (a capsule at 60px tall) and the segmented control `18 + 4 = 22` (a capsule at 44px). Menus, cards, dialogs, fields and messages stay on the scale. **RISK:** a 30px composer corner looks blobby once the composer grows to 3 or more lines; the lab composer must show a 3-line state so Oliver sees it.

---

## 4. Smooth corners

### 4.1 Plain-language explanation

A normal rounded corner is a quarter of a circle stuck onto a straight edge. Where they meet, the curve starts suddenly, and a trained eye sees a tiny "kink". A **smooth corner** (a "squircle", from the superellipse curve) eases into the bend gradually, the way Apple's app icons and hardware do. At the same radius it looks a little smaller and tighter, with more straight edge and a softer bend.

### 4.2 Browser support (state this carefully on the page)

- CSS has a new property, `corner-shape`. `corner-shape: squircle` (the same as `superellipse(2)`) gives smooth corners on any element with a `border-radius`. It's in **recent Chrome and Edge (Chrome 139 or later, per Chrome's release notes; not checked on Oliver's machine)**.
- **Safari and Firefox:** not known to support it at the time of writing. The page must not depend on it.
- **Fallback:** where unsupported, the property is ignored and the corner stays plain round. Nothing breaks. EXEC: detect with `CSS.supports("corner-shape", "squircle")`. If false, disable the toggle and show: `Your browser can't draw smooth corners yet, so you're seeing plain round ones. Open this page in a recent Chrome to compare.`
- Measured difference (`scratch/corners/calc.mjs`): on the diagonal, a smooth corner bends about 54% as deep as a round one. At radius 4 that's about 0.5px of difference (basically invisible); at 8 about 1.1px; at 16 about 2.1px. **Smooth corners only show at radius 8 or more.**
- Nesting with smooth corners: the same formula still keeps the gap equal along the straight edges. On the bend the gap gets slightly wider, by 0.6px (inner 4, gap 4) to 1.2px (inner 8, gap 16) (`squircle-gap-output.txt`). That's invisible at normal size, so the formula holds.
- Apply `corner-shape` only to scale corners. EXEC: never to circles or pills (`r-full`), because a squircle circle is a different shape.

### 4.3 Does 4 or 8 make concentric corners easier?

The formula works the same for any numbers. The base matters in three practical ways:
1. **Room to nest.** With 8 on controls, there's room for an 8px inset before anything goes square, and inner card + 8 equals the card token. With 4, an 8px card with 8px padding leaves 0 for the inner card, so Base 4 needs a second, bigger card radius.
2. **Smoothness shows only at 8 and up.** At 4px the corner is too small for smooth corners (or even concentric fit) to be seen. If Oliver wants the "very smooth look", the things he touches most need at least 8.
3. **Small things.** Base 8 puts 8 on 32px buttons and 36px chips (a quarter of their height), so they start looking like pills next to 44px buttons. Base 4 keeps small things crisp but leaves large ones nearly square.

The Hybrid takes 8 where it shows (44px controls and up), 4 where 8 would turn things into pills, and 12 to 16 on containers. **That's why it's the REC.**

### 4.4 The lab toggle

A global switch in the sticky bar: `Corners: Plain round | Smooth (where supported)`. It sets `data-smooth="on"` on `<body>`. CSS: `body[data-smooth="on"] .rc { corner-shape: squircle; }`. Every scale-rounded element in the page carries class `rc`; circles and pills carry `rc-full` instead and are excluded. Also add a fixed side-by-side tile in §6.7 (it doesn't depend on the switch): the same 180×120 surface-colored card at radius 16, plain on the left and smooth on the right, plus the same pair at radius 8 and 4.

---

## 5. Component inventory for the lab

Every component appears in all three systems side by side (§6.4). Sizes S/M/L as listed. Fills follow L3 no lines (§6.2 variables). Copy is real clarity copy; never lorem. No em dashes in page copy.

| # | Component | Sizes | Construction and copy |
|---|---|---|---|
| 5.1 | Buttons: primary (ink fill, paper text), secondary (sand fill), ghost (no fill; sand on hover) | 32 / 40 / 44 / 48 (L adds 56 in the size ladder) | Padding `0 12px` (32), `0 16px` (40, 44), `0 20px` (48, 56). 15px/600 (14px at 32). Copy: primary `Start studying`, secondary `Back`, ghost `Finish session`. |
| 5.2 | Icon-only button | 32 / 40 / 44 | Quiet (sand on hover), plus icon (inline `+` glyph). `aria-label="Attach material"`. |
| 5.3 | Text input (1px `--line`) | 36 / 44 / 48 | Label `Email address`, placeholder `you@school.edu`. Show rest, focused (`is-focus`) and error (line `--danger`, message `Enter a full email address, like name@school.edu.`). |
| 5.4 | Textarea (1px line) | min 96 | Label `Explain it in your own words`, value `The terms shrink, but adding them up can still grow without limit.` |
| 5.5 | Select | 36 / 44 / 48 | Label `Subject`, value `Calculus II: series`, chevron glyph right. Draw as a styled button-like box (not a native select, so the corner shows in every browser). |
| 5.6 | Checkbox | 20 | Checked and unchecked; label `Include Lecture 7 slides`. Hit area 44 tall. |
| 5.7 | Radio (circle) | 20 | Group `How do you want to start?`: `Start with recall` (selected), `Start with a short primer`. |
| 5.8 | Toggle | track 40×24 | Label `Spaced review reminders`, on and off. |
| 5.9 | Chips / tags | 24 / 28 / 32 / 36 | Choice chips `In 2 weeks`, `In 1 week`, `Tomorrow` (one selected: accent-soft fill, accent-text). Tags `Lecture 7`, `Series`. |
| 5.10 | Badges | 20 | Text badges `Supplied`, `Generated`, `Cannot verify`; number badge `3` (circle). |
| 5.11 | App icon tile | 16 / 32 / 64 / 180 | `c.` monogram, ink `c` on panel fill, dot in placeholder accent. Preview radius `round(size × 0.2237)` = 4 / 7 / 14 / 40, smooth when the toggle is on. Note on the page: `On iPhone, the system cuts the corners itself. The real icon file is a plain square; this rounding is only a preview.` Same in all three systems (the OS decides). |
| 5.12 | Segmented control | 44 (items 36, inset 4) | `Typed | Spoken`, `Typed` selected (surface fill + `--shadow-1`, inside a sand control). |
| 5.13 | Tooltip | 28 | `Attach material`, ink fill, paper text, 13px, padding `0 8px`. No arrow (arrows complicate corners; note this). |
| 5.14 | Menu with inset items | items 44, padding 4 | Items `Rename subject`, `Export notes`, `Delete subject` (danger text). Second item hovered (sand), third focused (inset ring). Surface + `--shadow-3`. |
| 5.15 | Dialog | 480 wide, padding 24 | Title `Finish this session?`, body `You answered 6 of 9 prompts. Your place is saved, so you can pick up here next time.`, inner card (5.16) and buttons `Keep studying` (secondary) and `Finish session` (primary). |
| 5.16 | Card | padding 16 | `Lecture 7 slides`, meta `24 slides · Approved`, tag `Supplied`. |
| 5.17 | Nested card | outer padding 8, inner cards | Outer `Today's plan` card (panel fill) containing two inner surface cards: `Quick recall · 9 prompts` and `Teach back · your shaky topics`. |
| 5.18 | Sidebar with active nav | 248 wide, rows 44 | Wordmark `clarity.`, `Switch subjects`, primary `New subject`, nav `Materials`, **`Study` (active: placeholder accent fill)**, `Branches`. Round icons `materials`, `study`, `branch`, `resume`. |
| 5.19 | Study composer with send | 720 wide, min 60 | Placeholder `Message clarity`; attach (+) bottom-left, send (round icon `send`) bottom-right, both 44, 8 from the edges. Show one-line and three-line states. Below: `clarity can be wrong. Check it against your sources.` (13px muted). |
| 5.20 | Learner message | max 85% | `I think so? The terms shrink toward zero, so the total should settle on some number.` Second message with an inset quote: quote `Lecture 7 slides, slide 14: "The harmonic series diverges."` then `Wait, so shrinking terms aren't enough?` |
| 5.21 | Assistant block | unboxed | Label `clarity` (accent-text, 14/650); text `What would make that total keep growing even though each step gets smaller?`; source band (`--r-quote`, panel fill) `Generated recall prompt · Lecture 7 slides · Slide 14` with `source` icon. |
| 5.22 | Progress segments | 6 tall | 4 segments, 2 filled (ink), 2 empty (sand); labels `Concepts`, `Exam date`, `Study time`, `Plan`. |
| 5.23 | Toast | 56 tall, padding 8 | `Lecture 7 slides added.` with button `Review` (40 tall, secondary). Ink fill, paper text; button uses paper-on-ink variant (fill `rgb(255 255 255 / .12)`). |
| 5.24 | Avatar | 28 / 32 / 40 | `O`, circle, panel fill. |

---

## 6. Page design: `corners.html`

### 6.1 Technical rules (EXEC)

- One self-contained file at `docs/brand-exploration/corners.html`. Inline `<style>` and one inline `<script>` at the end. No CDN, no network, no `fetch()`. Works from `file://`.
- Font, copied from `index.html`: `@font-face{font-family:"Geologica";src:url("assets/fonts/Geologica-variable-latin.woff2") format("woff2");font-weight:100 900;font-display:swap}`. Stack `"Geologica","Avenir Next","Segoe UI",Arial,sans-serif`. Set `font-variation-settings:"SHRP" 100` on `body` (settled).
- Icons: `<script src="assets/icons/icons.js"></script>` before the inline script. Use `<i class="ic" data-icon="study"></i>` and copy `index.html`'s `hydrate()` (lines ~804-811) with the set fixed to `round`. If `window.CLARITY_ICONS` is missing, show the dashed-box fallback (`.ic-missing`, as in index.html). Available names: `study, materials, branch, recall, explain, teach-back, exam-date, time, progress, resume, help, finish, source, send`. For plus, chevron, check and close, use small inline SVGs (1.5 stroke, round caps), as `index.html` does for `GL.plus`.
- Do not load or edit `index.html`; copy what you need. Do not touch `assets/`.
- Same page chrome as `index.html`: sticky 56px top nav with `clarity.` wordmark and anchor links, `.wrap` max 1240px with 48px side padding, `section{padding:80px 0 24px}`, h1/h2/h3 sizes, `.lead`, `.tiny`, `.cap`. Page chrome itself uses Hybrid radii (its cards 12, buttons 8).
- Accessibility: one `h1`, section `h2`s, labels on every control, slider readouts in `<output>` with `aria-live="polite"`, visible focus, `prefers-reduced-motion` respected (no transitions).
- Below 900px wide, stack comparison columns.
- Plain language for a non-technical reader. No em dashes, no lorem, no `http` except `xmlns`.

### 6.2 Placeholder color (neutral, labelled)

Color is undecided, so mocks use ink-on-paper with one muted slate accent. Every section that shows the accent carries a small tag: `placeholder color`. The page intro says: `Color isn't chosen yet, so everything here is ink on paper with one gray-blue stand-in. Judge the shapes, not the color.`

| Variable | Value | Use |
|---|---|---|
| `--paper` | `#faf9f7` | Canvas |
| `--panel` | `#efece8` | Sidebar, quiet bands, nested-card outer |
| `--sand` | `#e7e3de` | Secondary button, hover, learner message, segmented track |
| `--surface` | `#ffffff` | Cards, composer, menu, dialog |
| `--ink` | `#211816` | Text, primary button, tooltip, toast |
| `--muted` | `#5d4f4a` | Secondary text |
| `--hairline` | `#e3e0dc` | Composer line only (as in L3) |
| `--line` | `#8a847e` | The 1px field line |
| `--accent` | `#c8d3dc` | **Placeholder**: active nav, selected chip ring, send button fill |
| `--accent-soft` | `#e6ecf1` | **Placeholder**: selected chip fill |
| `--accent-text` | `#3e5466` | **Placeholder**: `clarity` speaker label, links |
| `--focus` | `#211816` | Focus ring |
| `--danger` | `#a52a24` | Errors |

Contrast (`scratch/corners/contrast-neutral.txt`): ink on paper 16.54; ink on accent 11.44; accent-text on paper 7.49 and on accent-soft 6.62; field line on surface 3.70, on paper 3.51, on panel 3.14 (all at least 3:1); muted on panel 6.65. Shadows: copy L3's `--shadow-1/2/3` from `index.html` lines 92-94 but with a neutral base `rgb(33 24 22 / …)`.

Primary buttons are ink fill with paper text. The send button uses `--accent` fill with ink icon, so the placeholder accent appears only where the real accent will go.

### 6.3 Theming contract

Each system wrapper: `<div class="sys rc-scope" data-sys="b4|b8|hy">`. Global switches on `<body>`: `data-smooth="off|on"`, `data-pill="scale|full"`, `data-strict="off|on"`.

```css
.sys[data-sys=b4]{--r-a:2px;--r-b:2px;--r-c:4px;--r-d:4px;--r-e:8px;--r-message:8px;--r-quote:4px;--r-card:8px;--r-card-in:4px;--r-dialog:12px}
.sys[data-sys=b8]{--r-a:4px;--r-b:4px;--r-c:8px;--r-d:8px;--r-e:12px;--r-message:12px;--r-quote:8px;--r-card:16px;--r-card-in:8px;--r-dialog:24px}
.sys[data-sys=hy]{--r-a:2px;--r-b:4px;--r-c:4px;--r-d:8px;--r-e:12px;--r-message:12px;--r-quote:8px;--r-card:12px;--r-card-in:4px;--r-dialog:16px}
.sys{
  /* derived with the formula; never hard-code these */
  --r-progress:min(var(--r-a),3px);
  --r-menu:calc(var(--r-d) + 4px);
  --r-seg:calc(var(--r-seg-item) + 4px);
  --r-composer:calc(var(--r-send) + 8px);
  --r-toast:calc(var(--r-d) + 8px);
  --r-card-out:calc(var(--r-card-in) + 8px);
  --r-send:var(--r-d); --r-chip-s:var(--r-b); --r-chip-l:var(--r-c); --r-seg-item:var(--r-c);
}
body[data-pill=full] .sys{--r-send:22px;--r-chip-s:999px;--r-chip-l:999px;--r-seg-item:18px}
body[data-smooth=on] .rc{corner-shape:squircle}
```

- Buttons use `--r-c` (32), `--r-d` (40/44/48), `--r-e` (56) via size classes `.h32 .h40 .h44 .h48 .h56`. In pill mode, buttons and icon buttons use `border-radius:999px` via `body[data-pill=full] .sys .btn{border-radius:999px}`.
- In pill mode the segmented control radius becomes `18 + 4 = 22px` automatically, because `--r-seg` reads `--r-seg-item`. EXEC: keep it that way so pill mode stays concentric.
- `data-strict="on"` only affects the §6.6 dialog example (card `calc(var(--r-d) + 16px)`, dialog `calc(var(--r-d) + 40px)`); everything else is already strict for close gaps.
- EXEC: every element with a scale radius gets `class="rc"`; circles and pills (`avatar`, `radio`, `toggle`, number badge, pill-mode controls) get `rc-full` and no `corner-shape`. In pill mode, add `rc-full` to the affected elements in JS when the switch changes (or exclude them with `body[data-pill=full] .btn{corner-shape:round}`).
- EXEC: a radius label next to each demo element shows its **computed** value, read with `getComputedStyle(el).borderTopLeftRadius` after each switch change. Never type the numbers into the HTML; that's how the labels stay honest.

### 6.4 Section order

Sticky bar (below the top nav or merged into it on the right): three switches as segmented controls built from 5.12: `Smooth corners: Off | On`, `Small round things: Follow the scale | Pills and circles`, and in §6.6 only, `Nesting: Close gaps only | Strict everywhere`. Top nav links: `Why` · `Systems` · `Components` · `Nesting` · `Sizes` · `Smooth` · `Screens` · `Zoom` · `My pick` · `Questions`.

1. **Cover** (`#top`). Kicker `Corner lab · October 28, 2026 · planning only`. H1 `Corners that fit together`. Lead: `Three ways to round clarity's corners, shown on every button, field and panel. Small things get small corners, big things get bigger ones, and anything inside something else is rounded to fit it exactly.` Note: `Nothing in the app has changed. Color isn't chosen yet, so everything here is ink on paper with one gray-blue stand-in.` A small "My pick: Hybrid" card with the Study composer rendered in Hybrid.

2. **What corners are and why the formula** (`#why`). Three short blocks with a tiny diagram each (inline SVG, 240×160):
   - `Radius` : `How round a corner is, in pixels. 0 is square. Half the height is a pill.`
   - `Bigger things, rounder corners` : `A 4px corner on a 32px chip looks like an 8px corner on a 44px button. Scaling the corner with the size keeps them looking like one family.`
   - `Inside something else: outer = inner + gap` : `When a button sits inside a box, the box's corner should be the button's corner plus the space between them. Then the gap stays the same width all the way around the bend.` Diagram: inner 8, gap 8, outer 16 with the shared center dot and two arcs.

3. **The three systems** (`#systems`). Three columns (Base 4, Base 8, Hybrid with a `My pick` badge). Each: the one-line feel (§1.2), the token row as labelled swatch squares (40×40 surface tiles with shadow-1 showing 2, 4, 8, 12, 16, 24), and the band table for that system. Then the full §1.3 table in a `<details>` titled `Every number`.

4. **Every component, side by side** (`#components`). For each component in §5 (5.1 to 5.24), one row: label at left (component name and size), then three cells (Base 4, Base 8, Hybrid), each with the component rendered at real size (scale 1) and the computed radius label under it (e.g. `8px`). Group with h3s: `Buttons`, `Fields`, `Choices`, `Small labels`, `Containers`, `Study`, `Icons and avatars`. Buttons show all three variants at all four heights in each cell (a 3×4 mini grid).

5. **Nesting lab** (`#nesting`), live:
   - Controls (each a labelled `<input type="range">` with `<output>`): `Inner corner` 0 to 24 (step 1, default 8), `Gap` 0 to 32 (step 1, default 8), `Outer corner` 0 to 56 (step 1). Checkbox `Use the formula` (default on): when on, the outer slider is disabled and follows `inner + gap`.
   - Demo: an outer surface box (fill surface, `--shadow-2`) 320×200 with an inner ink box positioned `gap` px from the bottom-right (inner size 120×72). Large enough to see. Corner shape follows the smooth switch.
   - Readout (aria-live): `Edge gap: 8px. Gap at the corner: 8.0px. Even.` using the §2.1 diagonal formula and verdicts. Color-free: a filled check icon for even, a warning glyph otherwise.
   - Presets row (buttons): `Composer and send`, `Menu item`, `Segmented control`, `Toggle`, `Same corner on both (wrong)`, `Outer too round (wrong)`. Each sets the sliders.
   - Right vs wrong, static, three columns at Hybrid values: `Same radius both (wrong)` inner 8 / outer 8 / gap 8; `Formula (right)` 8 / 16 / 8; `Too round outside (wrong)` 8 / 28 / 8. Caption under each in plain words.
   - Worked examples: the nine examples from §2.6 rendered small, each with its sum shown as text (`Send 8 + gap 8 = composer 16`), switching numbers with a three-way tab (`Base 4 | Base 8 | Hybrid`).
   - The dialog example with the `Nesting` switch: `Close gaps only` (tokens) vs `Strict everywhere` (24 and 48).

6. **Size ladder** (`#sizes`). Three rows (one per system). Each row: the primary `Start studying` button at 32, 40, 44, 48 and 56px, then the icon-only button at 32/40/44, then chips at 24/28/32/36. Under each, the computed radius and `radius ÷ height` as a percent (e.g. `8px · 18%`). Caption: `Look for the step where corners jump. In Hybrid it's between 32 and 40; that's on purpose, so small buttons don't turn into pills.`

7. **Smooth corners** (`#smooth`). The §4.1 explanation in three sentences, the support note (§4.2), and the fixed plain-vs-smooth pairs at 16, 8 and 4 (§4.4). If unsupported, the smooth tiles still render (as round) and carry the unsupported note. Then the reminder: `The switch at the top turns smooth corners on across the whole page.`

8. **Full screens** (`#screens`). Tabs `Study`, `Sign in`, `Materials step`. Each tab shows the screen three times (Base 4, Base 8, Hybrid) in three columns, built at design size and scaled to fit (copy `index.html`'s `fit()` approach: absolute `.look`-style box, `transform: scale(colWidth / designWidth)`, frame height = designHeight × scale). A `Show one large` select below the tabs shows the chosen system at full column width.
   - **Study** (1200×760): sidebar 5.18, header `Calculus II: series` with chip `Exam Thu, Nov 12` and ghost `Finish session`, thread 5.21 + 5.20 + 5.21 (second line), composer 5.19 (one line).
   - **Sign in** (1000×560): one surface card (`--r-card`, shadow-2), left half panel fill with H2 `Learn it by teaching it.` and body from SPEC.md §6.7; right half `Sign in`, secondary full-width `Continue with Google` (copy the four-color G from `index.html` `GL.google`), `or`, the 44px email field, primary full-width `Continue`, `New to clarity? Create an account`. EXEC: the left panel's outer corners equal the card's radius (`border-radius: var(--r-card) 0 0 var(--r-card)`), not their own.
   - **Materials step** (720×520): progress 5.22, `Step 2 of 4`, H2 `When is your exam?`, body `We'll fit your plan to the days you have left.`, 44px date field `Thu, Nov 12, 2026` with `exam-date` icon, chips 5.9 (36px), helper `15 days left · about 6 hours of study time` with `time` icon, footer secondary `Back` and primary `Next`.

9. **Zoom** (`#zoom`). Shows the composer's bottom-right corner with the send button, enlarged 4×. Two panes per system (three rows: Base 4, Base 8, Hybrid):
   - **Real zoom:** a 120×90 window (`overflow:hidden`) onto a real composer, with the inner element scaled `transform: scale(4)` from its bottom-right corner. Text is vector, so it stays sharp. Follows the smooth switch.
   - **Diagram:** inline SVG at 4× drawn from the computed values: the outer arc (radius R), the inner arc (radius r), both centers as one shared dot, two dashed 8px gap markers (one on the straight edge, one on the diagonal), and labels `send 8`, `gap 8`, `composer 16`. Under it: a "wrong" copy with the composer at the send's radius, showing the fat gap at the bend.

10. **My pick** (`#pick`). §7 below, as short paragraphs with the three reasons as a numbered list and a small Hybrid specimen (button set, field, composer, card).

11. **Open questions** (`#questions`). §8 below as cards: question, why it matters (one line), `My recommendation`.

12. **Footer.** `Made Oct 28, 2026. Planning only; nothing in the app changed. Numbers come from scratch/corners/systems.mjs.`

### 6.5 Executor check budget

Build phase; minimal checks only:
- Tag balance with a small Node script (or `xmllint --html --noout corners.html` if available).
- `grep -c 'http' corners.html` returns only `xmlns` lines; `grep -n '—'` and `grep -ni lorem` return nothing.
- Extract the inline script and run `node --check` on it.
- Spot-check five computed labels against §1.3 (Hybrid composer 16, Base 8 dialog 24, Base 4 nested outer 12, Base 8 segmented 12, Hybrid 32px button 4).
- If a browser is permitted, open `file://` once and screenshot `#components` and `#zoom`; otherwise report `not visually checked`. Do not start servers.

---

## 7. Recommendation

**REC: Hybrid.** 4px grid; 4 on small controls (under 37px), **8 on the 40 to 48px controls clarity uses most**, 12 on cards, messages and menus, 16 on the composer and dialogs, formula-computed for everything nested.

Why:
1. **It does what Oliver asked, literally.** Small things are slightly round, big things rounder, and every inset thing fits by the formula. Hybrid scales from 2 (progress) through 4 (small controls), 8 (standard controls), 12 (cards, menus) to 16 (composer, dialog), and no control radius goes above 21% of its height (a pill is 50%), so nothing looks like a pill by accident.
2. **It gets the smooth look where it shows.** Smooth corners and concentric fit are visible from 8px up. Nearly everything Oliver touches in clarity is 44px (nav, buttons, fields, send), and those get 8. Base 4 leaves them at 4, where a corner barely reads.
3. **Nesting stays simple.** Inner card 4 + 8 = card 12; send 8 + 8 = composer 16; item 8 + 4 = menu 12. One card radius covers both plain and nested cards, unlike Base 4.
4. **It stays "exact and constructed".** Dialogs at 16 rather than Base 8's 24, and 32px controls at 4 rather than 8, keep it away from the pillowy chat-app look.

Runner-up: **Base 8**, if Oliver wants every control to look the same at every size. Its catch is that small chips and 32px buttons look nearly pill-shaped next to 44px buttons. **Base 4** is the pick only if he finds 8 too soft once he sees it; it's the closest to today's square look.

---

## 8. Open questions (with recommended answers)

1. **Which system?** REC: Hybrid. If 44px buttons at 8 feel too soft, try Base 4; if 4px chips feel too sharp, try Base 8.
2. **Use the formula across big gaps too (a card's 16px padding, a dialog's 24px)?** REC: no. Use it for gaps of 12px or less, where your eye compares the curves. Strict everywhere makes dialogs 48px round (see the Nesting switch).
3. **Send button: rounded square or circle?** REC: rounded square on the scale, so it fits the composer by the formula. A circle needs a capsule-shaped composer (the "Pills and circles" switch).
4. **Chips: on the scale or pills?** REC: on the scale. Pill chips next to 8px buttons bring back the mixed look.
5. **Smooth corners?** REC: turn them on wherever the browser supports them, as a bonus. Plain round is what Safari users will see, so it has to look right on its own.
6. **Sidebar: flush to the edge (today) or floating with its own corners?** REC: flush. It's the familiar layout, and DESIGN.md protects the shell.
7. **Does the round icon set still fit?** Its box corners are 2.5px at 24px (about 2px at 20px). That sits between Hybrid's 2 and 4. REC: keep it; check it next to the 32px icon buttons in the lab.

---

## 9. Known risks and limits

- No browser was used to write this spec. The looks are specified, not seen.
- `corner-shape` support is stated from Chrome's release notes as I know them, not tested here. Safari and Firefox support is unknown. The page must look right without it.
- Whether focus outlines follow `corner-shape` is unverified (§2.4).
- The placeholder slate accent is not a color proposal. The page must label it, so it isn't mistaken for one.
- The composer's hairline is under 3:1 (same as L3 and today). Unchanged here.
- Adopting any system later needs a new decision superseding D-009 and D-194, and updates to `AGENTS.md`, `DESIGN.md`, `.pi/memory/product-preferences.md` and `src/app/globals.css` radius tokens in the same change. Nothing in this lab changes that.
