# Fix for items 6 and 8 (2026-11-25 UX batch, verifier said partial)

The frames come from `e2e/session-fix68-evidence.spec.ts`. The same steps ran on `origin/workshop` @ `40857a0` (`UX_SHOTS=before`) and on branch `fm/frog-ux-fix68` (`UX_SHOTS=after`), against a local Convex backend. The spec also writes the measured geometry and computed colours to the `*-measure-*.json` files next to the frames. Ratios are WCAG 2.x contrast, computed from the hex values the browser resolved, using the same formula as `apps/web/src/components/data/contrast.test.ts`.

## Item 6: the logging panel attaches to the Now set

**What moved where**
- The live **Now row is no longer drawn in the list**. It is now the entry panel's own top band: a full-width `accent-soft` strip on the panel's rounded top edge, holding the set badge, "Now ⌄", the last-time hint and the panel's ✎ / ⋯ buttons. The panel no longer has a separate "Set N · now" header line; `set-number` is kept as screen-reader text for tests and assistive tech. Rendered by `SetRows variant="tab"` through Spotlight's new `tab` slot (`apps/web/src/screens/session.tsx`). The Now row and the panel are the same element, so no gap can open between them.
- Everything under the exercise title is **bottom-anchored as one cluster** (setup & form, set result, done/to-go line, logged sets): the scroll area became a flex column, and the cluster has `mt-auto`. The logged sets sit directly on the panel. Any spare height ends up under the title, never between the sets and the panel.
- **"+ Add a set" moved** from below the list to the right end of the "N of M sets done" line. That keeps the Now row as the last row, with the button still one tap away (44px, filled).
- The "Up next" ghost rows the batch had added were removed. Planned sets are counted in "N of M · K to go" instead, so the top section still says where you are at every set count, including set 3 of 3 (`6-set3of3-*`).
- Editing a tapped past set is unchanged: the row keeps its ring in the list, and the panel shows "Set N · editing" with no tab.

**Measured** (px; `gap` = panel top − bottom of the Now row; negative means the Now row is inside the panel; `max empty` = the largest empty run anywhere in the scroll area above the panel)

| state | before gap | after gap | after max empty | frames |
|---|---|---|---|---|
| 390x844 set 2 of 2, day | **233** | −50 (inside) | 129 (under the title) | `6-set2of2-390-day-{before,after}.png` |
| 390x844 set 2 of 2, night | **233** | −50 | 129 | `6-set2of2-390-night-*` |
| 390x844 set 3 of 3, day | **184** | −50 | 79 | `6-set3of3-390-day-*` |
| 390x844 per-side open, day/night | 12 | −50 | 0 | `6-perside-390-{day,night}-*` |
| 360x640 set 2 of 2, day/night | 118 | −46 | 23 | `6-set2of2-360-*` |
| 360x640 set 3 of 3, day | 74 | −46 | 0 | `6-set3of3-360-day-*` |
| 360x640 per-side open, day/night | −77 (panel covered the row) | −46 | 0 | `6-perside-360-*` |

Space between the last logged set and the panel is now 0 in every state. At 390x844 with only one or two logged sets, the leftover height (129px at most) sits under the exercise title, above the setup row, so it is not between the set and the panel. In the before frame at 360x640 with per-side open, the panel overlapped the Now row. After the fix, the Now row is the panel's header and is always visible.

## Item 8: per-side cells in the set list and the summary

**What moved where**
- New `SideCell` (`apps/web/src/components/session/side-cell.tsx`) is the one per-side cell, used by the set-list pair row (`set-mark-N-sides`) and the item-7 summary tile (`sets-done-N-sides`). The two can't disagree.
- Each side is a **1px outlined cell** using `--color-border-field`, the text-field line and the one line the brand allows. Each cell has a **solid L/R tag**: `--color-text-secondary` fill with page-colour letters at **13px** bold (previously an 11px tag tinted almost the same as the row).
- The bilateral row is unchanged (no cells). A matched pair still shows a single value plus `L+R`. Tapping the left or right cell still opens that side (`data-pair-right` sits on the R cell; `perside-entry.spec.ts` asserts the "Right reps ruler" opens).

**Measured contrast** (non-text bar: 3:1; text bar: 4.5:1)

| element / background | day before | day after | night before | night after |
|---|---|---|---|---|
| chip fill vs set-list row | **1.11** (`#f7f1e8` on `#fffefb`) | n/a (no tinted fill) | **1.03** (`#1f1b18` on `#221e1c`)¹ | n/a |
| chip fill vs summary tile | **1.00** (`#f7f1e8` on `#f7f1e8`) | n/a | **1.00** (`#1f1b18` on `#1f1b18`) | n/a |
| cell outline vs set-list row (surface) | none | **3.76** (`#8a8276` on `#fffefb`) | none | **4.19** (`#867f79` on `#221e1c`) |
| cell outline vs summary tile (surface-2) | none | **3.38** (on `#f7f1e8`) | none | **4.34** (on `#1f1b18`) |
| cell outline vs row hover | none | **3.03** (on `#ece5da`) | none | **3.89** (on `#292421`) |
| cell outline vs selected row (accent-soft) | none | **3.22** (on `#e0f1de`) | none | **3.29** (on `#263525`) |
| L/R tag fill vs set-list row | 1.11 (tag `#fffefb` on chip) | **7.76** (`#5d4f4a` on `#fffefb`) | 1.03 | **8.82** (`#c4bcb4` on `#221e1c`) |
| L/R tag fill vs summary tile | n/a | **6.97** | n/a | **9.12** |
| L/R tag fill vs hover / selected | n/a | **6.26** / **6.64** | n/a | **8.18** / **6.92** |
| L/R letter vs its tag | 7.45 (11px) | **7.45** (`#fcf9f4` on `#5d4f4a`, 13px) | 8.82 (11px) | **9.67** (`#191513` on `#c4bcb4`, 13px) |
| value text vs cell | 17.25 | **17.25** list / **15.50** summary | 13.43 | **13.43** list / **13.89** summary |

¹ The raw before-night JSON (`8-measure-before.json`, `list-night`) caught the row in the middle of its colour transition, so it reads the day white. The 1.03 above is computed from the night tokens the row settles on (`--color-bg-subtle` `#1f1b18` on `--color-bg-surface` `#221e1c`), which matches the verifier's figure.

Every outline and tag pair clears 3:1 on every fill it can sit on, in both modes. The lowest is 3.03 (day outline on the hover tone, which a phone never shows at rest). `apps/web/src/components/session/side-cell.test.ts` checks all of these pairs against the real `theme.css` tokens, so a later token change that drops one below 3:1 fails `bun run test`.

Frames: `8-day-{before,after}.png`, `8-night-{before,after}.png` (set list row 2 plus the "2 sets logged" summary in the same frame).

## Checks run on the branch

- `bun run typecheck`: clean. `bun run lint`: 0 errors, 1 warning, and that warning (an unused `biome-ignore` at the exercise strip) is already on `workshop`. `apps/web` build + `scripts/check-bundle.ts`: 182.2 kB gz initial (budget 220).
- `vitest` (`apps/web/src/components`): all pass, including 18 new side-cell contrast tests.
- E2E (local Convex, `bun run e2e`): 94 passed, 0 failed, across the session (`session-*`), per-side (`perside-entry`, `bodyweight-perside`, `spotlight-perside`), spotlight (`spotlight-*`), swipe (`session-swipe`) specs plus neighbours (`edit-delete`, `set-types`, `core-loop`, `set-entry-tiles`, `weight-rir`, `today-flow`, `routines`, `lifecycle`, `exercise-types`, `voice-log`, `start-session-offline`).
