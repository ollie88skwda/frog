# Frog brand system (Because green / Fern)

Frog uses Because's green system. Reference copies (read-only): `because-reference/BRAND-FINAL-SPEC.md` and `because-reference/CORNERS-SPEC.md`.

- Tokens: `apps/web/src/styles/theme.css` (`[data-theme="green"][data-mode="day|night"]` on `<html>`, Device/Day/Night choice persisted).
- Font: Geologica only (`apps/web/public/fonts/`, `SHRP 100`). Icons: Phosphor Regular, no lucide.
- Corners: 4/8/12/16/24; nested outer = inner + gap (gap <= 12). No lines anywhere except the 1px text-field line.
- Kept from old Frog: the frog mark only (`apps/web/public/icon.svg`, `assets/frog-mark.svg`).
- Old identity (grass/sage, 0px radius) is archived in `archive/` — not live.

## App structure and data kit (redesign, 2026-11-13)

- Screens: four tabs (Today / Plan / Progress / You) plus the workout takeover. Route map and rules: `AGENTS.md` "App structure"; spec: the redesign plan sections 7 and 8, recorded in `docs/DECISIONS.md`.
- Data components (`apps/web/src/components/data/`): rows, not cards, for density; numbers in `.num`; deltas inside the 10% noise band render neutral. Day and night samples of every component are on the dev-only `/dev/data-kit` route.
- Color meaning: Fern green = progress or on track, neutral = within noise (the default look), amber (`--color-attn*` in `theme.css`) = attention (over band, stalled, caution), red = errors, destructive actions and medical red flags only. Fern 8/9 never carries a data mark.
- The frog voice lives only at the edges (empty states, toasts, PR moments, 404); logging and statistics copy stays plain. Banned claims are enforced by `e2e/copy-claims.spec.ts`.
- Phone first: review screens at 390x844; the brand sweep is `e2e/qa-visual.spec.ts` (`QA_VISUAL=1`).
